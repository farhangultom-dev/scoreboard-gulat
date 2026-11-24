import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middlewares/errorHandler';
import {
  ActivityClockState,
  AgeCategory,
  Corner,
  MatchEvent,
  MatchEventType,
  MatchPhase,
  MatchState,
  TimerState,
  VictoryType,
  WrestlerState,
  WrestlingStyle,
} from '../../../shared/types/match';
import {
  checkDisqualification,
  checkTechnicalSuperiority,
  evaluateTieBreaker,
  getActivityClockDurationMs,
  getBreakDurationMs,
  getPeriodDurationMs,
  recalculateStatsFromEvents,
  suggestEndOfMatchVictory,
} from '../../../shared/engine/uwwRules';
import { getClassificationPoints } from '../../../shared/engine/uwwClassification';
import { advanceBoutResult } from '../../../shared/engine/uwwBracketEngine';
import { mapPrismaBoutToShared } from './bracketService';
import {
  buildScheduleSnapshot,
  computeLiveRemainingMs,
  findNextBoutPreviewForMat,
} from './scheduleService';
import {
  broadcastBracketUpdate,
  broadcastBuzzer,
  broadcastMatchState,
  broadcastScheduleUpdate,
  registerSocketStateProviders,
} from '../socket/scoreboardSocket';

// ============================================================================
// In-Memory Live Cache (RAM Cache untuk respons < 20ms)
// ============================================================================
const activeSessionsByMat = new Map<string, MatchState>();
const matByBoutId = new Map<string, string>();

function normalizeMatKey(matName: string): string {
  return (matName || 'MAT A').trim().toUpperCase();
}

export function getActiveMatState(matName: string): MatchState | null {
  return activeSessionsByMat.get(normalizeMatKey(matName)) ?? null;
}

export function getAllActiveMatStates(): Map<string, MatchState> {
  return activeSessionsByMat;
}

export async function getLiveScheduleSnapshot(options?: {
  matFilter?: string;
  tournamentId?: string;
}) {
  return buildScheduleSnapshot(activeSessionsByMat, options);
}

// Daftarkan state provider ke modul Socket.IO
registerSocketStateProviders({
  getMatState: getActiveMatState,
  getScheduleSnapshot: () => buildScheduleSnapshot(activeSessionsByMat),
});

function createDefaultWrestlerState(name: string, regionCode: string): WrestlerState {
  return {
    name: name || 'TBD',
    countryOrTeam: regionCode || 'INA',
    score: 0,
    cautions: 0,
    passivityCount: 0,
    hasChallenge: true,
    injuryTimer: {
      remainingMs: 120_000,
      isRunning: false,
      lastSyncedAt: null,
    },
    bloodTimer: {
      remainingMs: 240_000,
      isRunning: false,
      lastSyncedAt: null,
    },
  };
}

function extractGroupIdFromNote(note?: string | null): {
  cleanNote?: string;
  groupId?: string;
} {
  if (!note) return {};
  const match = note.match(/^\[GRP:([^\]]+)\](.*)$/);
  if (!match) return { cleanNote: note };
  return {
    groupId: match[1],
    cleanNote: match[2] ? match[2].trim() : undefined,
  };
}

function mapDbEventToSharedEvent(evt: {
  id: string;
  createdAt: Date;
  period: number;
  matchClockMs: number;
  corner: Corner;
  type: MatchEventType;
  points: number;
  note: string | null;
}): MatchEvent {
  const { cleanNote, groupId } = extractGroupIdFromNote(evt.note);
  return {
    id: evt.id,
    timestamp: evt.createdAt.getTime(),
    period: evt.period === 2 ? 2 : 1,
    matchClockMs: evt.matchClockMs,
    corner: evt.corner,
    type: evt.type,
    points: evt.points,
    ...(cleanNote ? { note: cleanNote } : {}),
    ...(groupId ? { groupId } : {}),
  };
}

function freezeTimer(timer: TimerState, now = Date.now()): TimerState {
  if (!timer.isRunning) return { ...timer, lastSyncedAt: null };
  return {
    remainingMs: computeLiveRemainingMs(timer.remainingMs, timer.isRunning, timer.lastSyncedAt, now),
    isRunning: false,
    lastSyncedAt: null,
  };
}

/**
 * Membaca tabel match_sessions dan match_events dari MySQL saat server pertama kali menyala
 * untuk memulihkan pertandingan yang sedang berjalan apabila laptop/proses Node.js sempat restart.
 */
export async function hydrateActiveSessionsFromDb(): Promise<number> {
  activeSessionsByMat.clear();
  matByBoutId.clear();

  const sessions = await prisma.matchSession.findMany({
    where: {
      matName: { not: null },
    },
    include: {
      bout: {
        include: {
          redAthlete: true,
          blueAthlete: true,
          division: true,
          matchEvents: {
            where: { isUndone: false },
            orderBy: { sequenceNo: 'asc' },
          },
        },
      },
    },
  });

  for (const sess of sessions) {
    if (!sess.matName) continue;
    const matKey = normalizeMatKey(sess.matName);
    const bout = sess.bout;

    const style: WrestlingStyle = bout.division?.style ?? 'FS';
    const ageCategory: AgeCategory = bout.division?.ageCategory ?? 'SENIOR';
    const weightClass = bout.division?.weightClass ?? '74 KG';
    const periodDuration = getPeriodDurationMs(ageCategory);

    const events: MatchEvent[] = bout.matchEvents.map(mapDbEventToSharedEvent);
    const redStats = recalculateStatsFromEvents(events, 'RED');
    const blueStats = recalculateStatsFromEvents(events, 'BLUE');

    const savedRed = (sess.redStateJson as unknown as Partial<WrestlerState>) || {};
    const savedBlue = (sess.blueStateJson as unknown as Partial<WrestlerState>) || {};

    const defaultRed = createDefaultWrestlerState(
      bout.redAthlete?.name || bout.redManualName || 'RED WRESTLER',
      bout.redAthlete?.regionCode || bout.redManualRegion || 'RED'
    );
    const defaultBlue = createDefaultWrestlerState(
      bout.blueAthlete?.name || bout.blueManualName || 'BLUE WRESTLER',
      bout.blueAthlete?.regionCode || bout.blueManualRegion || 'BLUE'
    );

    const red: WrestlerState = {
      ...defaultRed,
      ...savedRed,
      score: redStats.score,
      cautions: redStats.cautions,
      passivityCount: redStats.passivityCount,
    };

    const blue: WrestlerState = {
      ...defaultBlue,
      ...savedBlue,
      score: blueStats.score,
      cautions: blueStats.cautions,
      passivityCount: blueStats.passivityCount,
    };

    const mainClock: TimerState = (sess.mainClockJson as unknown as TimerState) || {
      remainingMs: periodDuration,
      isRunning: false,
      lastSyncedAt: null,
    };

    const breakClock: TimerState = (sess.breakClockJson as unknown as TimerState) || {
      remainingMs: getBreakDurationMs(),
      isRunning: false,
      lastSyncedAt: null,
    };

    const activityClock: ActivityClockState =
      (sess.activityClockJson as unknown as ActivityClockState) || {
        remainingMs: getActivityClockDurationMs(),
        isRunning: false,
        lastSyncedAt: null,
        activeCorner: null,
      };

    const nextBoutPreview = await findNextBoutPreviewForMat(matKey, bout.id);
    const effectiveBoutNumber = await resolveEffectiveBoutNumber(
      prisma,
      bout,
      matKey
    );

    const state: MatchState = {
      version: sess.version,
      metadata: {
        matName: matKey,
        boutNumber: `BOUT ${effectiveBoutNumber}`,
        style,
        ageCategory,
        weightClass,
        round: bout.round,
        activeBoutId: bout.id,
      },
      phase: sess.phase,
      mainClock,
      breakClock,
      activityClock,
      red,
      blue,
      events,
      activeChallengeCorner: sess.activeChallengeCorner ?? null,
      winner:
        bout.status === 'COMPLETED' && bout.winnerCorner && bout.victoryType
          ? { corner: bout.winnerCorner, type: bout.victoryType }
          : null,
      activeBoutId: bout.id,
      nextBoutPreview,
    };

    activeSessionsByMat.set(matKey, state);
    matByBoutId.set(bout.id, matKey);
  }

  if (sessions.length > 0) {
    console.log(
      `🔄 [Recovery] Berhasil memulihkan ${sessions.length} sesi pertandingan aktif dari MySQL.`
    );
  }

  return sessions.length;
}

