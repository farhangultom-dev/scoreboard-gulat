"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocketStateProviders = registerSocketStateProviders;
exports.getMatRoomNames = getMatRoomNames;
exports.initScoreboardSocket = initScoreboardSocket;
exports.getSocketIO = getSocketIO;
exports.broadcastMatchState = broadcastMatchState;
exports.broadcastBuzzer = broadcastBuzzer;
exports.broadcastScheduleUpdate = broadcastScheduleUpdate;
exports.broadcastBracketUpdate = broadcastBracketUpdate;
const socket_io_1 = require("socket.io");
let io = null;
const activeIntermissionByMat = new Map();
// Callback providers registered by services to avoid circular import issues
let getMatStateCallback = null;
let getScheduleSnapshotCallback = null;
function registerSocketStateProviders(providers) {
    getMatStateCallback = providers.getMatState;
    getScheduleSnapshotCallback = providers.getScheduleSnapshot;
}
/**
 * Mengembalikan dua variasi nama room untuk matras (dengan underscore dan spasi asli)
 * agar klien yang join ke "mat:MAT_A" maupun "mat:MAT A" sama-sama menerima broadcast.
 */
function getMatRoomNames(matName) {
    const trimmed = (matName || 'MAT A').trim().toUpperCase();
    const underscored = trimmed.replace(/\s+/g, '_');
    const spaced = trimmed.replace(/_/g, ' ');
    return [`mat:${underscored}`, `mat:${spaced}`];
}
function initScoreboardSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        },
    });
    io.on('connection', (socket) => {
        // Kirim waktu server awal untuk kalibrasi offset jam
        socket.emit('server:time', { serverTime: Date.now() });
        // Client -> Server: Join room matras spesifik
        socket.on('mat:join', (payload) => {
            const matName = typeof payload === 'string'
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
        socket.on('mat:set_intermission', (payload) => {
            const matName = payload?.matName || 'MAT A';
            const matKey = matName.trim().toUpperCase();
            const nextIntermission = payload?.intermission ?? null;
            activeIntermissionByMat.set(matKey, nextIntermission);
            const [room1, room2] = getMatRoomNames(matName);
            io?.to(room1).to(room2).emit('mat:intermission_update', nextIntermission);
            io?.to(room1).to(room2).emit('server:time', { serverTime: Date.now() });
        });
        // Client -> Server: Request state terbaru pada matras
        socket.on('mat:request_state', (payload) => {
            const matName = typeof payload === 'string'
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
                }
                catch (err) {
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
                }
                catch (err) {
                    console.error('Gagal mengirim requested schedule snapshot:', err);
                }
            }
        });
    });
    return io;
}
function getSocketIO() {
    return io;
}
/**
 * Broadcast pembaruan MatchState ke room mat:<MAT_NAME>.
 */
function broadcastMatchState(matName, state) {
    if (!io)
        return;
    const [room1, room2] = getMatRoomNames(matName);
    io.to(room1).to(room2).emit('match:state_update', state);
    io.to(room1).to(room2).emit('server:time', { serverTime: Date.now() });
}
/**
 * Broadcast sinyal bunyi buzzer ke layar TV pada matras terkait.
 */
function broadcastBuzzer(matName, sound) {
    if (!io)
        return;
    const [room1, room2] = getMatRoomNames(matName);
    io.to(room1).to(room2).emit('match:buzzer', { matName, sound, timestamp: Date.now() });
}
/**
 * Broadcast pembaruan jadwal dan status matras aktif ke room 'schedule'.
 */
function broadcastScheduleUpdate(snapshot) {
    if (!io)
        return;
    io.to('schedule').emit('schedule:update', snapshot);
}
/**
 * Broadcast pembaruan bagan pertandingan ke room 'schedule' (diikuti oleh /tournament & /schedule).
 */
function broadcastBracketUpdate(payload) {
    if (!io)
        return;
    io.to('schedule').emit('bracket:update', payload);
}
