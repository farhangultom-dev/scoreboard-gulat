import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { IntermissionState, MatchState } from '../../../shared/types/match';
import { ScheduleSnapshot } from '../../../shared/types/tournament';

let io: SocketIOServer | null = null;
const activeIntermissionByMat = new Map<string, IntermissionState | null>();

// Callback providers registered by services to avoid circular import issues
let getMatStateCallback: ((matName: string) => MatchState | null) | null = null;
let getScheduleSnapshotCallback: (() => Promise<ScheduleSnapshot>) | null = null;

export function registerSocketStateProviders(providers: {
  getMatState: (matName: string) => MatchState | null;
  getScheduleSnapshot: () => Promise<ScheduleSnapshot>;
}): void {
  getMatStateCallback = providers.getMatState;
  getScheduleSnapshotCallback = providers.getScheduleSnapshot;
}

/**
 * Mengembalikan dua variasi nama room untuk matras (dengan underscore dan spasi asli)
 * agar klien yang join ke "mat:MAT_A" maupun "mat:MAT A" sama-sama menerima broadcast.
 */
export function getMatRoomNames(matName: string): [string, string] {
  const trimmed = (matName || 'MAT A').trim().toUpperCase();
  const underscored = trimmed.replace(/\s+/g, '_');
  const spaced = trimmed.replace(/_/g, ' ');
  return [`mat:${underscored}`, `mat:${spaced}`];
}

export function initScoreboardSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    },
  });

  io.on('connection', (socket: Socket) => {
    // Kirim waktu server awal untuk kalibrasi offset jam
    socket.emit('server:time', { serverTime: Date.now() });

    // Client -> Server: Join room matras spesifik
    socket.on('mat:join', (payload: { matName?: string } | string) => {
      const matName =
        typeof payload === 'string'
          ? payload
          : payload?.matName || 'MAT A';
      const [room1, room2] = getMatRoomNames(matName);
      socket.join(room1);
      socket.join(room2);

      socket.emit('server:time', { serverTime: Date.now() });

      if (getMatStateCallback) {
        const currentState = getMatStateCallback(matName);
        if (currentState) {
          socket.emit('match:state_update', currentState);
        }
      }

      const matKey = (matName || 'MAT A').trim().toUpperCase();
      if (activeIntermissionByMat.has(matKey)) {
        socket.emit('mat:intermission_update', activeIntermissionByMat.get(matKey) ?? null);
      }
    });

    // Client -> Server: Set/Update mode istirahat sesi di layar TV matras
    socket.on(
      'mat:set_intermission',
      (payload: { matName?: string; intermission: IntermissionState | null }) => {
        const matName = payload?.matName || 'MAT A';
        const matKey = matName.trim().toUpperCase();
        const nextIntermission = payload?.intermission ?? null;
        activeIntermissionByMat.set(matKey, nextIntermission);

        const [room1, room2] = getMatRoomNames(matName);
        io?.to(room1).to(room2).emit('mat:intermission_update', nextIntermission);
        io?.to(room1).to(room2).emit('server:time', { serverTime: Date.now() });
      }
    );

    // Client -> Server: Request state terbaru pada matras
    socket.on('mat:request_state', (payload?: { matName?: string } | string) => {
      const matName =
        typeof payload === 'string'
          ? payload
          : payload?.matName || 'MAT A';

      socket.emit('server:time', { serverTime: Date.now() });

      if (getMatStateCallback) {
        const currentState = getMatStateCallback(matName);
        if (currentState) {
          socket.emit('match:state_update', currentState);
        }
      }

      const matKey = (matName || 'MAT A').trim().toUpperCase();
      if (activeIntermissionByMat.has(matKey)) {
        socket.emit('mat:intermission_update', activeIntermissionByMat.get(matKey) ?? null);
      }
    });

    // Client -> Server: Join room schedule & tournament
    socket.on('schedule:join', async () => {
      socket.join('schedule');
      socket.emit('server:time', { serverTime: Date.now() });

      if (getScheduleSnapshotCallback) {
        try {
          const snapshot = await getScheduleSnapshotCallback();
          socket.emit('schedule:update', snapshot);
        } catch (err) {
          console.error('Gagal mengirim initial schedule snapshot:', err);
        }
      }
    });

    // Client -> Server: Request snapshot jadwal terbaru
    socket.on('schedule:request_snapshot', async () => {
      socket.emit('server:time', { serverTime: Date.now() });

      if (getScheduleSnapshotCallback) {
        try {
          const snapshot = await getScheduleSnapshotCallback();
          socket.emit('schedule:update', snapshot);
        } catch (err) {
          console.error('Gagal mengirim requested schedule snapshot:', err);
        }
      }
    });
  });

  return io;
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

/**
 * Broadcast pembaruan MatchState ke room mat:<MAT_NAME>.
 */
export function broadcastMatchState(matName: string, state: MatchState): void {
  if (!io) return;
  const [room1, room2] = getMatRoomNames(matName);
  io.to(room1).to(room2).emit('match:state_update', state);
  io.to(room1).to(room2).emit('server:time', { serverTime: Date.now() });
}

/**
 * Broadcast sinyal bunyi buzzer ke layar TV pada matras terkait.
 */
export function broadcastBuzzer(
  matName: string,
  sound: 'PERIOD_END' | 'ACTIVITY_END'
): void {
  if (!io) return;
  const [room1, room2] = getMatRoomNames(matName);
  io.to(room1).to(room2).emit('match:buzzer', { matName, sound, timestamp: Date.now() });
}

/**
 * Broadcast pembaruan jadwal dan status matras aktif ke room 'schedule'.
 */
export function broadcastScheduleUpdate(snapshot: ScheduleSnapshot): void {
  if (!io) return;
  io.to('schedule').emit('schedule:update', snapshot);
}

/**
 * Broadcast pembaruan bagan pertandingan ke room 'schedule' (diikuti oleh /tournament & /schedule).
 */
export function broadcastBracketUpdate(payload: {
  divisionId: string;
  tournamentId?: string | null;
  completedBoutId?: string;
}): void {
  if (!io) return;
  io.to('schedule').emit('bracket:update', payload);
}
