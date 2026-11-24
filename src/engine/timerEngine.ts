import { TimerState } from '../types/match';
import { getCalibratedNow } from '../store/socketClient';

/**
 * Menghitung sisa waktu timer secara presisi berdasarkan selisih timestamp (anti-drift)
 * dan terkalibrasi dengan serverTimeOffset.
 */
export function computeRemainingMs(timer: TimerState, now = getCalibratedNow()): number {
  if (!timer.isRunning || timer.lastSyncedAt === null) {
    return Math.max(0, timer.remainingMs);
  }
  const elapsed = now - timer.lastSyncedAt;
  return Math.max(0, timer.remainingMs - elapsed);
}

/**
 * Format milidetik ke string tampilan waktu standar UWW:
 * - Jika ms <= 0: '0:00' (atau '0:00.0' bila mode tenths aktif).
 * - Jika ms >= 10_000 atau !showTenthsUnderTenSeconds: Math.ceil(ms / 1000) -> M:SS (misal: 3:00, 0:15).
 * - Jika ms < 10_000 dan showTenthsUnderTenSeconds: 0:0S.t (misal: 0:09.4, 0:01.8).
 */
export function formatClock(ms: number, showTenthsUnderTenSeconds = true): string {
  if (ms <= 0) {
    return showTenthsUnderTenSeconds ? '0:00.0' : '0:00';
  }

  if (ms >= 10_000 || !showTenthsUnderTenSeconds) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Khusus waktu < 10 detik dengan persepuluh detik (.tenths)
  const seconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `0:0${seconds}.${tenths}`;
}

/**
 * Parse string MM:SS atau SS ke milidetik (misal "3:00" -> 180_000, "0:30" -> 30_000).
 * Return null jika format tidak valid.
 */
export function parseClockToMs(timeStr: string): number | null {
  const trimmed = timeStr.trim();
  const parts = trimmed.split(':');

  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);
    if (isNaN(minutes) || isNaN(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) {
      return null;
    }
    return Math.round((minutes * 60 + seconds) * 1000);
  }

  if (parts.length === 1) {
    const seconds = parseFloat(parts[0]);
    if (isNaN(seconds) || seconds < 0) return null;
    return Math.round(seconds * 1000);
  }

  return null;
}