/**
 * Memastikan partai yang dimuat ke matras selalu memiliki nomor urut (boutNumber >= 1).
 * Jika di database masih NULL (misal belum klik Generate Master Order), otomatis dihitung
 * berdasarkan urutan kronologis pada matras terkait lalu disimpan ke MySQL.
 */
async function resolveEffectiveBoutNumber(
  db: Prisma.TransactionClient | typeof prisma,
  bout: {
    id: string;
    tournamentId: string | null;
    boutNumber: number | null;
    roundOrder: number;
    bracketPosition: number;
  },
  matKey: string
): Promise<number> {
  if (bout.boutNumber && bout.boutNumber > 0) {
    return bout.boutNumber;
  }

  let computed = 1;
  if (bout.tournamentId) {
    const matBouts = await db.bout.findMany({
      where: {
        tournamentId: bout.tournamentId,
        matName: matKey,
      },
      select: {
        id: true,
        boutNumber: true,
        roundOrder: true,
        bracketPosition: true,
      },
      orderBy: [{ roundOrder: 'asc' }, { bracketPosition: 'asc' }],
    });

    const maxExisting = matBouts.reduce(
      (max, b) => (b.boutNumber && b.boutNumber > max ? b.boutNumber : max),
      0
    );

    if (maxExisting > 0) {
      computed = maxExisting + 1;
    } else {
      const idx = matBouts.findIndex((b) => b.id === bout.id);
      computed = idx >= 0 ? idx + 1 : 1;
    }
  }

  await db.bout.update({
    where: { id: bout.id },
    data: { boutNumber: computed },
  });

  return computed;
}

/**
 * Helper untuk mengambil state aktif dari RAM atau melakukan hidrasi on-demand dari MySQL.
 */
async function ensureSessionLoaded(boutId: string): Promise<{
  matKey: string;
  state: MatchState;
}> {
  const cachedMat = matByBoutId.get(boutId);
  if (cachedMat) {
    const cachedState = activeSessionsByMat.get(cachedMat);
    if (cachedState && cachedState.activeBoutId === boutId) {
      return { matKey: cachedMat, state: cachedState };
    }
  }

  await hydrateActiveSessionsFromDb();
  const hydratedMat = matByBoutId.get(boutId);
  if (hydratedMat) {
    const hydratedState = activeSessionsByMat.get(hydratedMat);
    if (hydratedState) {
      return { matKey: hydratedMat, state: hydratedState };
    }
  }

  throw new AppError(
    404,
    `Partai (${boutId}) belum dimuat ke matras aktif. Panggil POST /api/bouts/:id/load terlebih dahulu.`
  );
}

/**
 * Helper untuk menyimpan snapshot MatchState ke tabel match_sessions di MySQL.
 */
async function persistSessionSnapshot(
  tx: Prisma.TransactionClient,
  boutId: string,
  matKey: string | null,
  state: MatchState
): Promise<void> {
  await tx.matchSession.upsert({
    where: { boutId },
    create: {
      boutId,
      matName: matKey,
      version: state.version,
      phase: state.phase,
      mainClockJson: state.mainClock as unknown as Prisma.InputJsonValue,
      breakClockJson: state.breakClock as unknown as Prisma.InputJsonValue,
      activityClockJson: state.activityClock as unknown as Prisma.InputJsonValue,
      redStateJson: state.red as unknown as Prisma.InputJsonValue,
      blueStateJson: state.blue as unknown as Prisma.InputJsonValue,
      activeChallengeCorner: state.activeChallengeCorner,
    },
    update: {
      matName: matKey,
      version: state.version,
      phase: state.phase,
      mainClockJson: state.mainClock as unknown as Prisma.InputJsonValue,
      breakClockJson: state.breakClock as unknown as Prisma.InputJsonValue,
      activityClockJson: state.activityClock as unknown as Prisma.InputJsonValue,
      redStateJson: state.red as unknown as Prisma.InputJsonValue,
      blueStateJson: state.blue as unknown as Prisma.InputJsonValue,
      activeChallengeCorner: state.activeChallengeCorner,
    },
  });
}

/**
 * 1. POST /api/bouts/:id/load
 * Memuat partai ke match_sessions pada mat_name terkait, mengubah status menjadi IN_PROGRESS,
 * menandai partai SCHEDULED pertama berikutnya pada matras yang sama menjadi ON_DECK,
 * serta mem-broadcast match:state_update dan schedule:update.
 */
