export type Corner = 'RED' | 'BLUE';
export type WrestlingStyle = 'FS' | 'WW' | 'GR';
export type AgeCategory = 'SENIOR' | 'U23' | 'U20' | 'U17' | 'U15';
export type MatchPhase = 'PRE_MATCH' | 'PERIOD_1' | 'BREAK' | 'PERIOD_2' | 'FINISHED';

export type VictoryType =
  | 'VFA'   // Fall (Pin)
  | 'VSU'   // Technical Superiority (loser 0 pts)
  | 'VSU1'  // Technical Superiority (loser >= 1 pt)
  | 'VPO'   // Points (loser 0 pts)
  | 'VPO1'  // Points (loser >= 1 pt)
  | 'DSQ'   // Disqualification (3 Cautions / Brutality)
  | 'VIN'   // Injury
  | 'VFO';  // Forfeit

export type PointValue = 1 | 2 | 4 | 5;

export type MatchEventType =
  | 'POINT'
  | 'CAUTION'
  | 'PASSIVITY'
  | 'ACTIVITY_POINT'
  | 'CHALLENGE_LOST_POINT'
  | 'MANUAL_ADJUST';

export interface MatchEvent {
  id: string;
  timestamp: number;        // Date.now()
  period: 1 | 2;
  matchClockMs: number;     // Sisa waktu main clock saat kejadian
  corner: Corner;           // Sudut yang menerima event/poin (untuk CAUTION/PASSIVITY = sudut yang dihukum)
  type: MatchEventType;
  points: number;           // 0 untuk CAUTION/PASSIVITY tanpa poin
  note?: string;
  groupId?: string;         // Mengelompokkan event terkait (misal: Caution + Poin Lawan) untuk atomic undo
}

export interface TimerState {
  remainingMs: number;
  isRunning: boolean;
  lastSyncedAt: number | null; // Date.now() saat terakhir start/sync
}

export interface IntermissionState {
  isActive: boolean;
  title: string;              // Contoh: "ISTIRAHAT PERTANDINGAN"
  subtitle?: string;          // Contoh: "Pertandingan akan dilanjutkan kembali dalam:"
  timer: TimerState;          // Countdown (default 30 menit = 1_800_000 ms)
}

export interface ActivityClockState extends TimerState {
  activeCorner: Corner | null; // Pegulat pasif yang wajib mencetak poin dalam 30s
}

export interface WrestlerState {
  name: string;
  countryOrTeam: string;    // Maks 3-6 huruf (misal: INA, JPN, JABAR)
  score: number;
  cautions: number;         // 0..3
  passivityCount: number;
  hasChallenge: boolean;
  injuryTimer: TimerState;  // Maks kumulatif 120_000 ms (2:00)
  bloodTimer: TimerState;   // Maks kumulatif 240_000 ms (4:00)
}

export interface MatchMetadata {
  matName: string;          // Contoh: "MAT A"
  boutNumber: string;       // Contoh: "BOUT 14"
  style: WrestlingStyle;
  ageCategory: AgeCategory;
  weightClass: string;      // Contoh: "74 KG"
  round?: string;           // Contoh: "QUALIFICATION", "QUARTERFINAL", "GOLD_FINAL"
  activeBoutId?: string | null; // ID partai jika terhubung ke antrean turnamen
}

export interface MatchState {
  version: number;          // Monotonic counter untuk mencegah out-of-order sync
  metadata: MatchMetadata;
  phase: MatchPhase;
  mainClock: TimerState;
  breakClock: TimerState;
  activityClock: ActivityClockState;
  red: WrestlerState;
  blue: WrestlerState;
  events: MatchEvent[];
  activeChallengeCorner: Corner | null;
  winner: {
    corner: Corner;
    type: VictoryType;
  } | null;
  activeBoutId?: string | null;
  intermission?: IntermissionState | null;
  nextBoutPreview?: {
    boutNumber: number | null;
    divisionLabel: string;
    redName: string;
    redRegion: string;
    blueName: string;
    blueRegion: string;
  } | null;
}

import type { ScheduleSnapshot } from './tournament';

export type SyncMessage =
  | { type: 'STATE_UPDATE'; payload: MatchState }
  | { type: 'REQUEST_STATE' }
  | { type: 'DISPLAY_PING' }
  | { type: 'TRIGGER_BUZZER'; sound: 'PERIOD_END' | 'ACTIVITY_END' }
  | { type: 'SCHEDULE_UPDATE'; payload: ScheduleSnapshot };
