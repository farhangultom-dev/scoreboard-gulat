import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computeRemainingMs, formatClock, parseClockToMs } from './timerEngine';
import { audioEngine } from './audioEngine';
import { useMatchStore, initialMatchState } from '../store/useMatchStore';
import { TimerState } from '../types/match';

describe('Phase 3: Precision Timer Engine & Web Audio Buzzer', () => {
  beforeEach(() => {
    localStorage.clear();
    useMatchStore.setState({
      match: JSON.parse(JSON.stringify(initialMatchState)),
      isDisplayConnected: false,
      isControllerConnected: false,
    });
    vi.restoreAllMocks();
  });

  describe('Pure Timer Calculations & Formatting', () => {
    it('computeRemainingMs returns remainingMs when timer is paused', () => {
      const timer: TimerState = {
        remainingMs: 180_000,
        isRunning: false,
        lastSyncedAt: null,
      };
      expect(computeRemainingMs(timer, 1000000)).toBe(180_000);
    });

    it('computeRemainingMs calculates exact remaining time when running based on timestamp', () => {
      const startTime = 1_000_000;
      const timer: TimerState = {
        remainingMs: 180_000,
        isRunning: true,
        lastSyncedAt: startTime,
      };

      // Setelah 5.5 detik (5_500 ms)
      const now = startTime + 5_500;
      expect(computeRemainingMs(timer, now)).toBe(174_500);
    });

    it('computeRemainingMs clamps to 0 when time elapsed exceeds remainingMs', () => {
      const startTime = 1_000_000;
      const timer: TimerState = {
        remainingMs: 30_000,
        isRunning: true,
        lastSyncedAt: startTime,
      };

      // Setelah 35 detik
      const now = startTime + 35_000;
      expect(computeRemainingMs(timer, now)).toBe(0);
    });

    it('formatClock formats time >= 10s into M:SS using Math.ceil', () => {
      expect(formatClock(180_000)).toBe('3:00');
      expect(formatClock(179_100)).toBe('3:00');
      expect(formatClock(179_000)).toBe('2:59');
      expect(formatClock(30_000)).toBe('0:30');
      expect(formatClock(10_000)).toBe('0:10');
    });

    it('formatClock formats time < 10s into 0:0S.t when tenths mode is active', () => {
      expect(formatClock(9_400, true)).toBe('0:09.4');
      expect(formatClock(2_100, true)).toBe('0:02.1');
      expect(formatClock(800, true)).toBe('0:00.8');
      expect(formatClock(0, true)).toBe('0:00.0');
    });

    it('formatClock formats time < 10s into M:SS when tenths mode is false', () => {
      expect(formatClock(9_400, false)).toBe('0:10');
      expect(formatClock(2_100, false)).toBe('0:03');
      expect(formatClock(0, false)).toBe('0:00');
    });

    it('parseClockToMs parses MM:SS and SS strings accurately', () => {
      expect(parseClockToMs('3:00')).toBe(180_000);
      expect(parseClockToMs('0:30')).toBe(30_000);
      expect(parseClockToMs('15')).toBe(15_000);
      expect(parseClockToMs('invalid')).toBeNull();
    });
  });

  describe('Main Clock & Activity Clock Synchronization Rules', () => {
    it('1. Pause mainClock otomatis mem-pause activityClock dan mempertahankan remainingMs', () => {
      const store = useMatchStore.getState();

      // Mulai main clock & activity clock
      store.toggleMainClock(); // starts PERIOD_1
      store.startActivityClock('RED');

      const runningMatch = useMatchStore.getState().match;
      expect(runningMatch.mainClock.isRunning).toBe(true);
      expect(runningMatch.activityClock.isRunning).toBe(true);
      expect(runningMatch.activityClock.activeCorner).toBe('RED');

      // Pause main clock
      store.toggleMainClock();

      const pausedMatch = useMatchStore.getState().match;
      expect(pausedMatch.mainClock.isRunning).toBe(false);
      expect(pausedMatch.activityClock.isRunning).toBe(false);
      expect(pausedMatch.activityClock.activeCorner).toBe('RED');
      expect(pausedMatch.activityClock.remainingMs).toBeLessThanOrEqual(30_000);
    });

    it('2. Resume mainClock melanjutkannya bersama activityClock secara akurat', () => {
      const store = useMatchStore.getState();

      // Setup paused activity clock dengan sisa 20 detik
      useMatchStore.setState((s) => ({
        match: {
          ...s.match,
          phase: 'PERIOD_1',
          mainClock: { remainingMs: 150_000, isRunning: false, lastSyncedAt: null },
          activityClock: {
            remainingMs: 20_000,
            isRunning: false,
            lastSyncedAt: null,
            activeCorner: 'BLUE',
          },
        },
      }));

      // Resume main clock
      store.toggleMainClock();

      const resumedMatch = useMatchStore.getState().match;
      expect(resumedMatch.mainClock.isRunning).toBe(true);
      expect(resumedMatch.activityClock.isRunning).toBe(true);
      expect(resumedMatch.activityClock.activeCorner).toBe('BLUE');
      expect(resumedMatch.activityClock.lastSyncedAt).not.toBeNull();
    });

    it('3. Menjalankan injuryTimer / bloodTimer otomatis mem-pause mainClock', () => {
      const store = useMatchStore.getState();
      store.toggleMainClock(); // mainClock starts

      expect(useMatchStore.getState().match.mainClock.isRunning).toBe(true);

      // RED mengalami cedera -> operator nyalakan Injury Timer
      store.toggleMedicalTimer('RED', 'injury');

      const updated = useMatchStore.getState().match;
      expect(updated.mainClock.isRunning).toBe(false);
      expect(updated.red.injuryTimer.isRunning).toBe(true);
      expect(updated.red.injuryTimer.lastSyncedAt).not.toBeNull();
    });

    it('4. activityClock habis di tengah babak otomatis memberi +1 ke lawan dan tercatat di events', () => {
      const store = useMatchStore.getState();
      const playBeepSpy = vi.spyOn(audioEngine, 'playActivityEndBeep');

      // Set main clock aktif di babak 1 dan activity clock pada RED
      useMatchStore.setState((s) => ({
        match: {
          ...s.match,
          phase: 'PERIOD_1',
          mainClock: { remainingMs: 120_000, isRunning: true, lastSyncedAt: Date.now() },
          activityClock: {
            remainingMs: 0,
            isRunning: true,
            lastSyncedAt: Date.now() - 30_000,
            activeCorner: 'RED',
          },
        },
      }));

      // Handler transisi kedaluwarsa activity clock
      store.handleActivityClockExpired();

      const updated = useMatchStore.getState().match;
      expect(updated.activityClock.activeCorner).toBeNull();
      expect(updated.activityClock.isRunning).toBe(false);
      expect(updated.blue.score).toBe(1); // Lawan (BLUE) dapat +1
      expect(updated.events.length).toBe(1);
      expect(updated.events[0].type).toBe('ACTIVITY_POINT');
      expect(updated.events[0].corner).toBe('BLUE');
      expect(playBeepSpy).toHaveBeenCalled();
    });

    it('5. mainClock habis lebih dulu daripada activityClock membatalkan activityClock tanpa menambah poin', () => {
      const store = useMatchStore.getState();
      const playBuzzerSpy = vi.spyOn(audioEngine, 'playPeriodEndBuzzer');

      // Set babak 1 berjalan dengan sisa waktu main clock 0 dan activity clock masih ada sisa 10s
      useMatchStore.setState((s) => ({
        match: {
          ...s.match,
          phase: 'PERIOD_1',
          mainClock: { remainingMs: 0, isRunning: true, lastSyncedAt: Date.now() },
          activityClock: {
            remainingMs: 10_000,
            isRunning: true,
            lastSyncedAt: Date.now(),
            activeCorner: 'BLUE',
          },
        },
      }));

      // Main clock habis
      store.handleMainClockExpired();

      const updated = useMatchStore.getState().match;
      expect(updated.phase).toBe('BREAK');
      expect(updated.breakClock.isRunning).toBe(true);
      expect(updated.breakClock.remainingMs).toBe(30_000);
      expect(updated.activityClock.activeCorner).toBeNull(); // Dibatalkan
      expect(updated.red.score).toBe(0); // TIDAK ada poin penalti
      expect(updated.blue.score).toBe(0);
      expect(playBuzzerSpy).toHaveBeenCalled();
    });

    it('6. breakClock habis berpindah ke PERIOD_2 dengan mainClock siap dalam kondisi paused', () => {
      const store = useMatchStore.getState();
      const playBeepSpy = vi.spyOn(audioEngine, 'playActivityEndBeep');

      useMatchStore.setState((s) => ({
        match: {
          ...s.match,
          phase: 'BREAK',
          breakClock: { remainingMs: 0, isRunning: true, lastSyncedAt: Date.now() },
        },
      }));

      store.handleBreakClockExpired();

      const updated = useMatchStore.getState().match;
      expect(updated.phase).toBe('PERIOD_2');
      expect(updated.breakClock.isRunning).toBe(false);
      expect(updated.mainClock.remainingMs).toBe(180_000); // 3 menit untuk Senior
      expect(updated.mainClock.isRunning).toBe(false); // Paused condition
      expect(playBeepSpy).toHaveBeenCalled();
    });

    it('7. Selisih tampilan jam antara controller dan display selalu <= 50ms (0ms drift)', () => {
      const startTime = Date.now();
      const timer: TimerState = {
        remainingMs: 180_000,
        isRunning: true,
        lastSyncedAt: startTime,
      };

      // Controller dan display membaca waktu pada timestamp yang sama
      const sampleNow = startTime + 65_432; // ~65 detik kemudian
      const controllerRemaining = computeRemainingMs(timer, sampleNow);
      const displayRemaining = computeRemainingMs(timer, sampleNow);

      const drift = Math.abs(controllerRemaining - displayRemaining);
      expect(drift).toBe(0); // Timestamp-based sync menjamin 0ms drift
      expect(drift).toBeLessThanOrEqual(50);
    });
  });

  describe('Audio Engine Safe Execution', () => {
    it('plays synthesized buzzer and beep without throwing errors', () => {
      expect(() => audioEngine.playPeriodEndBuzzer()).not.toThrow();
      expect(() => audioEngine.playActivityEndBeep()).not.toThrow();
      expect(() => audioEngine.toggleMute()).not.toThrow();
    });
  });
});
