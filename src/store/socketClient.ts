import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl, checkServerHealthApi } from '../api/client';
import { IntermissionState, MatchState } from '../types/match';
import { ScheduleSnapshot } from '../types/tournament';

let socket: Socket | null = null;
let serverTimeOffsetMs = 0;
let isMySqlConnected = false;
let localIpAddress = '127.0.0.1';

export interface BackendConnectionStatus {
  isConnected: boolean;
  localIp: string;
  serverTimeOffsetMs: number;
}

type StatusListener = (status: BackendConnectionStatus) => void;
type MatchStateListener = (state: MatchState) => void;
type BuzzerListener = (payload: {
  matName: string;
  sound: 'PERIOD_END' | 'ACTIVITY_END';
}) => void;
type ScheduleListener = (snapshot: ScheduleSnapshot) => void;
type BracketListener = (payload: {
  divisionId: string;
  tournamentId?: string | null;
  completedBoutId?: string;
}) => void;

const statusListeners = new Set<StatusListener>();
const matchStateListeners = new Set<MatchStateListener>();
const buzzerListeners = new Set<BuzzerListener>();
const scheduleListeners = new Set<ScheduleListener>();
const bracketListeners = new Set<BracketListener>();
type IntermissionListener = (intermission: IntermissionState | null) => void;
const intermissionListeners = new Set<IntermissionListener>();

function notifyStatusListeners(): void {
  const status: BackendConnectionStatus = {
    isConnected: isMySqlConnected,
    localIp: localIpAddress,
    serverTimeOffsetMs,
  };
  statusListeners.forEach((cb) => cb(status));
}

/**
 * Mengembalikan waktu sekarang yang telah dikalibrasi dengan serverTimeOffset.
 * Jika belum terhubung ke server (atau di dalam unit test Vitest), serverTimeOffsetMs = 0
 * sehingga nilainya sama persis dengan Date.now().
 */
export function getCalibratedNow(): number {
  return Date.now() + serverTimeOffsetMs;
}

export function getBackendConnectionStatus(): BackendConnectionStatus {
  return {
    isConnected: isMySqlConnected,
    localIp: localIpAddress,
    serverTimeOffsetMs,
  };
}

/**
 * Memeriksa status endpoint /api/health untuk mendapatkan IP LAN lokal & status MySQL.
 */
export async function refreshBackendHealth(): Promise<BackendConnectionStatus> {
  try {
    const res = await checkServerHealthApi();
    isMySqlConnected = res.status === 'ok' && res.database === 'connected';
    if (res.localIp) {
      localIpAddress = res.localIp;
    }
  } catch {
    isMySqlConnected = false;
  }
  notifyStatusListeners();
  return getBackendConnectionStatus();
}

/**
 * Inisialisasi koneksi Socket.IO ke backend lokal (hanya berjalan di browser, bukan di Vitest jsdom).
 */
export function ensureSocketConnected(): Socket | null {
  if (typeof window === 'undefined') return null;
  // Hindari membuka koneksi jaringan nyata saat di dalam environment unit test Vitest
  const isVitest = Boolean(
    (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITEST
  );
  if (isVitest) return null;

  if (socket) return socket;

  const baseUrl = getApiBaseUrl();
  socket = io(baseUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 3000,
  });

  socket.on('connect', () => {
    refreshBackendHealth();
  });

  socket.on('disconnect', () => {
    isMySqlConnected = false;
    notifyStatusListeners();
  });

  socket.on('connect_error', () => {
    isMySqlConnected = false;
    notifyStatusListeners();
  });

  socket.on('server:time', (payload: { serverTime: number }) => {
    if (payload && typeof payload.serverTime === 'number') {
      serverTimeOffsetMs = payload.serverTime - Date.now();
    }
  });

  socket.on('match:state_update', (state: MatchState) => {
    matchStateListeners.forEach((cb) => cb(state));
  });

  socket.on('mat:intermission_update', (intermission: IntermissionState | null) => {
    intermissionListeners.forEach((cb) => cb(intermission));
  });

  socket.on(
    'match:buzzer',
    (payload: { matName: string; sound: 'PERIOD_END' | 'ACTIVITY_END' }) => {
      buzzerListeners.forEach((cb) => cb(payload));
    }
  );

  socket.on('schedule:update', (snapshot: ScheduleSnapshot) => {
    scheduleListeners.forEach((cb) => cb(snapshot));
  });

  socket.on(
    'bracket:update',
    (payload: {
      divisionId: string;
      tournamentId?: string | null;
      completedBoutId?: string;
    }) => {
      bracketListeners.forEach((cb) => cb(payload));
    }
  );

  refreshBackendHealth();
  return socket;
}

export function joinMatSocketRoom(matName: string): void {
  const s = ensureSocketConnected();
  if (!s) return;
  s.emit('mat:join', { matName });
}

export function requestMatSocketState(matName: string): void {
  const s = ensureSocketConnected();
  if (!s) return;
  s.emit('mat:request_state', { matName });
}

export function joinScheduleSocketRoom(): void {
  const s = ensureSocketConnected();
  if (!s) return;
  s.emit('schedule:join');
}

export function subscribeBackendStatus(cb: StatusListener): () => void {
  ensureSocketConnected();
  statusListeners.add(cb);
  cb(getBackendConnectionStatus());
  return () => {
    statusListeners.delete(cb);
  };
}

export function subscribeSocketMatchState(cb: MatchStateListener): () => void {
  ensureSocketConnected();
  matchStateListeners.add(cb);
  return () => {
    matchStateListeners.delete(cb);
  };
}

export function subscribeSocketBuzzer(cb: BuzzerListener): () => void {
  ensureSocketConnected();
  buzzerListeners.add(cb);
  return () => {
    buzzerListeners.delete(cb);
  };
}

export function subscribeSocketSchedule(cb: ScheduleListener): () => void {
  ensureSocketConnected();
  scheduleListeners.add(cb);
  return () => {
    scheduleListeners.delete(cb);
  };
}

export function subscribeSocketBracket(cb: BracketListener): () => void {
  ensureSocketConnected();
  bracketListeners.add(cb);
  return () => {
    bracketListeners.delete(cb);
  };
}

export function emitMatIntermission(
  matName: string,
  intermission: IntermissionState | null
): void {
  const s = ensureSocketConnected();
  if (!s) return;
  s.emit('mat:set_intermission', { matName, intermission });
}

export function subscribeSocketIntermission(
  cb: IntermissionListener
): () => void {
  ensureSocketConnected();
  intermissionListeners.add(cb);
  return () => {
    intermissionListeners.delete(cb);
  };
}