export async function loadBoutToSession(
  boutId: string,
  options?: { matName?: string; forceReplace?: boolean }
): Promise<MatchState> {
  const { matKey, state } = await prisma.$transaction(async (tx) => {
    const bout = await tx.bout.findUnique({
      where: { id: boutId },
      include: {
        redAthlete: true,
        blueAthlete: true,
        division: true,
        matchSession: true,
        matchEvents: {
          where: { isUndone: false },
          orderBy: { sequenceNo: 'asc' },
        },
      },
    });

    if (!bout) {
      throw new AppError(404, 'Partai tidak ditemukan.');
    }

    if (bout.status === 'COMPLETED') {
      throw new AppError(409, 'Partai ini sudah selesai (COMPLETED) dan tidak dapat dimuat ulang.');
    }

    const targetMat = normalizeMatKey(
      options?.matName || bout.matName || bout.division?.assignedMat || 'MAT A'
    );

    // Cek apakah matras sedang menjalankan partai lain yang belum selesai
    const existingSessionOnMat = await tx.matchSession.findUnique({
      where: { matName: targetMat },
      include: { bout: true },
    });

    if (
      existingSessionOnMat &&
      existingSessionOnMat.boutId !== boutId &&
      existingSessionOnMat.phase !== 'FINISHED' &&
      existingSessionOnMat.bout.status === 'IN_PROGRESS'
    ) {
      if (!options?.forceReplace) {
        throw new AppError(
          409,
          `Matras ${targetMat} sedang menjalankan partai lain (${existingSessionOnMat.boutId}). Kirim forceReplace: true untuk mengganti.`
        );
      }

      // Lepaskan kunci matras pada sesi sebelumnya dan kembalikan statusnya ke SCHEDULED
      await tx.matchSession.update({
        where: { boutId: existingSessionOnMat.boutId },
        data: { matName: null },
      });
      await tx.bout.update({
        where: { id: existingSessionOnMat.boutId },
        data: { status: 'SCHEDULED' },
      });
      matByBoutId.delete(existingSessionOnMat.boutId);
    } else if (existingSessionOnMat && existingSessionOnMat.boutId !== boutId) {
      await tx.matchSession.update({
        where: { boutId: existingSessionOnMat.boutId },
        data: { matName: null },
      });
      matByBoutId.delete(existingSessionOnMat.boutId);
    }

    // Ubah status partai ini menjadi IN_PROGRESS pada targetMat
    await tx.bout.update({
      where: { id: boutId },
      data: {
        status: 'IN_PROGRESS',
        matName: targetMat,
      },
    });

    // Reset partai ON_DECK lama pada matras yang sama ke SCHEDULED, lalu pilih 1 partai berikutnya menjadi ON_DECK
    await tx.bout.updateMany({
      where: {
        matName: targetMat,
        status: 'ON_DECK',
        id: { not: boutId },
        ...(bout.tournamentId ? { tournamentId: bout.tournamentId } : {}),
      },
      data: { status: 'SCHEDULED' },
    });

    const nextCandidates = await tx.bout.findMany({
      where: {
        matName: targetMat,
        status: 'SCHEDULED',
        id: { not: boutId },
        ...(bout.tournamentId ? { tournamentId: bout.tournamentId } : {}),
      },
      orderBy: [{ roundOrder: 'asc' }, { bracketPosition: 'asc' }],
    });

    nextCandidates.sort((a, b) => {
      if (a.boutNumber !== null && b.boutNumber !== null) {
        return a.boutNumber - b.boutNumber;
      }
      if (a.boutNumber !== null) return -1;
      if (b.boutNumber !== null) return 1;
      if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
      return a.bracketPosition - b.bracketPosition;
    });

    if (nextCandidates.length > 0) {
      await tx.bout.update({
        where: { id: nextCandidates[0].id },
        data: { status: 'ON_DECK' },
      });
    }

    const style: WrestlingStyle = bout.division?.style ?? 'FS';
    const ageCategory: AgeCategory = bout.division?.ageCategory ?? 'SENIOR';
    const weightClass = bout.division?.weightClass ?? '74 KG';
    const periodDuration = getPeriodDurationMs(ageCategory);

    const events = bout.matchEvents.map(mapDbEventToSharedEvent);
    const redStats = recalculateStatsFromEvents(events, 'RED');
    const blueStats = recalculateStatsFromEvents(events, 'BLUE');

    const redName = bout.redAthlete?.name || bout.redManualName || 'RED WRESTLER';
    const redRegion = bout.redAthlete?.regionCode || bout.redManualRegion || 'RED';
    const blueName = bout.blueAthlete?.name || bout.blueManualName || 'BLUE WRESTLER';
    const blueRegion = bout.blueAthlete?.regionCode || bout.blueManualRegion || 'BLUE';

    const redState: WrestlerState = {
      ...createDefaultWrestlerState(redName, redRegion),
      score: redStats.score,
      cautions: redStats.cautions,
      passivityCount: redStats.passivityCount,
    };

    const blueState: WrestlerState = {
      ...createDefaultWrestlerState(blueName, blueRegion),
      score: blueStats.score,
      cautions: blueStats.cautions,
      passivityCount: blueStats.passivityCount,
    };

    const prevVersion = bout.matchSession?.version ?? 0;
    const effectiveBoutNumber = await resolveEffectiveBoutNumber(
      tx,
      bout,
      targetMat
    );

    const newState: MatchState = {
      version: prevVersion + 1,
      metadata: {
        matName: targetMat,
        boutNumber: `BOUT ${effectiveBoutNumber}`,
        style,
        ageCategory,
        weightClass,
        round: bout.round,
        activeBoutId: bout.id,
      },
      phase: bout.matchSession?.phase && bout.matchSession.phase !== 'FINISHED'
        ? bout.matchSession.phase
        : 'PRE_MATCH',
      mainClock: {
        remainingMs: periodDuration,
        isRunning: false,
        lastSyncedAt: null,
      },
      breakClock: {
        remainingMs: getBreakDurationMs(),
        isRunning: false,
        lastSyncedAt: null,
      },
      activityClock: {
        remainingMs: getActivityClockDurationMs(),
        isRunning: false,
        lastSyncedAt: null,
        activeCorner: null,
      },
      red: redState,
      blue: blueState,
      events,
      activeChallengeCorner: null,
      winner: null,
      activeBoutId: bout.id,
      nextBoutPreview: null,
    };

    await persistSessionSnapshot(tx, bout.id, targetMat, newState);

    return { matKey: targetMat, state: newState };
  });

  state.nextBoutPreview = await findNextBoutPreviewForMat(matKey, boutId);
  activeSessionsByMat.set(matKey, state);
  matByBoutId.set(boutId, matKey);

  broadcastMatchState(matKey, state);
  const snapshot = await buildScheduleSnapshot(activeSessionsByMat);
  broadcastScheduleUpdate(snapshot);

  return state;
}

/**
 * 2. POST /api/bouts/:id/events
 * Menambahkan baris baru ke match_events dengan sequence_no meningkat atomik,
 * menghitung ulang skor/caution/passivity/Tie-Breaker/Activity Clock menggunakan shared/engine/uwwRules.ts,
 * memperbarui match_sessions di MySQL dan mem-broadcast pembaruan.
 */
