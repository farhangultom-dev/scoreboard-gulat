import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPeriodDurationMs,
  getBreakDurationMs,
  getTechSuperiorityThreshold,
  isValidUwwPoint,
  recalculateStatsFromEvents,
  evaluateTieBreaker,
  checkTechnicalSuperiority,
  checkDisqualification,
  suggestEndOfMatchVictory,
} from './uwwRules';
import { useMatchStore, initialMatchState } from '../store/useMatchStore';
import { MatchEvent, MatchState, WrestlerState } from '../types/match';

describe('Phase 2: UWW Rules Engine & Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    useMatchStore.setState({
      match: JSON.parse(JSON.stringify(initialMatchState)),
      isDisplayConnected: false,
      isControllerConnected: false,
    });
  });

  // Helper untuk membuat mock wrestler
  const createMockWrestler = (overrides: Partial<WrestlerState> = {}): WrestlerState => ({
    name: 'WRESTLER',
    countryOrTeam: 'INA',
    score: 0,
    cautions: 0,
    passivityCount: 0,
    hasChallenge: true,
    injuryTimer: { remainingMs: 120_000, isRunning: false, lastSyncedAt: null },
    bloodTimer: { remainingMs: 240_000, isRunning: false, lastSyncedAt: null },
    ...overrides,
  });

  // Helper untuk membuat mock event
  const createMockEvent = (overrides: Partial<MatchEvent> = {}): MatchEvent => ({
    id: `evt_${Math.random()}`,
    timestamp: Date.now(),
    period: 1,
    matchClockMs: 120_000,
    corner: 'RED',
    type: 'POINT',
    points: 1,
    ...overrides,
  });

  // Skenario 1: 4 poin mengalahkan 2 + 2 poin pada tie-breaker (HIGHEST_VALUE)
  it('1. 4 poin mengalahkan 2 + 2 poin pada tie-breaker (HIGHEST_VALUE)', () => {
    const red = createMockWrestler({ score: 4 });
    const blue = createMockWrestler({ score: 4 });

    const events: MatchEvent[] = [
      createMockEvent({ corner: 'RED', points: 4 }),
      createMockEvent({ corner: 'BLUE', points: 2 }),
      createMockEvent({ corner: 'BLUE', points: 2 }),
    ];

    const result = evaluateTieBreaker(red, blue, events);
    expect(result.leader).toBe('RED');
    expect(result.reason).toBe('HIGHEST_VALUE');
  });

  // Skenario 2: 2 + 2 poin mengalahkan 2 + 1 + 1 poin pada tie-breaker (HIGHEST_VALUE)
  it('2. 2 + 2 poin mengalahkan 2 + 1 + 1 poin pada tie-breaker (HIGHEST_VALUE)', () => {
    const red = createMockWrestler({ score: 4 });
    const blue = createMockWrestler({ score: 4 });

    const events: MatchEvent[] = [
      createMockEvent({ corner: 'RED', points: 2 }),
      createMockEvent({ corner: 'RED', points: 2 }),
      createMockEvent({ corner: 'BLUE', points: 2 }),
      createMockEvent({ corner: 'BLUE', points: 1 }),
      createMockEvent({ corner: 'BLUE', points: 1 }),
    ];

    const result = evaluateTieBreaker(red, blue, events);
    expect(result.leader).toBe('RED');
    expect(result.reason).toBe('HIGHEST_VALUE');
  });

  // Skenario 3: Poin identik (2 + 1 vs 2 + 1), caution lebih sedikit menang (FEWEST_CAUTIONS)
  it('3. Poin identik (2 + 1 vs 2 + 1), caution lebih sedikit menang (FEWEST_CAUTIONS)', () => {
    const red = createMockWrestler({ score: 3, cautions: 0 });
    const blue = createMockWrestler({ score: 3, cautions: 1 });

    const events: MatchEvent[] = [
      createMockEvent({ corner: 'RED', points: 2 }),
      createMockEvent({ corner: 'RED', points: 1 }),
      createMockEvent({ corner: 'BLUE', points: 2 }),
      createMockEvent({ corner: 'BLUE', points: 1 }),
      createMockEvent({ corner: 'BLUE', type: 'CAUTION', points: 0 }),
    ];

    const result = evaluateTieBreaker(red, blue, events);
    expect(result.leader).toBe('RED');
    expect(result.reason).toBe('FEWEST_CAUTIONS');
  });

  // Skenario 4: Poin & caution identik, pencetak poin terakhir menang (LAST_POINT)
  it('4. Poin & caution identik, pencetak poin terakhir menang (LAST_POINT)', () => {
    const red = createMockWrestler({ score: 3, cautions: 0 });
    const blue = createMockWrestler({ score: 3, cautions: 0 });

    const events: MatchEvent[] = [
      createMockEvent({ corner: 'RED', points: 2 }),
      createMockEvent({ corner: 'RED', points: 1 }),
      createMockEvent({ corner: 'BLUE', points: 1 }),
      createMockEvent({ corner: 'BLUE', points: 2 }), // BLUE adalah pencetak poin terakhir
    ];

    const result = evaluateTieBreaker(red, blue, events);
    expect(result.leader).toBe('BLUE');
    expect(result.reason).toBe('LAST_POINT');
  });

  // Skenario 5: Skor 0 - 0 mengembalikan leader: null
  it('5. Skor 0 - 0 mengembalikan leader: null', () => {
    const red = createMockWrestler({ score: 0 });
    const blue = createMockWrestler({ score: 0 });
    const events: MatchEvent[] = [];

    const result = evaluateTieBreaker(red, blue, events);
    expect(result.leader).toBeNull();
    expect(result.reason).toBeNull();
  });

  // Skenario 6: VSU FS memicu di selisih 10 (selisih 9 tidak memicu)
  it('6. VSU FS memicu di selisih 10 (selisih 9 tidak memicu)', () => {
    const state9: MatchState = {
      ...initialMatchState,
      metadata: { ...initialMatchState.metadata, style: 'FS' },
      red: createMockWrestler({ score: 9 }),
      blue: createMockWrestler({ score: 0 }),
    };
    expect(checkTechnicalSuperiority(state9).triggered).toBe(false);

    const state10: MatchState = {
      ...state9,
      red: createMockWrestler({ score: 10 }),
    };
    const res10 = checkTechnicalSuperiority(state10);
    expect(res10.triggered).toBe(true);
    expect(res10.leader).toBe('RED');
    expect(res10.suggestedVictoryType).toBe('VSU');
  });

  // Skenario 7: VSU GR memicu di selisih 8 (selisih 7 tidak memicu)
  it('7. VSU GR memicu di selisih 8 (selisih 7 tidak memicu)', () => {
    const state7: MatchState = {
      ...initialMatchState,
      metadata: { ...initialMatchState.metadata, style: 'GR' },
      red: createMockWrestler({ score: 0 }),
      blue: createMockWrestler({ score: 7 }),
    };
    expect(checkTechnicalSuperiority(state7).triggered).toBe(false);

    const state8: MatchState = {
      ...state7,
      blue: createMockWrestler({ score: 8 }),
    };
    const res8 = checkTechnicalSuperiority(state8);
    expect(res8.triggered).toBe(true);
    expect(res8.leader).toBe('BLUE');
    expect(res8.suggestedVictoryType).toBe('VSU');
  });

  // Skenario 8: Membedakan VSU (10-0) dan VSU1 (11-1)
  it('8. Membedakan VSU (10-0) dan VSU1 (11-1)', () => {
    const stateVsu: MatchState = {
      ...initialMatchState,
      metadata: { ...initialMatchState.metadata, style: 'FS' },
      red: createMockWrestler({ score: 10 }),
      blue: createMockWrestler({ score: 0 }),
    };
    expect(checkTechnicalSuperiority(stateVsu).suggestedVictoryType).toBe('VSU');

    const stateVsu1: MatchState = {
      ...initialMatchState,
      metadata: { ...initialMatchState.metadata, style: 'FS' },
      red: createMockWrestler({ score: 11 }),
      blue: createMockWrestler({ score: 1 }),
    };
    expect(checkTechnicalSuperiority(stateVsu1).suggestedVictoryType).toBe('VSU1');
  });

  // Skenario 9: cautions === 3 memicu DSQ alert dan menentukan lawan sebagai pemenang
  it('9. cautions === 3 memicu DSQ alert dan menentukan lawan sebagai pemenang', () => {
    const stateSafe: MatchState = {
      ...initialMatchState,
      red: createMockWrestler({ cautions: 2 }),
      blue: createMockWrestler({ cautions: 1 }),
    };
    expect(checkDisqualification(stateSafe).triggered).toBe(false);

    const stateDsqRed: MatchState = {
      ...initialMatchState,
      red: createMockWrestler({ cautions: 3 }),
      blue: createMockWrestler({ cautions: 0 }),
    };
    const dsqRed = checkDisqualification(stateDsqRed);
    expect(dsqRed.triggered).toBe(true);
    expect(dsqRed.disqualifiedCorner).toBe('RED');
    expect(dsqRed.winnerCorner).toBe('BLUE');

    const stateDsqBlue: MatchState = {
      ...initialMatchState,
      red: createMockWrestler({ cautions: 1 }),
      blue: createMockWrestler({ cautions: 3 }),
    };
    const dsqBlue = checkDisqualification(stateDsqBlue);
    expect(dsqBlue.triggered).toBe(true);
    expect(dsqBlue.disqualifiedCorner).toBe('BLUE');
    expect(dsqBlue.winnerCorner).toBe('RED');
  });

  // Skenario 10: addPoints membatalkan activityClock yang sedang berjalan
  it('10. addPoints membatalkan activityClock yang sedang berjalan', () => {
    const store = useMatchStore.getState();
    store.startActivityClock('RED');

    expect(useMatchStore.getState().match.activityClock.activeCorner).toBe('RED');
    expect(useMatchStore.getState().match.activityClock.remainingMs).toBe(30_000);

    // BLUE mencetak poin -> activity clock langsung dibatalkan
    store.addPoints('BLUE', 2);

    const updated = useMatchStore.getState().match;
    expect(updated.blue.score).toBe(2);
    expect(updated.activityClock.activeCorner).toBeNull();
    expect(updated.activityClock.isRunning).toBe(false);
  });

  // Skenario 11: GR passivity langsung menambah +1 lawan tanpa menyalakan activityClock
  it('11. GR passivity langsung menambah +1 lawan tanpa menyalakan activityClock', () => {
    const store = useMatchStore.getState();
    store.updateMetadata({ style: 'GR' });

    // RED pasif dalam gaya Greco-Roman
    store.addPassivity('RED');

    const updated = useMatchStore.getState().match;
    expect(updated.red.passivityCount).toBe(1);
    expect(updated.blue.score).toBe(1); // Lawan otomatis mendapat +1 poin
    expect(updated.activityClock.activeCorner).toBeNull(); // Tidak ada Activity Clock pada GR
    expect(updated.events.length).toBe(2); // 1 PASSIVITY + 1 POINT
  });

  // Skenario 12: undoLastEvent mengembalikan skor, caution, dan evaluasi tie-breaker secara akurat
  it('12. undoLastEvent mengembalikan skor, caution, dan evaluasi tie-breaker secara akurat', () => {
    const store = useMatchStore.getState();

    // RED: +4 poin
    store.addPoints('RED', 4);
    // BLUE: +2 poin
    store.addPoints('BLUE', 2);
    // BLUE: +2 poin (skor jadi 4 - 4, RED unggul tie-breaker karena poin 4 tunggal)
    store.addPoints('BLUE', 2);

    expect(store.getTieBreaker().leader).toBe('RED');

    // RED melakukan pelanggaran -> Caution + 1 poin lawan (grouped atomic event)
    store.addCaution('RED', 1);
    expect(useMatchStore.getState().match.red.cautions).toBe(1);
    expect(useMatchStore.getState().match.blue.score).toBe(5);

    // Lakukan Undo -> Caution dan Poin lawan harus dibatalkan sekaligus
    store.undoLastEvent();
    const afterUndoCaution = useMatchStore.getState().match;
    expect(afterUndoCaution.red.cautions).toBe(0);
    expect(afterUndoCaution.blue.score).toBe(4);
    expect(useMatchStore.getState().getTieBreaker().leader).toBe('RED');

    // Undo poin terakhir BLUE (+2)
    store.undoLastEvent();
    const afterUndoBlue2 = useMatchStore.getState().match;
    expect(afterUndoBlue2.blue.score).toBe(2);
    expect(afterUndoBlue2.red.score).toBe(4);
  });

  // Skenario Tambahan: UWW FS Passivity Rules (1 = verbal warning, 2 = 30s Activity Clock)
  it('13. FS passivity: ke-1 tidak menyalakan clock, ke-2 menyalakan 30s Activity Clock', () => {
    const store = useMatchStore.getState();
    store.updateMetadata({ style: 'FS' });

    // Passivity ke-1
    store.addPassivity('RED');
    expect(useMatchStore.getState().match.red.passivityCount).toBe(1);
    expect(useMatchStore.getState().match.blue.score).toBe(0);
    expect(useMatchStore.getState().match.activityClock.activeCorner).toBeNull();

    // Passivity ke-2
    store.addPassivity('RED');
    expect(useMatchStore.getState().match.red.passivityCount).toBe(2);
    expect(useMatchStore.getState().match.blue.score).toBe(0);
    expect(useMatchStore.getState().match.activityClock.activeCorner).toBe('RED');
    expect(useMatchStore.getState().match.activityClock.remainingMs).toBe(30_000);
  });

  // Skenario Tambahan: Challenge Resolution
  it('14. Challenge resolution: WON mempertahankan kuota, LOST memberi +1 lawan dan mencabut kuota', () => {
    const store = useMatchStore.getState();

    // RED open challenge
    store.openChallenge('RED');
    expect(useMatchStore.getState().match.activeChallengeCorner).toBe('RED');

    // Challenge WON
    store.resolveChallenge('WON');
    expect(useMatchStore.getState().match.activeChallengeCorner).toBeNull();
    expect(useMatchStore.getState().match.red.hasChallenge).toBe(true);
    expect(useMatchStore.getState().match.blue.score).toBe(0);

    // RED open challenge lagi & LOST
    store.openChallenge('RED');
    store.resolveChallenge('LOST');
    expect(useMatchStore.getState().match.activeChallengeCorner).toBeNull();
    expect(useMatchStore.getState().match.red.hasChallenge).toBe(false);
    expect(useMatchStore.getState().match.blue.score).toBe(1); // Lawan dapat +1
  });

  // Skenario Tambahan: 5 poin mengalahkan 4 + 1 poin pada tie-breaker
  it('15. 5 poin mengalahkan 4 + 1 poin pada tie-breaker (HIGHEST_VALUE)', () => {
    const red = createMockWrestler({ score: 5 });
    const blue = createMockWrestler({ score: 5 });

    const events: MatchEvent[] = [
      createMockEvent({ corner: 'RED', points: 5 }),
      createMockEvent({ corner: 'BLUE', points: 4 }),
      createMockEvent({ corner: 'BLUE', points: 1 }),
    ];

    const result = evaluateTieBreaker(red, blue, events);
    expect(result.leader).toBe('RED');
    expect(result.reason).toBe('HIGHEST_VALUE');
  });

  // Skenario Tambahan: Validasi poin UWW (1, 2, 4, 5 sah; 3 tidak sah)
  it('16. Validasi poin sah UWW (1, 2, 4, 5 sah; 3 tidak sah)', () => {
    expect(isValidUwwPoint(1)).toBe(true);
    expect(isValidUwwPoint(2)).toBe(true);
    expect(isValidUwwPoint(4)).toBe(true);
    expect(isValidUwwPoint(5)).toBe(true);

    expect(isValidUwwPoint(3)).toBe(false);
    expect(isValidUwwPoint(6)).toBe(false);
    expect(isValidUwwPoint(0)).toBe(false);
  });

  // Skenario Tambahan: Durasi babak & jeda berdasarkan kategori umur
  it('17. Durasi babak sesuai kategori umur UWW & ambang batas VSU', () => {
    expect(getPeriodDurationMs('SENIOR')).toBe(180_000);
    expect(getPeriodDurationMs('U23')).toBe(180_000);
    expect(getPeriodDurationMs('U20')).toBe(180_000);
    expect(getPeriodDurationMs('U17')).toBe(120_000);
    expect(getPeriodDurationMs('U15')).toBe(120_000);
    expect(getBreakDurationMs()).toBe(30_000);

    expect(getTechSuperiorityThreshold('FS')).toBe(10);
    expect(getTechSuperiorityThreshold('WW')).toBe(10);
    expect(getTechSuperiorityThreshold('GR')).toBe(8);
  });

  // Skenario Tambahan: Saran kemenangan akhir laga (VPO vs VPO1)
  it('18. Saran pemenang akhir laga (VPO lawan 0 poin vs VPO1 lawan >= 1 poin)', () => {
    const stateVpo: MatchState = {
      ...initialMatchState,
      red: createMockWrestler({ score: 3 }),
      blue: createMockWrestler({ score: 0 }),
    };
    const resVpo = suggestEndOfMatchVictory(stateVpo);
    expect(resVpo?.corner).toBe('RED');
    expect(resVpo?.type).toBe('VPO');

    const stateVpo1: MatchState = {
      ...initialMatchState,
      red: createMockWrestler({ score: 4 }),
      blue: createMockWrestler({ score: 2 }),
    };
    const resVpo1 = suggestEndOfMatchVictory(stateVpo1);
    expect(resVpo1?.corner).toBe('RED');
    expect(resVpo1?.type).toBe('VPO1');
  });

  // Skenario Tambahan: Rekalkulasi deterministik dari event
  it('19. recalculateStatsFromEvents akurat menghitung score, caution, passivity', () => {
    const events: MatchEvent[] = [
      createMockEvent({ corner: 'RED', type: 'POINT', points: 2 }),
      createMockEvent({ corner: 'RED', type: 'POINT', points: 4 }),
      createMockEvent({ corner: 'RED', type: 'CAUTION', points: 0 }),
      createMockEvent({ corner: 'RED', type: 'PASSIVITY', points: 0 }),
      createMockEvent({ corner: 'BLUE', type: 'POINT', points: 1 }),
    ];

    const redStats = recalculateStatsFromEvents(events, 'RED');
    expect(redStats.score).toBe(6);
    expect(redStats.cautions).toBe(1);
    expect(redStats.passivityCount).toBe(1);

    const blueStats = recalculateStatsFromEvents(events, 'BLUE');
    expect(blueStats.score).toBe(1);
    expect(blueStats.cautions).toBe(0);
    expect(blueStats.passivityCount).toBe(0);
  });
});
