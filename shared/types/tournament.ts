import { AgeCategory, WrestlingStyle, Corner, VictoryType } from './match';

// Format bagan pertandingan resmi UWW berdasarkan jumlah atlet
export type DivisionFormat =
  | 'SINGLE_BOUT'
  | 'NORDIC'
  | 'GROUP_CROSS'
  | 'ELIMINATION_REPECHAGE';

// Data entitas pegulat dalam turnamen
export interface Athlete {
  id: string;
  name: string;
  region: string;           // Daerah asal penuh (contoh: "LAMPUNG")
  regionCode: string;       // Kode singkat di papan skor TV (contoh: "LPG")
  style: WrestlingStyle;
  ageCategory: AgeCategory;
  weightClass: string;      // Format terstandar (contoh: "74 KG")
  seed?: number;            // Opsional 1..4
  drawNumber?: number;      // Nomor hasil undian resmi UWW (1..N)
}

// Kategori pertandingan (divisi spesifik per kelas & gaya)
export interface CategoryDivision {
  id: string;               // Composite key: `${style}_${ageCategory}_${weightClass}`
  style: WrestlingStyle;
  ageCategory: AgeCategory;
  weightClass: string;
  athleteIds: string[];
  format: DivisionFormat;
  assignedMat: string;      // Default "MAT A"
  isDrawLocked: boolean;
}

// Error pelaporan baris Excel yang tidak valid
export interface ExcelParseError {
  row: number;              // Nomor baris Excel (mulai dari 2)
  field: string;
  reason: string;
}

// Hasil eksekusi parsing Excel
export interface ExcelImportResult {
  validAthletes: Omit<Athlete, 'id'>[];
  errors: ExcelParseError[];
  duplicateWarnings: string[];
}

// ==========================================
// Tipe Data Forward-Compatible (Phase 9 - 11)
// ==========================================

export type BoutRound =
  | 'NORDIC_R1' | 'NORDIC_R2' | 'NORDIC_R3' | 'NORDIC_R4' | 'NORDIC_R5'
  | 'GROUP_A' | 'GROUP_B'
  | 'QUALIFICATION' | 'ROUND_OF_32' | 'ROUND_OF_16'
  | 'QUARTERFINAL' | 'SEMIFINAL'
  | 'REPECHAGE_1' | 'REPECHAGE_2'
  | 'BRONZE_1' | 'BRONZE_2' | 'GOLD_FINAL';

export type BoutStatus =
  | 'TBD'           // Menunggu pemenang partai sebelumnya
  | 'SCHEDULED'     // Kedua atlet sudah pasti, masuk antrean
  | 'ON_DECK'       // Partai berikutnya (atlet bersiap di pinggir matras)
  | 'IN_PROGRESS'   // Sedang dimainkan di matras
  | 'COMPLETED';    // Selesai, hasil terkunci

export interface BoutResult {
  winnerCorner: Corner;
  winnerAthleteId: string;
  loserAthleteId: string;
  redScore: number;
  blueScore: number;
  victoryType: VictoryType;
  redClassificationPts: number;
  blueClassificationPts: number;
  completedAt: number;
}

export interface TournamentBout {
  id: string;
  divisionId: string;
  boutNumber: number | null;       // Nomor urut partai resmi di matras (1, 2, 3...)
  matName: string;                 // "MAT A", "MAT B", dst.
  round: BoutRound;
  roundOrder: number;              // Urutan kronologis babak (10=Qual, 20=R16, 30=QF, 40=SF, 50=Rep, 60=Bronze/Final)
  bracketPosition: number;         // Posisi vertikal pada bagan untuk rendering visual
  bracketSide?: 'TOP' | 'BOTTOM';  // Sisi bagan untuk kalkulasi Single Repechage
  redAthleteId: string | null;
  blueAthleteId: string | null;
  redSourceLabel?: string;         // Contoh: "Winner QF #1" / "A1" / "Loser SF #1"
  blueSourceLabel?: string;
  nextWinBoutId?: string;
  nextWinSlot?: Corner;
  nextLoseBoutId?: string;
  nextLoseSlot?: Corner;
  status: BoutStatus;
  result?: BoutResult;
}

export interface StandingRow {
  athleteId: string;
  athleteName?: string;
  regionCode?: string;
  rank: number;
  matchesPlayed: number;
  wins: number;
  losses?: number;
  classificationPoints: number;
  vfaCount: number;
  vsuCount: number;
  technicalPointsFor: number;
  technicalPointsAgainst: number;
}

// ==========================================
// Snapshot Sinkronisasi TV Jadwal (Phase 11)
// ==========================================

export interface ActiveMatSnapshot {
  matName: string;
  boutNumber: number | null;
  divisionLabel: string;       // Contoh: "FS • 74 KG • QUARTERFINAL"
  redName: string;
  redRegion: string;
  redScore: number;
  blueName: string;
  blueRegion: string;
  blueScore: number;
  periodLabel: string;         // "P1", "BREAK", "P2", "READY", "FINAL"
  remainingMs: number;
  isRunning: boolean;
  lastSyncedAt: number | null;
}

export interface UpcomingBoutSnapshot {
  id: string;
  matName: string;
  boutNumber: number | null;
  divisionLabel: string;       // Contoh: "FS • 74 KG"
  roundLabel: string;          // Contoh: "SEMIFINAL"
  redName: string;
  redRegion: string;
  blueName: string;
  blueRegion: string;
  queueBadge: 'ON_DECK' | 'IN_THE_HOLE' | 'UPCOMING';
}

export interface ScheduleSnapshot {
  updatedAt: number;
  activeMats: ActiveMatSnapshot[];
  upcomingBouts: UpcomingBoutSnapshot[];
}