export async function recordBoutEvent(
  boutId: string,
  payload: {
    corner: Corner;
    type: MatchEventType;
    points?: number;
    period?: number;
    matchClockMs?: number;
    note?: string | null;
    opponentPoints?: number;
  }
) {
  const { matKey, state: currentState } = await ensureSessionLoaded(boutId);
  const now = Date.now();

  const currentPeriod: 1 | 2 =
    payload.period === 2 || currentState.phase === 'PERIOD_2' ? 2 : 1;
  const currentClockMs =
    payload.matchClockMs ??
    computeLiveRemainingMs(
      currentState.mainClock.remainingMs,
      currentState.mainClock.isRunning,
      currentState.mainClock.lastSyncedAt,
      now
    );

  const updatedState = await prisma.$transaction(async (tx) => {
    const maxSeqAgg = await tx.matchEventRecord.aggregate({
      where: { boutId },
      _max: { sequenceNo: true },
    });

    let nextSeq = (maxSeqAgg._max.sequenceNo ?? 0) + 1;

    // Jika CAUTION disertai poin otomatis untuk lawan (opponentPoints > 0), buat 2 event dengan groupId sama
    if (payload.type === 'CAUTION' && payload.opponentPoints && payload.opponentPoints > 0) {
      const groupId = randomUUID().slice(0, 8);
      const groupNote = `[GRP:${groupId}]${payload.note ? ` ${payload.note}` : ''}`;
      const opponentCorner: Corner = payload.corner === 'RED' ? 'BLUE' : 'RED';

      await tx.matchEventRecord.create({
        data: {
          boutId,
          sequenceNo: nextSeq++,
          period: currentPeriod,
          matchClockMs: currentClockMs,
          corner: payload.corner,
          type: 'CAUTION',
          points: 0,
          note: groupNote,
          isUndone: false,
        },
      });

      await tx.matchEventRecord.create({
        data: {
          boutId,
          sequenceNo: nextSeq++,
          period: currentPeriod,
          matchClockMs: currentClockMs,
          corner: opponentCorner,
          type: 'POINT',
          points: payload.opponentPoints,
          note: groupNote,
          isUndone: false,
        },
      });
    } else {
      const pts =
        payload.type === 'PASSIVITY'
          ? 0
          : payload.points ?? 0;

      await tx.matchEventRecord.create({
        data: {
          boutId,
          sequenceNo: nextSeq++,
          period: currentPeriod,
          matchClockMs: currentClockMs,
          corner: payload.corner,
          type: payload.type,
          points: pts,
          note: payload.note ?? null,
          isUndone: false,
        },
      });
    }

    const activeDbEvents = await tx.matchEventRecord.findMany({
      where: { boutId, isUndone: false },
      orderBy: { sequenceNo: 'asc' },
    });

    const events = activeDbEvents.map(mapDbEventToSharedEvent);
    const redStats = recalculateStatsFromEvents(events, 'RED');
    const blueStats = recalculateStatsFromEvents(events, 'BLUE');

    // Batalkan Activity Clock otomatis apabila poin teknis dicetak ketika Activity Clock aktif
    let nextActivityClock: ActivityClockState = { ...currentState.activityClock };
    const isPointScored =
      (payload.points && payload.points > 0) ||
      (payload.opponentPoints && payload.opponentPoints > 0);

    if (nextActivityClock.activeCorner !== null && isPointScored) {
      nextActivityClock = {
        remainingMs: getActivityClockDurationMs(),
        isRunning: false,
        lastSyncedAt: null,
        activeCorner: null,
      };
    }

    const nextState: MatchState = {
      ...currentState,
      version: currentState.version + 1,
      activityClock: nextActivityClock,
      red: {
        ...currentState.red,
        score: redStats.score,
        cautions: Math.min(3, redStats.cautions),
        passivityCount: redStats.passivityCount,
      },
      blue: {
        ...currentState.blue,
        score: blueStats.score,
        cautions: Math.min(3, blueStats.cautions),
        passivityCount: blueStats.passivityCount,
      },
      events,
    };

    await persistSessionSnapshot(tx, boutId, matKey, nextState);
    await tx.bout.update({
      where: { id: boutId },
      data: {
        redScore: nextState.red.score,
        blueScore: nextState.blue.score,
      },
    });

    return nextState;
  });

  activeSessionsByMat.set(matKey, updatedState);
  broadcastMatchState(matKey, updatedState);
  const snapshot = await buildScheduleSnapshot(activeSessionsByMat);
  broadcastScheduleUpdate(snapshot);

  return {
    matchState: updatedState,
    tieBreaker: evaluateTieBreaker(updatedState.red, updatedState.blue, updatedState.events),
    techSuperiority: checkTechnicalSuperiority(updatedState),
    disqualification: checkDisqualification(updatedState),
  };
}

/**
 * 3. POST /api/bouts/:id/events/undo
 * Soft-undo: mengubah is_undone = true pada event terakhir (atau grup event terakhir pada CAUTION + poin)
 * tanpa menghapus baris di MySQL, lalu menghitung ulang seluruh state secara deterministik.
 */
export async function undoLastBoutEvent(boutId: string) {
  const { matKey, state: currentState } = await ensureSessionLoaded(boutId);

  const { updatedState, undoneCount } = await prisma.$transaction(async (tx) => {
    const lastActiveEvent = await tx.matchEventRecord.findFirst({
      where: { boutId, isUndone: false },
      orderBy: { sequenceNo: 'desc' },
    });

    if (!lastActiveEvent) {
      return { updatedState: currentState, undoneCount: 0 };
    }

    const { groupId } = extractGroupIdFromNote(lastActiveEvent.note);
    let count = 0;

    if (groupId) {
      const groupPrefix = `[GRP:${groupId}]`;
      const res = await tx.matchEventRecord.updateMany({
        where: {
          boutId,
          isUndone: false,
          note: { startsWith: groupPrefix },
        },
        data: { isUndone: true },
      });
      count = res.count;
    } else {
      await tx.matchEventRecord.update({
        where: { id: lastActiveEvent.id },
        data: { isUndone: true },
      });
      count = 1;
    }

    const remainingDbEvents = await tx.matchEventRecord.findMany({
      where: { boutId, isUndone: false },
      orderBy: { sequenceNo: 'asc' },
    });

    const events = remainingDbEvents.map(mapDbEventToSharedEvent);
    const redStats = recalculateStatsFromEvents(events, 'RED');
    const blueStats = recalculateStatsFromEvents(events, 'BLUE');

    // Jika event yang di-undo adalah penalti CHALLENGE_LOST_POINT (+1 poin lawan),
    // kembalikan kartu challenge ke pegulat yang kalah challenge sebelumnya.
    const restoredChallengeCorner: Corner | null =
      lastActiveEvent.type === 'CHALLENGE_LOST_POINT'
        ? lastActiveEvent.corner === 'RED'
          ? 'BLUE'
          : 'RED'
        : null;

    const nextState: MatchState = {
      ...currentState,
      version: currentState.version + 1,
      red: {
        ...currentState.red,
        score: redStats.score,
        cautions: Math.min(3, redStats.cautions),
        passivityCount: redStats.passivityCount,
        ...(restoredChallengeCorner === 'RED' ? { hasChallenge: true } : {}),
      },
      blue: {
        ...currentState.blue,
        score: blueStats.score,
        cautions: Math.min(3, blueStats.cautions),
        passivityCount: blueStats.passivityCount,
        ...(restoredChallengeCorner === 'BLUE' ? { hasChallenge: true } : {}),
      },
      events,
    };

    await persistSessionSnapshot(tx, boutId, matKey, nextState);
    await tx.bout.update({
      where: { id: boutId },
      data: {
        redScore: nextState.red.score,
        blueScore: nextState.blue.score,
      },
    });

    return { updatedState: nextState, undoneCount: count };
  });

  activeSessionsByMat.set(matKey, updatedState);
  broadcastMatchState(matKey, updatedState);
  const snapshot = await buildScheduleSnapshot(activeSessionsByMat);
  broadcastScheduleUpdate(snapshot);

  return {
    undoneCount,
    matchState: updatedState,
    tieBreaker: evaluateTieBreaker(updatedState.red, updatedState.blue, updatedState.events),
  };
}

