import {
  AgeCategory,
  Corner,
  MatchEventType,
  MatchPhase,
  MatchState,
  VictoryType,
  WrestlingStyle,
} from '../types/match';
import {
  Athlete,
  BoutStatus,
  DivisionFormat,
  ScheduleSnapshot,
  StandingRow,
} from '../types/tournament';
import { ManualDrawValidation } from '../engine/uwwManualDraw';

/**
 * Menentukan base URL untuk REST API lokal:
 * - Memakai VITE_API_URL jika diset secara eksplisit.
 * - Jika diakses dari port 4000 (mode produksi single-server), memakai window.location.origin.
 * - Jika diakses dari Vite dev server (misal port 5173), memakai http://localhost:4000.
 */
export function getApiBaseUrl(): string {
  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if (port === '4000') {
      return window.location.origin;
    }
    return `${protocol}//${hostname || 'localhost'}:4000`;
  }
  return 'http://localhost:4000';
}

export async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${getApiBaseUrl()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      (data as { message?: string; error?: string })?.message ||
      (data as { error?: string })?.error ||
      `HTTP Error ${response.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected';
  localIp: string;
}

export async function checkServerHealthApi(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health');
}

export interface ApiTournamentSummary {
  id: string;
  name: string;
  location: string | null;
  eventDate: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  counts?: {
    divisions: number;
    athletes: number;
    totalBouts: number;
    completedBouts: number;
    inProgressBouts: number;
  };
}

export async function fetchTournamentsApi(): Promise<{
  tournaments: ApiTournamentSummary[];
}> {
  return apiFetch<{ tournaments: ApiTournamentSummary[] }>('/api/tournaments');
}

export async function createTournamentApi(payload: {
  name: string;
  location?: string | null;
  eventDate?: string | null;
}): Promise<{ tournament: ApiTournamentSummary }> {
  return apiFetch<{ tournament: ApiTournamentSummary }>('/api/tournaments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTournamentApi(
  tournamentId: string,
  payload: {
    name?: string;
    location?: string | null;
    eventDate?: string | null;
    status?: 'ACTIVE' | 'ARCHIVED';
  }
): Promise<{ tournament: ApiTournamentSummary }> {
  return apiFetch<{ tournament: ApiTournamentSummary }>(
    `/api/tournaments/${tournamentId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteTournamentApi(
  tournamentId: string
): Promise<{ deleted: boolean; id: string }> {
  return apiFetch<{ deleted: boolean; id: string }>(
    `/api/tournaments/${tournamentId}`,
    {
      method: 'DELETE',
    }
  );
}

export interface ApiDivisionItem {
  id: string;
  tournamentId: string;
  style: WrestlingStyle;
  ageCategory: AgeCategory;
  weightClass: string;
  format: DivisionFormat;
  assignedMat: string;
  isDrawLocked: boolean;
  athleteCount: number;
  boutCount: number;
  athleteIds: string[];
  athletes: Array<{
    id: string;
    tournamentId: string;
    divisionId: string;
    name: string;
    region: string;
    regionCode: string;
    seed: number | null;
    drawNumber: number | null;
  }>;
}

export async function fetchTournamentDivisionsApi(tournamentId: string): Promise<{
  tournamentId: string;
  divisions: ApiDivisionItem[];
}> {
  return apiFetch<{ tournamentId: string; divisions: ApiDivisionItem[] }>(
    `/api/tournaments/${tournamentId}/divisions`
  );
}

export async function updateDivisionApi(
  divisionId: string,
  payload: { assignedMat?: string; format?: DivisionFormat }
): Promise<{ division: ApiDivisionItem }> {
  return apiFetch<{ division: ApiDivisionItem }>(`/api/divisions/${divisionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteDivisionApi(
  divisionId: string
): Promise<{ deleted: boolean; id: string; tournamentId: string }> {
  return apiFetch<{ deleted: boolean; id: string; tournamentId: string }>(
    `/api/divisions/${divisionId}`,
    {
      method: 'DELETE',
    }
  );
}

export async function bulkImportAthletesApi(
  tournamentId: string,
  payload: {
    mode: 'MERGE' | 'REPLACE';
    athletes: Omit<Athlete, 'id'>[];
  }
): Promise<{
  mode: 'MERGE' | 'REPLACE';
  importedCount: number;
  divisionsAffected: number;
}> {
  return apiFetch(`/api/tournaments/${tournamentId}/athletes/bulk`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createAthleteApi(
  payload: Omit<Athlete, 'id'> & { tournamentId: string }
): Promise<{
  athlete: {
    id: string;
    tournamentId: string;
    divisionId: string;
    name: string;
    region: string;
    regionCode: string;
    seed: number | null;
    drawNumber: number | null;
  };
}> {
  return apiFetch('/api/athletes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAthleteApi(
  athleteId: string,
  updates: Partial<Athlete>
): Promise<{
  athlete: {
    id: string;
    tournamentId: string;
    divisionId: string;
    name: string;
    region: string;
    regionCode: string;
    seed: number | null;
    drawNumber: number | null;
  };
}> {
  return apiFetch(`/api/athletes/${athleteId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteAthleteApi(
  athleteId: string
): Promise<{ deleted: boolean; id: string }> {
  return apiFetch(`/api/athletes/${athleteId}`, {
    method: 'DELETE',
  });
}

export async function performDrawApi(
  divisionId: string,
  options?: { separateSameRegion?: boolean }
): Promise<{
  divisionId: string;
  athletes: Array<{ id: string; drawNumber: number | null }>;
}> {
  return apiFetch(`/api/divisions/${divisionId}/draw`, {
    method: 'POST',
    body: JSON.stringify(options ?? { separateSameRegion: true }),
  });
}

export async function manualSwapDrawApi(
  divisionId: string,
  payload: {
    athleteId1?: string;
    athleteId2?: string;
    assignments?: Array<{ athleteId: string; drawNumber: number | null }>;
  }
): Promise<{
  divisionId: string;
  athletes: Array<{ id: string; drawNumber: number | null }>;
  validation?: ManualDrawValidation;
}> {
  return apiFetch(`/api/divisions/${divisionId}/draw/manual`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export interface ApiBoutRecord {
  id: string;
  tournamentId: string | null;
  divisionId: string | null;
  boutNumber: number | null;
  matName: string;
  round: string;
  roundOrder: number;
  bracketPosition: number;
  bracketSide: 'TOP' | 'BOTTOM' | null;
  redAthleteId: string | null;
  blueAthleteId: string | null;
  redManualName: string | null;
  redManualRegion: string | null;
  blueManualName: string | null;
  blueManualRegion: string | null;
  redSourceLabel: string | null;
  blueSourceLabel: string | null;
  nextWinBoutId: string | null;
  nextWinSlot: Corner | null;
  nextLoseBoutId: string | null;
  nextLoseSlot: Corner | null;
  status: BoutStatus;
  winnerCorner: Corner | null;
  winnerAthleteId: string | null;
  redScore: number;
  blueScore: number;
  victoryType: VictoryType | null;
  redClassificationPts: number;
  blueClassificationPts: number;
  completedAt: string | null;
}

export async function generateBracketApi(
  divisionId: string,
  options?: { separateSameRegion?: boolean; format?: DivisionFormat }
): Promise<{
  division: ApiDivisionItem;
  bouts: ApiBoutRecord[];
  standings: StandingRow[];
}> {
  return apiFetch(`/api/divisions/${divisionId}/bracket/generate`, {
    method: 'POST',
    body: JSON.stringify(options ?? {}),
  });
}

export async function unlockBracketApi(
  divisionId: string,
  force = true
): Promise<{
  divisionId: string;
  isDrawLocked: boolean;
  deletedBoutsCount: number;
}> {
  return apiFetch(`/api/divisions/${divisionId}/bracket/unlock`, {
    method: 'POST',
    body: JSON.stringify({ force }),
  });
}

export async function fetchTournamentBoutsApi(
  tournamentId: string,
  query?: { mat?: string; status?: BoutStatus }
): Promise<{
  tournamentId: string;
  total: number;
  bouts: ApiBoutRecord[];
}> {
  const params = new URLSearchParams();
  if (query?.mat) params.set('mat', query.mat);
  if (query?.status) params.set('status', query.status);
  const qs = params.toString();
  return apiFetch(
    `/api/tournaments/${tournamentId}/bouts${qs ? `?${qs}` : ''}`
  );
}

export async function generateScheduleApi(
  tournamentId: string,
  mats?: string[]
): Promise<{
  tournamentId: string;
  scheduledCount: number;
  bouts: ApiBoutRecord[];
}> {
  return apiFetch(`/api/tournaments/${tournamentId}/schedule/generate`, {
    method: 'POST',
    body: JSON.stringify(mats ? { mats } : {}),
  });
}

export async function reorderBoutsApi(
  tournamentId: string,
  payload: {
    bouts?: Array<{
      id: string;
      boutNumber?: number | null;
      matName?: string;
      status?: BoutStatus;
    }>;
    orderedBoutIds?: string[];
    matName?: string;
  }
): Promise<{ tournamentId: string; updatedCount: number }> {
  return apiFetch(`/api/tournaments/${tournamentId}/bouts/reorder`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function loadBoutToSessionApi(
  boutId: string,
  options?: { matName?: string; forceReplace?: boolean }
): Promise<{ matchState: MatchState }> {
  return apiFetch(`/api/bouts/${boutId}/load`, {
    method: 'POST',
    body: JSON.stringify(options ?? { forceReplace: true }),
  });
}

export async function recordBoutEventApi(
  boutId: string,
  payload: {
    corner: Corner;
    type: MatchEventType;
    points?: number;
    period?: number;
    matchClockMs?: number;
    note?: string;
    opponentPoints?: number;
  }
): Promise<{ matchState: MatchState }> {
  return apiFetch(`/api/bouts/${boutId}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function undoBoutEventApi(
  boutId: string
): Promise<{ undoneCount: number; matchState: MatchState }> {
  return apiFetch(`/api/bouts/${boutId}/events/undo`, {
    method: 'POST',
  });
}

export async function updateBoutClockApi(
  boutId: string,
  payload: {
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
  }
): Promise<{ matchState: MatchState }> {
  return apiFetch(`/api/bouts/${boutId}/clock`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateBoutSessionDetailsApi(
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
): Promise<{ matchState: MatchState }> {
  return apiFetch(`/api/bouts/${boutId}/session`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function completeBoutApi(
  boutId: string,
  payload: {
    winnerCorner: Corner;
    victoryType: VictoryType;
    redScore?: number;
    blueScore?: number;
  }
): Promise<{
  bout: ApiBoutRecord;
  advancedBoutIds: string[];
  matchState: MatchState | null;
}> {
  return apiFetch(`/api/bouts/${boutId}/complete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchScheduleSnapshotApi(query?: {
  mat?: string;
  tournamentId?: string;
}): Promise<ScheduleSnapshot> {
  const params = new URLSearchParams();
  if (query?.mat) params.set('mat', query.mat);
  if (query?.tournamentId) params.set('tournamentId', query.tournamentId);
  const qs = params.toString();
  return apiFetch<ScheduleSnapshot>(
    `/api/schedule/snapshot${qs ? `?${qs}` : ''}`
  );
}

export async function exportTournamentBackupApi(
  tournamentId: string
): Promise<unknown> {
  return apiFetch(`/api/tournaments/${tournamentId}/backup`);
}

export async function restoreTournamentBackupApi(backupData: unknown): Promise<{
  restored: boolean;
  tournamentId: string;
  tournamentName: string;
  counts: {
    divisions: number;
    athletes: number;
    bouts: number;
    matchSessions: number;
    matchEvents: number;
  };
}> {
  return apiFetch('/api/tournaments/restore', {
    method: 'POST',
    body: JSON.stringify(backupData),
  });
}
