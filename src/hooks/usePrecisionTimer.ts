import { useState, useEffect, useRef } from 'react';
import { useMatchStore } from '../store/useMatchStore';
import { computeRemainingMs, formatClock } from '../engine/timerEngine';

interface PrecisionTimerOptions {
  isMaster?: boolean; // True khusus untuk /controller (menjalankan master tick loop ~50ms)
  showTenthsUnderTenSeconds?: boolean;
}

export interface PrecisionTimerValues {
  mainMs: number;
  formattedMain: string;
  isMainRunning: boolean;

  breakMs: number;
  formattedBreak: string;
  isBreakRunning: boolean;

  activityMs: number;
  formattedActivity: string;
  isActivityRunning: boolean;
  activeCorner: 'RED' | 'BLUE' | null;

  redInjuryMs: number;
  formattedRedInjury: string;
  isRedInjuryRunning: boolean;

  redBloodMs: number;
  formattedRedBlood: string;
  isRedBloodRunning: boolean;

  blueInjuryMs: number;
  formattedBlueInjury: string;
  isBlueInjuryRunning: boolean;

  blueBloodMs: number;
  formattedBlueBlood: string;
  isBlueBloodRunning: boolean;
}

export function usePrecisionTimer(options: PrecisionTimerOptions = {}): PrecisionTimerValues {
  const { isMaster = false, showTenthsUnderTenSeconds = true } = options;
  const match = useMatchStore((s) => s.match);
  const handleMainClockExpired = useMatchStore((s) => s.handleMainClockExpired);
  const handleBreakClockExpired = useMatchStore((s) => s.handleBreakClockExpired);
  const handleActivityClockExpired = useMatchStore((s) => s.handleActivityClockExpired);

  const [, setTick] = useState(0);
  const rafIdRef = useRef<number | null>(null);
  const lastMasterCheckRef = useRef<number>(0);

  useEffect(() => {
    let active = true;

    const frame = () => {
      if (!active) return;
      const now = Date.now();

      // Master tick loop (~50ms) khusus di /controller untuk menangani transisi batas waktu
      if (isMaster && now - lastMasterCheckRef.current >= 50) {
        lastMasterCheckRef.current = now;

        const currentMatch = useMatchStore.getState().match;

        // 1. Cek Main Clock Expiration
        if (currentMatch.mainClock.isRunning) {
          const rem = computeRemainingMs(currentMatch.mainClock, now);
          if (rem <= 0) {
            handleMainClockExpired();
          }
        }

        // 2. Cek Break Clock Expiration
        if (currentMatch.breakClock.isRunning) {
          const rem = computeRemainingMs(currentMatch.breakClock, now);
          if (rem <= 0) {
            handleBreakClockExpired();
          }
        }

        // 3. Cek Activity Clock Expiration (ketika main clock masih tersisa)
        if (
          currentMatch.activityClock.isRunning &&
          currentMatch.activityClock.activeCorner !== null
        ) {
          const rem = computeRemainingMs(currentMatch.activityClock, now);
          if (rem <= 0) {
            handleActivityClockExpired();
          }
        }
      }

      // Re-render frame 60fps jika ada timer yang sedang aktif
      const isAnyTimerRunning =
        match.mainClock.isRunning ||
        match.breakClock.isRunning ||
        match.activityClock.isRunning ||
        match.red.injuryTimer.isRunning ||
        match.red.bloodTimer.isRunning ||
        match.blue.injuryTimer.isRunning ||
        match.blue.bloodTimer.isRunning;

      if (isAnyTimerRunning) {
        setTick((prev) => (prev + 1) % 1000000);
      }

      rafIdRef.current = requestAnimationFrame(frame);
    };

    rafIdRef.current = requestAnimationFrame(frame);

    return () => {
      active = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [
    isMaster,
    match.mainClock.isRunning,
    match.breakClock.isRunning,
    match.activityClock.isRunning,
    match.red.injuryTimer.isRunning,
    match.red.bloodTimer.isRunning,
    match.blue.injuryTimer.isRunning,
    match.blue.bloodTimer.isRunning,
    handleMainClockExpired,
    handleBreakClockExpired,
    handleActivityClockExpired,
  ]);

  const now = Date.now();
  const mainMs = computeRemainingMs(match.mainClock, now);
  const breakMs = computeRemainingMs(match.breakClock, now);
  const activityMs = computeRemainingMs(match.activityClock, now);

  const redInjuryMs = computeRemainingMs(match.red.injuryTimer, now);
  const redBloodMs = computeRemainingMs(match.red.bloodTimer, now);
  const blueInjuryMs = computeRemainingMs(match.blue.injuryTimer, now);
  const blueBloodMs = computeRemainingMs(match.blue.bloodTimer, now);

  return {
    mainMs,
    formattedMain: formatClock(mainMs, showTenthsUnderTenSeconds),
    isMainRunning: match.mainClock.isRunning,

    breakMs,
    formattedBreak: formatClock(breakMs, false),
    isBreakRunning: match.breakClock.isRunning,

    activityMs,
    formattedActivity: formatClock(activityMs, false),
    isActivityRunning: match.activityClock.isRunning,
    activeCorner: match.activityClock.activeCorner,

    redInjuryMs,
    formattedRedInjury: formatClock(redInjuryMs, false),
    isRedInjuryRunning: match.red.injuryTimer.isRunning,

    redBloodMs,
    formattedRedBlood: formatClock(redBloodMs, false),
    isRedBloodRunning: match.red.bloodTimer.isRunning,

    blueInjuryMs,
    formattedBlueInjury: formatClock(blueInjuryMs, false),
    isBlueInjuryRunning: match.blue.injuryTimer.isRunning,

    blueBloodMs,
    formattedBlueBlood: formatClock(blueBloodMs, false),
    isBlueBloodRunning: match.blue.bloodTimer.isRunning,
  };
}