export type ClockActionPayload = {
  action:
    | 'TOGGLE_MAIN'
    | 'SET_MAIN'
    | 'ADJUST_MAIN'
    | 'CHANGE_PHASE'
    | 'TOGGLE_BREAK'
    | 'START_ACTIVITY'
    | 'CANCEL_ACTIVITY'
    | 'COMPLETE_ACTIVITY_TIMEOUT'
    | 'TOGGLE_MEDICAL'
    | 'OPEN_CHALLENGE'
    | 'RESOLVE_CHALLENGE';
  remainingMs?: number;
  deltaMs?: number;
  phase?: MatchPhase;
  corner?: Corner;
  timerType?: 'INJURY' | 'BLOOD';
  won?: boolean;
  outcome?: 'WON' | 'LOST' | 'CANCEL';
};

/**
 * 4. PATCH /api/bouts/:id/clock
 * Menangani seluruh transisi diskrit timer, babak, activity clock, medical timer, dan challenge
 * menggunakan timestamp server (Date.now()) tanpa menulis ke MySQL setiap detik.
 */
export async function updateBoutClock(boutId: string, payload: ClockActionPayload) {
  const { matKey, state: currentState } = await ensureSessionLoaded(boutId);
  const now = Date.now();

  let buzzerToTrigger: 'PERIOD_END' | 'ACTIVITY_END' | null = null;

  const updatedState = await prisma.$transaction(async (tx) => {
    const nextState: MatchState = {
      ...currentState,
      version: currentState.version + 1,
      mainClock: { ...currentState.mainClock },
      breakClock: { ...currentState.breakClock },
      activityClock: { ...currentState.activityClock },
      red: {
        ...currentState.red,
        injuryTimer: { ...currentState.red.injuryTimer },
        bloodTimer: { ...currentState.red.bloodTimer },
      },
      blue: {
        ...currentState.blue,
        injuryTimer: { ...currentState.blue.injuryTimer },
        bloodTimer: { ...currentState.blue.bloodTimer },
      },
      events: [...currentState.events],
    };

    const periodDuration = getPeriodDurationMs(nextState.metadata.ageCategory);

    switch (payload.action) {
      case 'TOGGLE_MAIN': {
        if (nextState.phase === 'PRE_MATCH') {
          nextState.phase = 'PERIOD_1';
        }
        if (nextState.mainClock.isRunning) {
          // Pause main clock & pause activity clock jika sedang berjalan
          nextState.mainClock = freezeTimer(nextState.mainClock, now);
          if (nextState.activityClock.isRunning) {
            nextState.activityClock = {
              ...freezeTimer(nextState.activityClock, now),
              activeCorner: nextState.activityClock.activeCorner,
            };
          }
        } else {
          // Start main clock -> matikan medical timer jika ada yang nyala
          nextState.red.injuryTimer = freezeTimer(nextState.red.injuryTimer, now);
          nextState.red.bloodTimer = freezeTimer(nextState.red.bloodTimer, now);
          nextState.blue.injuryTimer = freezeTimer(nextState.blue.injuryTimer, now);
          nextState.blue.bloodTimer = freezeTimer(nextState.blue.bloodTimer, now);

          nextState.mainClock = {
            remainingMs: nextState.mainClock.remainingMs,
            isRunning: true,
            lastSyncedAt: now,
          };

          if (
            nextState.activityClock.activeCorner !== null &&
            nextState.activityClock.remainingMs > 0
          ) {
            nextState.activityClock = {
              ...nextState.activityClock,
              isRunning: true,
              lastSyncedAt: now,
            };
          }
        }
        break;
      }

      case 'SET_MAIN': {
        const targetMs = Math.max(0, payload.remainingMs ?? periodDuration);
        nextState.mainClock = {
          remainingMs: targetMs,
          isRunning: false,
          lastSyncedAt: null,
        };
        break;
      }

      case 'ADJUST_MAIN': {
        const liveMs = computeLiveRemainingMs(
          nextState.mainClock.remainingMs,
          nextState.mainClock.isRunning,
          nextState.mainClock.lastSyncedAt,
          now
        );
        const adjusted = Math.max(0, liveMs + (payload.deltaMs ?? 0));
        nextState.mainClock = {
          remainingMs: adjusted,
          isRunning: nextState.mainClock.isRunning,
          lastSyncedAt: nextState.mainClock.isRunning ? now : null,
        };
        break;
      }

      case 'CHANGE_PHASE': {
        const targetPhase = payload.phase ?? 'PERIOD_1';
        const prevPhase = nextState.phase;
        nextState.phase = targetPhase;

        // Pause semua jam utama & activity
        nextState.mainClock = freezeTimer(nextState.mainClock, now);
        nextState.breakClock = freezeTimer(nextState.breakClock, now);
        nextState.activityClock = {
          remainingMs: getActivityClockDurationMs(),
          isRunning: false,
          lastSyncedAt: null,
          activeCorner: null,
        };

        if (targetPhase === 'PERIOD_1' || targetPhase === 'PRE_MATCH') {
          nextState.mainClock = {
            remainingMs: periodDuration,
            isRunning: false,
            lastSyncedAt: null,
          };
        } else if (targetPhase === 'BREAK') {
          if (prevPhase === 'PERIOD_1') {
            buzzerToTrigger = 'PERIOD_END';
          }
          nextState.breakClock = {
            remainingMs: getBreakDurationMs(),
            isRunning: true,
            lastSyncedAt: now,
          };
        } else if (targetPhase === 'PERIOD_2') {
          nextState.mainClock = {
            remainingMs: periodDuration,
            isRunning: false,
            lastSyncedAt: null,
          };
        } else if (targetPhase === 'FINISHED') {
          if (prevPhase === 'PERIOD_2') {
            buzzerToTrigger = 'PERIOD_END';
          }
        }
        break;
      }

      case 'TOGGLE_BREAK': {
        if (nextState.breakClock.isRunning) {
          nextState.breakClock = freezeTimer(nextState.breakClock, now);
        } else {
          nextState.breakClock = {
            remainingMs:
              nextState.breakClock.remainingMs > 0
                ? nextState.breakClock.remainingMs
                : getBreakDurationMs(),
            isRunning: true,
            lastSyncedAt: now,
          };
        }
        break;
      }

      case 'START_ACTIVITY': {
        if (!payload.corner) {
          throw new AppError(400, 'corner (RED/BLUE) wajib diisi untuk START_ACTIVITY.');
        }
        const liveMainMs = computeLiveRemainingMs(
          nextState.mainClock.remainingMs,
          nextState.mainClock.isRunning,
          nextState.mainClock.lastSyncedAt,
          now
        );
        nextState.activityClock = {
          remainingMs: Math.min(getActivityClockDurationMs(), liveMainMs || getActivityClockDurationMs()),
          isRunning: nextState.mainClock.isRunning,
          lastSyncedAt: nextState.mainClock.isRunning ? now : null,
          activeCorner: payload.corner,
        };
        break;
      }

      case 'CANCEL_ACTIVITY': {
        nextState.activityClock = {
          remainingMs: getActivityClockDurationMs(),
          isRunning: false,
          lastSyncedAt: null,
          activeCorner: null,
        };
        break;
      }

      case 'COMPLETE_ACTIVITY_TIMEOUT': {
        const passiveCorner = nextState.activityClock.activeCorner || payload.corner;
        if (!passiveCorner) {
          throw new AppError(400, 'Tidak ada Activity Clock aktif untuk diselesaikan.');
        }
        const opponentCorner: Corner = passiveCorner === 'RED' ? 'BLUE' : 'RED';
        const liveMainMs = computeLiveRemainingMs(
          nextState.mainClock.remainingMs,
          nextState.mainClock.isRunning,
          nextState.mainClock.lastSyncedAt,
          now
        );
        const currentPeriod: 1 | 2 = nextState.phase === 'PERIOD_2' ? 2 : 1;

        const maxSeqAgg = await tx.matchEventRecord.aggregate({
          where: { boutId },
          _max: { sequenceNo: true },
        });
        const nextSeq = (maxSeqAgg._max.sequenceNo ?? 0) + 1;

        await tx.matchEventRecord.create({
          data: {
            boutId,
            sequenceNo: nextSeq,
            period: currentPeriod,
            matchClockMs: liveMainMs,
            corner: opponentCorner,
            type: 'ACTIVITY_POINT',
            points: 1,
            note: `Activity time expired (${passiveCorner})`,
            isUndone: false,
          },
        });

        const activeDbEvents = await tx.matchEventRecord.findMany({
          where: { boutId, isUndone: false },
          orderBy: { sequenceNo: 'asc' },
        });

        nextState.events = activeDbEvents.map(mapDbEventToSharedEvent);
        const redStats = recalculateStatsFromEvents(nextState.events, 'RED');
        const blueStats = recalculateStatsFromEvents(nextState.events, 'BLUE');
        nextState.red.score = redStats.score;
        nextState.blue.score = blueStats.score;

        nextState.activityClock = {
          remainingMs: getActivityClockDurationMs(),
          isRunning: false,
          lastSyncedAt: null,
          activeCorner: null,
        };

        await tx.bout.update({
          where: { id: boutId },
          data: {
            redScore: nextState.red.score,
            blueScore: nextState.blue.score,
          },
        });

        buzzerToTrigger = 'ACTIVITY_END';
        break;
      }

      case 'TOGGLE_MEDICAL': {
        const corner = payload.corner ?? 'RED';
        const timerType = payload.timerType ?? 'INJURY';
        const targetWrestler = corner === 'RED' ? nextState.red : nextState.blue;
        const targetTimer =
          timerType === 'INJURY' ? targetWrestler.injuryTimer : targetWrestler.bloodTimer;

        if (targetTimer.isRunning) {
          const frozen = freezeTimer(targetTimer, now);
          if (timerType === 'INJURY') targetWrestler.injuryTimer = frozen;
          else targetWrestler.bloodTimer = frozen;
        } else {
          // Pause main clock & activity clock ketika medical timer dinyalakan
          nextState.mainClock = freezeTimer(nextState.mainClock, now);
          if (nextState.activityClock.isRunning) {
            nextState.activityClock = {
              ...freezeTimer(nextState.activityClock, now),
              activeCorner: nextState.activityClock.activeCorner,
            };
          }
          const started: TimerState = {
            remainingMs: targetTimer.remainingMs,
            isRunning: true,
            lastSyncedAt: now,
          };
          if (timerType === 'INJURY') targetWrestler.injuryTimer = started;
          else targetWrestler.bloodTimer = started;
        }
        break;
      }

      case 'OPEN_CHALLENGE': {
        if (!payload.corner) {
          throw new AppError(400, 'corner (RED/BLUE) wajib diisi untuk OPEN_CHALLENGE.');
        }
        // Pause main clock & activity clock saat video review challenge dibuka
        nextState.mainClock = freezeTimer(nextState.mainClock, now);
        if (nextState.activityClock.isRunning) {
          nextState.activityClock = {
            ...freezeTimer(nextState.activityClock, now),
            activeCorner: nextState.activityClock.activeCorner,
          };
        }
        nextState.activeChallengeCorner = payload.corner;
        break;
      }

      case 'RESOLVE_CHALLENGE': {
        const challengeCorner = nextState.activeChallengeCorner || payload.corner;
        if (!challengeCorner) {
          throw new AppError(400, 'Tidak ada Challenge aktif untuk diselesaikan.');
        }

        const isLost =
          payload.outcome === 'LOST' ||
          (payload.outcome === undefined && payload.won === false);
        if (isLost) {
          // Challenge kalah: kartu challenge hangus & lawan mendapat +1 poin
          if (challengeCorner === 'RED') {
            nextState.red.hasChallenge = false;
          } else {
            nextState.blue.hasChallenge = false;
          }

          const opponentCorner: Corner = challengeCorner === 'RED' ? 'BLUE' : 'RED';
          const liveMainMs = computeLiveRemainingMs(
            nextState.mainClock.remainingMs,
            nextState.mainClock.isRunning,
            nextState.mainClock.lastSyncedAt,
            now
          );
          const currentPeriod: 1 | 2 = nextState.phase === 'PERIOD_2' ? 2 : 1;

          const maxSeqAgg = await tx.matchEventRecord.aggregate({
            where: { boutId },
            _max: { sequenceNo: true },
          });
          const nextSeq = (maxSeqAgg._max.sequenceNo ?? 0) + 1;

          await tx.matchEventRecord.create({
            data: {
              boutId,
              sequenceNo: nextSeq,
              period: currentPeriod,
              matchClockMs: liveMainMs,
              corner: opponentCorner,
              type: 'CHALLENGE_LOST_POINT',
              points: 1,
              note: `Challenge lost (${challengeCorner})`,
              isUndone: false,
            },
          });

          const activeDbEvents = await tx.matchEventRecord.findMany({
            where: { boutId, isUndone: false },
            orderBy: { sequenceNo: 'asc' },
          });

          nextState.events = activeDbEvents.map(mapDbEventToSharedEvent);
          const redStats = recalculateStatsFromEvents(nextState.events, 'RED');
          const blueStats = recalculateStatsFromEvents(nextState.events, 'BLUE');
          nextState.red.score = redStats.score;
          nextState.blue.score = blueStats.score;

          await tx.bout.update({
            where: { id: boutId },
            data: {
              redScore: nextState.red.score,
              blueScore: nextState.blue.score,
            },
          });
        }

        nextState.activeChallengeCorner = null;
        break;
      }
    }

    await persistSessionSnapshot(tx, boutId, matKey, nextState);
    return nextState;
  });

  activeSessionsByMat.set(matKey, updatedState);
  broadcastMatchState(matKey, updatedState);
  if (buzzerToTrigger) {
    broadcastBuzzer(matKey, buzzerToTrigger);
  }
  const snapshot = await buildScheduleSnapshot(activeSessionsByMat);
  broadcastScheduleUpdate(snapshot);

  return {
    matchState: updatedState,
    suggestedVictory:
      updatedState.phase === 'FINISHED' ? suggestEndOfMatchVictory(updatedState) : null,
  };
}

