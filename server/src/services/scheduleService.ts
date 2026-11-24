import { prisma } from '../config/prisma';
import { MatchPhase, MatchState } from '../../../shared/types/match';
import {
  ActiveMatSnapshot,
  ScheduleSnapshot,
  UpcomingBoutSnapshot,
} from '../../../shared/types/tournament';

function mapPhaseToPeriodLabel(phase: MatchPhase): string {
  switch (phase) {
    case 'PRE_MATCH':
      return 'READY';
    case 'PERIOD_1':
      return 'P1';
    case 'BREAK':
      return 'BREAK';
    case 'PERIOD_2':
      return 'P2';
    case 'FINISHED':
      return 'FINAL';
    default:
      return phase;
  }
}

/**
 * Menghitung sisa waktu timer secara akurat pada waktu sekarang.
 */
export function computeLiveRemainingMs(
  remainingMs: number,
  isRunning: boolean,
  lastSyncedAt: number | null,
  now = Date.now()
): number {
  if (!isRunning || lastSyncedAt === null) {
    return Math.max(0, remainingMs);
  }
  return Math.max(0, remainingMs - (now - lastSyncedAt));
}

/**
 * Mencari preview partai berikutnya (ON_DECK atau SCHEDULED pertama) pada matras yang sama.
 */
export async function findNextBoutPreviewForMat(
  matName: string,
  excludeBoutId?: string
): Promise<MatchState['nextBoutPreview']> {
  const candidates = await prisma.bout.findMany({
    where: {
      matName,
      status: { in: ['ON_DECK', 'SCHEDULED'] },
      ...(excludeBoutId ? { id: { not: excludeBoutId } } : {}),
    },
    include: {
      redAthlete: true,
      blueAthlete: true,
      division: true,
    },
    orderBy: [{ roundOrder: 'asc' }, { bracketPosition: 'asc' }],
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    // Prioritaskan ON_DECK di atas SCHEDULED
    if (a.status === 'ON_DECK' && b.status !== 'ON_DECK') return -1;
    if (b.status === 'ON_DECK' && a.status !== 'ON_DECK') return 1;
    if (a.boutNumber !== null && b.boutNumber !== null) {
      return a.boutNumber - b.boutNumber;
    }
    if (a.boutNumber !== null) return -1;
    if (b.boutNumber !== null) return 1;
    if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
    return a.bracketPosition - b.bracketPosition;
  });

  const next = candidates[0];
  const divisionLabel = next.division
    ? `${next.division.style} ${next.division.weightClass}`
    : next.round || 'EXHIBITION';

  return {
    boutNumber: next.boutNumber,
    divisionLabel,
    redName: next.redAthlete?.name || next.redManualName || 'TBD',
    redRegion: next.redAthlete?.regionCode || next.redManualRegion || '-',
    blueName: next.blueAthlete?.name || next.blueManualName || 'TBD',
    blueRegion: next.blueAthlete?.regionCode || next.blueManualRegion || '-',
  };
}

/**
 * Membangun ScheduleSnapshot lengkap (daftar matras aktif + daftar antrean upcoming bouts).
 */
export async function buildScheduleSnapshot(
  activeMatStates: Map<string, MatchState>,
  options?: { matFilter?: string; tournamentId?: string }
): Promise<ScheduleSnapshot> {
  const now = Date.now();
  const matFilter = options?.matFilter?.trim();

  // 1. Kumpulkan activeMats dari RAM cache
  const activeMats: ActiveMatSnapshot[] = [];

  for (const [matName, state] of activeMatStates.entries()) {
    if (matFilter && matName.toUpperCase() !== matFilter.toUpperCase()) {
      continue;
    }

    const activeClock =
      state.phase === 'BREAK' ? state.breakClock : state.mainClock;
    const remMs = computeLiveRemainingMs(
      activeClock.remainingMs,
      activeClock.isRunning,
      activeClock.lastSyncedAt,
      now
    );

    const parsedBoutNum = parseInt(
      state.metadata.boutNumber.replace(/[^0-9]/g, ''),
      10
    );

    activeMats.push({
      matName: state.metadata.matName,
      boutNumber: isNaN(parsedBoutNum) ? null : parsedBoutNum,
      divisionLabel: `${state.metadata.style} • ${state.metadata.weightClass} • ${state.metadata.ageCategory}`,
      redName: state.red.name,
      redRegion: state.red.countryOrTeam,
      redScore: state.red.score,
      blueName: state.blue.name,
      blueRegion: state.blue.countryOrTeam,
      blueScore: state.blue.score,
      periodLabel: mapPhaseToPeriodLabel(state.phase),
      remainingMs: remMs,
      isRunning: activeClock.isRunning,
      lastSyncedAt: activeClock.lastSyncedAt,
    });
  }

  activeMats.sort((a, b) => a.matName.localeCompare(b.matName));

  // 2. Ambil daftar partai yang akan datang (ON_DECK & SCHEDULED) dari MySQL
  const upcomingDbBouts = await prisma.bout.findMany({
    where: {
      status: { in: ['ON_DECK', 'SCHEDULED'] },
      ...(matFilter ? { matName: matFilter } : {}),
      ...(options?.tournamentId ? { tournamentId: options.tournamentId } : {}),
    },
    include: {
      redAthlete: true,
      blueAthlete: true,
      division: true,
    },
    orderBy: [{ roundOrder: 'asc' }, { bracketPosition: 'asc' }],
  });

  upcomingDbBouts.sort((a, b) => {
    if (a.boutNumber !== null && b.boutNumber !== null) {
      return a.boutNumber - b.boutNumber;
    }
    if (a.boutNumber !== null) return -1;
    if (b.boutNumber !== null) return 1;
    if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
    return a.bracketPosition - b.bracketPosition;
  });

  // Hitung urutan queue per matras untuk menentukan badge ON_DECK, IN_THE_HOLE, UPCOMING
  const matRankCounter = new Map<string, number>();

  const upcomingBouts: UpcomingBoutSnapshot[] = upcomingDbBouts.map((b) => {
    const mat = b.matName || 'MAT A';
    const idxOnMat = matRankCounter.get(mat) || 0;
    matRankCounter.set(mat, idxOnMat + 1);

    let queueBadge: 'ON_DECK' | 'IN_THE_HOLE' | 'UPCOMING' = 'UPCOMING';
    if (b.status === 'ON_DECK' || idxOnMat === 0) {
      queueBadge = 'ON_DECK';
    } else if (idxOnMat === 1) {
      queueBadge = 'IN_THE_HOLE';
    }

    const divisionLabel = b.division
      ? `${b.division.style} • ${b.division.weightClass}`
      : 'EXHIBITION';

    return {
      id: b.id,
      matName: mat,
      boutNumber: b.boutNumber,
      divisionLabel,
      roundLabel: b.round.replace(/_/g, ' '),
      redName: b.redAthlete?.name || b.redManualName || b.redSourceLabel || 'TBD',
      redRegion: b.redAthlete?.regionCode || b.redManualRegion || '-',
      blueName: b.blueAthlete?.name || b.blueManualName || b.blueSourceLabel || 'TBD',
      blueRegion: b.blueAthlete?.regionCode || b.blueManualRegion || '-',
      queueBadge,
    };
  });

  return {
    updatedAt: now,
    activeMats,
    upcomingBouts,
  };
}
