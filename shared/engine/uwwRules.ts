import {
  AgeCategory,
  Corner,
  MatchEvent,
  MatchState,
  PointValue,
  WrestlerState,
  WrestlingStyle,
} from '../types/match';

/**
 * Durasi babak pertandingan berdasarkan kategori umur (ms):
 * SENIOR / U23 / U20: 2 babak x 3:00 (180_000 ms)
 * U17 / U15: 2 babak x 2:00 (120_000 ms)
 */
export function getPeriodDurationMs(ageCategory: AgeCategory): number {
  switch (ageCategory) {
    case 'SENIOR':
    case 'U23':
    case 'U20':
      return 180_000;
    case 'U17':
    case 'U15':
      return 120_000;
    default:
      return 180_000;
  }
}

/**
 * Durasi jeda istirahat antar babak: 30 detik (30_000 ms)
 */
export function getBreakDurationMs(): number {
  return 30_000;
}

/**
 * Durasi Shot Clock / Activity Time (UWW FS & WW): 30 detik (30_000 ms)
 */
export function getActivityClockDurationMs(): number {
  return 30_000;
}

/**
 * Ambang batas Technical Superiority (selisih poin):
 * FS (Freestyle) & WW (Women's Wrestling): selisih >= 10 poin
 * GR (Greco-Roman): selisih >= 8 poin
 */
export function getTechSuperiorityThreshold(style: WrestlingStyle): number {
  switch (style) {
    case 'FS':
    case 'WW':
      return 10;
    case 'GR':
      return 8;
  }
}

/**
 * Validasi nilai poin sah UWW modern: hanya 1, 2, 4, atau 5.
 * Tidak ada poin +3 dalam gulat UWW modern.
 */
export function isValidUwwPoint(points: number): points is PointValue {
  return points === 1 || points === 2 || points === 4 || points === 5;
}

/**
 * Hitung ulang statistik pegulat secara deterministik dari kumpulan event.
 * Mencegah state korup setelah operasi Undo.
 */
export function recalculateStatsFromEvents(
  events: MatchEvent[],
  corner: Corner
): { score: number; cautions: number; passivityCount: number } {
  let score = 0;
  let cautions = 0;
  let passivityCount = 0;

  for (const evt of events) {
    if (evt.corner === corner) {
      if (evt.type === 'CAUTION') {
        cautions += 1;
      } else if (evt.type === 'PASSIVITY') {
        passivityCount += 1;
      }

      if (evt.points > 0) {
        score += evt.points;
      }
    }
  }

  return { score, cautions, passivityCount };
}

export type TieBreakerReason = 'HIGHEST_VALUE' | 'FEWEST_CAUTIONS' | 'LAST_POINT';

export interface TieBreakerResult {
  leader: Corner | null;
  reason: TieBreakerReason | null;
}

/**
 * Evaluasi Kriteria Tie-Breaker saat skor seri dan > 0:
 * Sesuai Peraturan Resmi UWW Pasal 36:
 * 1. Kriteria 1 (HIGHEST_VALUE): Nilai poin teknis tunggal tertinggi.
 *    Bandingkan jumlah poin 5, jika sama bandingkan jumlah poin 4, lalu 2, lalu 1.
 * 2. Kriteria 2 (FEWEST_CAUTIONS): Jumlah Caution ('O') paling sedikit.
 * 3. Kriteria 3 (LAST_POINT): Pencetak poin terakhir (urutan kronologis event).
 */
export function evaluateTieBreaker(
  red: WrestlerState,
  blue: WrestlerState,
  events: MatchEvent[]
): TieBreakerResult {
  // Hanya berlaku jika skor seri dan > 0
  if (red.score !== blue.score || red.score === 0) {
    return { leader: null, reason: null };
  }

  // Kriteria 1: HIGHEST_VALUE (5 -> 4 -> 2 -> 1)
  const countPoints = (corner: Corner, value: number) => {
    return events.filter((e) => e.corner === corner && e.points === value).length;
  };

  const pointValues = [5, 4, 2, 1];
  for (const val of pointValues) {
    const redCount = countPoints('RED', val);
    const blueCount = countPoints('BLUE', val);

    if (redCount > blueCount) {
      return { leader: 'RED', reason: 'HIGHEST_VALUE' };
    }
    if (blueCount > redCount) {
      return { leader: 'BLUE', reason: 'HIGHEST_VALUE' };
    }
  }

  // Kriteria 2: FEWEST_CAUTIONS (Caution paling sedikit unggul)
  if (red.cautions < blue.cautions) {
    return { leader: 'RED', reason: 'FEWEST_CAUTIONS' };
  }
  if (blue.cautions < red.cautions) {
    return { leader: 'BLUE', reason: 'FEWEST_CAUTIONS' };
  }

  // Kriteria 3: LAST_POINT (Pencetak poin teknis terakhir)
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    if (evt.points > 0) {
      return { leader: evt.corner, reason: 'LAST_POINT' };
    }
  }

  return { leader: null, reason: null };
}

export interface TechSuperiorityResult {
  triggered: boolean;
  leader: Corner | null;
  suggestedVictoryType: 'VSU' | 'VSU1' | null;
}

/**
 * Periksa kondisi Technical Superiority (VSU / VSU1)
 * FS/WW: selisih >= 10
 * GR: selisih >= 8
 * Lawan 0 poin -> VSU
 * Lawan >= 1 poin -> VSU1
 */
export function checkTechnicalSuperiority(state: MatchState): TechSuperiorityResult {
  const threshold = getTechSuperiorityThreshold(state.metadata.style);
  const diff = Math.abs(state.red.score - state.blue.score);

  if (diff >= threshold) {
    const leader: Corner = state.red.score > state.blue.score ? 'RED' : 'BLUE';
    const loserScore = leader === 'RED' ? state.blue.score : state.red.score;
    const suggestedVictoryType = loserScore === 0 ? 'VSU' : 'VSU1';
    return { triggered: true, leader, suggestedVictoryType };
  }

  return { triggered: false, leader: null, suggestedVictoryType: null };
}

export interface DisqualificationResult {
  triggered: boolean;
  disqualifiedCorner: Corner | null;
  winnerCorner: Corner | null;
}

/**
 * Periksa diskualifikasi akibat akumulasi 3 Caution ('O')
 */
export function checkDisqualification(state: MatchState): DisqualificationResult {
  if (state.red.cautions >= 3) {
    return { triggered: true, disqualifiedCorner: 'RED', winnerCorner: 'BLUE' };
  }
  if (state.blue.cautions >= 3) {
    return { triggered: true, disqualifiedCorner: 'BLUE', winnerCorner: 'RED' };
  }
  return { triggered: false, disqualifiedCorner: null, winnerCorner: null };
}

export interface EndOfMatchVictoryResult {
  corner: Corner;
  type: 'VPO' | 'VPO1';
}

/**
 * Sarankan pemenang di akhir waktu normal (Points: VPO / VPO1)
 */
export function suggestEndOfMatchVictory(state: MatchState): EndOfMatchVictoryResult | null {
  let leader: Corner | null = null;

  if (state.red.score > state.blue.score) {
    leader = 'RED';
  } else if (state.blue.score > state.red.score) {
    leader = 'BLUE';
  } else if (state.red.score === state.blue.score && state.red.score > 0) {
    const tb = evaluateTieBreaker(state.red, state.blue, state.events);
    leader = tb.leader;
  }

  if (!leader) return null;

  const loserScore = leader === 'RED' ? state.blue.score : state.red.score;
  const type: 'VPO' | 'VPO1' = loserScore === 0 ? 'VPO' : 'VPO1';

  return { corner: leader, type };
}