/**
 * 4b. PATCH /api/bouts/:id/session
 * Memperbarui metadata atau nama/kontingen pegulat pada sesi live aktif (MatchSetupModal)
 * agar tetap persisten di MySQL & tidak tertimpa saat state server di-broadcast ulang.
 */
export async function updateBoutSessionDetails(
  boutId: string,
  payload: {
    metadata?: {
      matName?: string;
      boutNumber?: string;
      style?: WrestlingStyle;
      ageCategory?: AgeCategory;
      weightClass?: string;
    };
    red?: {
      name?: string;
      countryOrTeam?: string;
    };
    blue?: {
      name?: string;
      countryOrTeam?: string;
    };
  }
) {
  const { matKey, state: currentState } = await ensureSessionLoaded(boutId);

  const updatedState = await prisma.$transaction(async (tx) => {
    const bout = await tx.bout.findUnique({ where: { id: boutId } });
    if (!bout) {
      throw new AppError(404, 'Partai tidak ditemukan.');
    }

    const nextAge = payload.metadata?.ageCategory ?? currentState.metadata.ageCategory;
    const nextBoutNumberLabel =
      payload.metadata?.boutNumber ?? currentState.metadata.boutNumber;
    const parsedBoutNum = parseInt(nextBoutNumberLabel.replace(/[^0-9]/g, ''), 10);

    const nextState: MatchState = {
      ...currentState,
      version: currentState.version + 1,
      metadata: {
        ...currentState.metadata,
        ...(payload.metadata?.boutNumber !== undefined
          ? { boutNumber: payload.metadata.boutNumber }
          : {}),
        ...(payload.metadata?.style !== undefined
          ? { style: payload.metadata.style }
          : {}),
        ...(payload.metadata?.ageCategory !== undefined
          ? { ageCategory: payload.metadata.ageCategory }
          : {}),
        ...(payload.metadata?.weightClass !== undefined
          ? { weightClass: payload.metadata.weightClass }
          : {}),
      },
      red: {
        ...currentState.red,
        ...(payload.red?.name !== undefined ? { name: payload.red.name } : {}),
        ...(payload.red?.countryOrTeam !== undefined
          ? { countryOrTeam: payload.red.countryOrTeam }
          : {}),
      },
      blue: {
        ...currentState.blue,
        ...(payload.blue?.name !== undefined ? { name: payload.blue.name } : {}),
        ...(payload.blue?.countryOrTeam !== undefined
          ? { countryOrTeam: payload.blue.countryOrTeam }
          : {}),
      },
      ...(currentState.phase === 'PRE_MATCH' &&
      !currentState.mainClock.isRunning &&
      payload.metadata?.ageCategory
        ? {
            mainClock: {
              remainingMs: getPeriodDurationMs(nextAge),
              isRunning: false,
              lastSyncedAt: null,
            },
          }
        : {}),
    };

    await persistSessionSnapshot(tx, boutId, matKey, nextState);

    const boutUpdateData: Prisma.BoutUpdateInput = {};
    if (payload.metadata?.boutNumber !== undefined && !isNaN(parsedBoutNum)) {
      boutUpdateData.boutNumber = parsedBoutNum;
    }
    if (!bout.redAthleteId) {
      if (payload.red?.name !== undefined) boutUpdateData.redManualName = payload.red.name;
      if (payload.red?.countryOrTeam !== undefined) {
        boutUpdateData.redManualRegion = payload.red.countryOrTeam;
      }
    }
    if (!bout.blueAthleteId) {
      if (payload.blue?.name !== undefined) boutUpdateData.blueManualName = payload.blue.name;
      if (payload.blue?.countryOrTeam !== undefined) {
        boutUpdateData.blueManualRegion = payload.blue.countryOrTeam;
      }
    }

    if (Object.keys(boutUpdateData).length > 0) {
      await tx.bout.update({
        where: { id: boutId },
        data: boutUpdateData,
      });
    }

    return nextState;
  });

  activeSessionsByMat.set(matKey, updatedState);
  broadcastMatchState(matKey, updatedState);
  const snapshot = await buildScheduleSnapshot(activeSessionsByMat);
  broadcastScheduleUpdate(snapshot);

  return { matchState: updatedState };
}

/**
 * 5. POST /api/bouts/:id/complete
 * Dalam satu prisma.$transaction:
 * 1. Simpan pemenang, skor akhir, victory_type, red_classification_pts, blue_classification_pts, dan completed_at ke tabel bouts.
 * 2. Jika bukan partai manual (division_id !== null), jalankan shared/engine/uwwBracketEngine.ts (advanceBoutResult)
 *    untuk memperbarui slot red_athlete_id / blue_athlete_id pada partai babak berikutnya, Cross Semifinal, Repechage, & Bronze.
 * 3. Lepaskan kunci mat_name pada match_sessions.
 * 4. Broadcast match:state_update, bracket:update, dan schedule:update.
 */
export async function completeBoutAndAdvance(
  boutId: string,
  payload: {
    winnerCorner: Corner;
    victoryType: VictoryType;
    redScore?: number;
    blueScore?: number;
  }
) {
  const now = Date.now();
  const cachedMat = matByBoutId.get(boutId);
  const cachedState = cachedMat ? activeSessionsByMat.get(cachedMat) : null;

  const txResult = await prisma.$transaction(async (tx) => {
    const bout = await tx.bout.findUnique({
      where: { id: boutId },
      include: {
        redAthlete: true,
        blueAthlete: true,
        division: true,
        matchSession: true,
      },
    });

    if (!bout) {
      throw new AppError(404, 'Partai tidak ditemukan.');
    }

    const finalRedScore =
      payload.redScore ?? cachedState?.red.score ?? bout.redScore ?? 0;
    const finalBlueScore =
      payload.blueScore ?? cachedState?.blue.score ?? bout.blueScore ?? 0;

    const cp = getClassificationPoints(payload.victoryType);
    const redClassificationPts =
      payload.winnerCorner === 'RED' ? cp.winner : cp.loser;
    const blueClassificationPts =
      payload.winnerCorner === 'BLUE' ? cp.winner : cp.loser;

    const winnerAthleteId =
      payload.winnerCorner === 'RED' ? bout.redAthleteId : bout.blueAthleteId;
    const loserAthleteId =
      payload.winnerCorner === 'RED' ? bout.blueAthleteId : bout.redAthleteId;

    const completedAt = new Date(now);

    // 1. Update partai yang selesai di tabel bouts
    const completedDbBout = await tx.bout.update({
      where: { id: boutId },
      data: {
        status: 'COMPLETED',
        winnerCorner: payload.winnerCorner,
        winnerAthleteId: winnerAthleteId ?? null,
        redScore: finalRedScore,
        blueScore: finalBlueScore,
        victoryType: payload.victoryType,
        redClassificationPts,
        blueClassificationPts,
        completedAt,
      },
    });

    // 2. Jika partai bagian dari divisi turnamen, jalankan advanceBoutResult secara atomik
    const advancedBoutIds: string[] = [];
    if (bout.divisionId) {
      const divisionBouts = await tx.bout.findMany({
        where: { divisionId: bout.divisionId },
        orderBy: [{ roundOrder: 'asc' }, { bracketPosition: 'asc' }],
      });

      const sharedBouts = divisionBouts.map(mapPrismaBoutToShared);
      const updatedSharedBouts = advanceBoutResult(sharedBouts, boutId, {
        winnerCorner: payload.winnerCorner,
        winnerAthleteId: winnerAthleteId || '',
        loserAthleteId: loserAthleteId || '',
        redScore: finalRedScore,
        blueScore: finalBlueScore,
        victoryType: payload.victoryType,
        redClassificationPts,
        blueClassificationPts,
        completedAt: now,
      });

      // Simpan perubahan pada partai-partai babak berikutnya yang terpengaruh
      const originalById = new Map(divisionBouts.map((b) => [b.id, b]));
      for (const sb of updatedSharedBouts) {
        if (sb.id === boutId) continue;
        const orig = originalById.get(sb.id);
        if (!orig) continue;

        const hasChanged =
          orig.redAthleteId !== sb.redAthleteId ||
          orig.blueAthleteId !== sb.blueAthleteId ||
          orig.status !== sb.status;

        if (hasChanged) {
          await tx.bout.update({
            where: { id: sb.id },
            data: {
              redAthleteId: sb.redAthleteId,
              blueAthleteId: sb.blueAthleteId,
              status: sb.status,
            },
          });
          advancedBoutIds.push(sb.id);
        }
      }
    }

    // 3. Lepaskan kunci mat_name pada match_sessions
    const matKey = normalizeMatKey(
      cachedMat || bout.matchSession?.matName || bout.matName || 'MAT A'
    );

    if (bout.matchSession || cachedState) {
      const baseState: MatchState = cachedState ?? {
        version: (bout.matchSession?.version ?? 1) + 1,
        metadata: {
          matName: matKey,
          boutNumber: bout.boutNumber ? `BOUT ${bout.boutNumber}` : 'BOUT',
          style: bout.division?.style ?? 'FS',
          ageCategory: bout.division?.ageCategory ?? 'SENIOR',
          weightClass: bout.division?.weightClass ?? '74 KG',
          activeBoutId: bout.id,
        },
        phase: 'FINISHED',
        mainClock: { remainingMs: 0, isRunning: false, lastSyncedAt: null },
        breakClock: { remainingMs: 0, isRunning: false, lastSyncedAt: null },
        activityClock: {
          remainingMs: 0,
          isRunning: false,
          lastSyncedAt: null,
          activeCorner: null,
        },
        red: {
          ...createDefaultWrestlerState(
            bout.redAthlete?.name || bout.redManualName || 'RED',
            bout.redAthlete?.regionCode || bout.redManualRegion || 'RED'
          ),
          score: finalRedScore,
        },
        blue: {
          ...createDefaultWrestlerState(
            bout.blueAthlete?.name || bout.blueManualName || 'BLUE',
            bout.blueAthlete?.regionCode || bout.blueManualRegion || 'BLUE'
          ),
          score: finalBlueScore,
        },
        events: [],
        activeChallengeCorner: null,
        winner: {
          corner: payload.winnerCorner,
          type: payload.victoryType,
        },
        activeBoutId: bout.id,
        nextBoutPreview: null,
      };

      const finishedState: MatchState = {
        ...baseState,
        version: baseState.version + 1,
        phase: 'FINISHED',
        mainClock: freezeTimer(baseState.mainClock, now),
        breakClock: freezeTimer(baseState.breakClock, now),
        activityClock: {
          ...freezeTimer(baseState.activityClock, now),
          activeCorner: null,
        },
        red: {
          ...baseState.red,
          score: finalRedScore,
        },
        blue: {
          ...baseState.blue,
          score: finalBlueScore,
        },
        winner: {
          corner: payload.winnerCorner,
          type: payload.victoryType,
        },
      };

      await persistSessionSnapshot(tx, bout.id, null, finishedState);

      return {
        bout: completedDbBout,
        matKey,
        finishedState,
        advancedBoutIds,
      };
    }

    return {
      bout: completedDbBout,
      matKey,
      finishedState: null,
      advancedBoutIds,
    };
  });

  // Update RAM cache & broadcast ke semua klien Socket.IO
  matByBoutId.delete(boutId);
  if (txResult.finishedState) {
    txResult.finishedState.nextBoutPreview = await findNextBoutPreviewForMat(
      txResult.matKey,
      boutId
    );
    activeSessionsByMat.set(txResult.matKey, txResult.finishedState);
    broadcastMatchState(txResult.matKey, txResult.finishedState);
  }

  if (txResult.bout.divisionId) {
    broadcastBracketUpdate({
      divisionId: txResult.bout.divisionId,
      tournamentId: txResult.bout.tournamentId,
      completedBoutId: boutId,
    });
  }

  const snapshot = await buildScheduleSnapshot(activeSessionsByMat);
  broadcastScheduleUpdate(snapshot);

  return {
    bout: txResult.bout,
    advancedBoutIds: txResult.advancedBoutIds,
    matchState: txResult.finishedState,
  };
}
