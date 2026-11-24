"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.httpServer = exports.app = void 0;
exports.getLocalIpAddress = getLocalIpAddress;
exports.startServer = startServer;
const node_fs_1 = __importDefault(require("node:fs"));
const node_http_1 = __importDefault(require("node:http"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const prisma_1 = require("./config/prisma");
const errorHandler_1 = require("./middlewares/errorHandler");
const tournaments_routes_1 = __importDefault(require("./routes/tournaments.routes"));
const athletes_routes_1 = __importDefault(require("./routes/athletes.routes"));
const brackets_routes_1 = __importDefault(require("./routes/brackets.routes"));
const bouts_routes_1 = __importDefault(require("./routes/bouts.routes"));
const backup_routes_1 = __importDefault(require("./routes/backup.routes"));
const scoreboardSocket_1 = require("./socket/scoreboardSocket");
const matchSessionService_1 = require("./services/matchSessionService");
dotenv_1.default.config();
exports.app = (0, express_1.default)();
exports.httpServer = node_http_1.default.createServer(exports.app);
exports.io = (0, scoreboardSocket_1.initScoreboardSocket)(exports.httpServer);
const PORT = Number(process.env.PORT) || 4000;
exports.app.use((0, cors_1.default)());
exports.app.use(express_1.default.json({ limit: '25mb' }));
/**
 * Mendeteksi alamat IPv4 LAN lokal laptop menggunakan os.networkInterfaces().
 */
function getLocalIpAddress() {
    const interfaces = node_os_1.default.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const netList = interfaces[name];
        if (!netList)
            continue;
        for (const net of netList) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}
/**
 * Health check endpoint untuk memverifikasi status koneksi MySQL dan IP lokal laptop.
 */
exports.app.get('/api/health', async (_req, res) => {
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        res.json({
            status: 'ok',
            database: 'connected',
            localIp: getLocalIpAddress(),
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'error',
            database: 'disconnected',
            localIp: getLocalIpAddress(),
            message: error instanceof Error ? error.message : 'Database connection failed',
        });
    }
});
// Mount Local REST API Routes (Phase 13, 14, 15)
exports.app.use('/api', tournaments_routes_1.default);
exports.app.use('/api', athletes_routes_1.default);
exports.app.use('/api', brackets_routes_1.default);
exports.app.use('/api', bouts_routes_1.default);
exports.app.use('/api', backup_routes_1.default);
// Global JSON Error Handler for API routes
exports.app.use(errorHandler_1.errorHandler);
// Single-Server Local Mode: Serve frontend static build (../dist) & SPA fallback
const candidateDistPaths = [
    node_path_1.default.resolve(__dirname, '../../dist'),
    node_path_1.default.resolve(__dirname, '../../../dist'),
    node_path_1.default.resolve(process.cwd(), '../dist'),
    node_path_1.default.resolve(process.cwd(), 'dist'),
];
const frontendDistPath = candidateDistPaths.find((p) => node_fs_1.default.existsSync(node_path_1.default.join(p, 'index.html')));
if (frontendDistPath) {
    exports.app.use(express_1.default.static(frontendDistPath));
    exports.app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
            next();
            return;
        }
        res.sendFile(node_path_1.default.join(frontendDistPath, 'index.html'));
    });
}
async function startServer() {
    await (0, prisma_1.verifyDatabaseConnection)();
    await (0, matchSessionService_1.hydrateActiveSessionsFromDb)();
    const localIp = getLocalIpAddress();
    exports.httpServer.listen(PORT, '0.0.0.0', () => {
        console.log('\n====================================================================');
        console.log('🤼 UWW OLYMPIC WRESTLING SCOREBOARD — LOCAL MYSQL BACKEND');
        console.log('--------------------------------------------------------------------');
        console.log(`🚀 Server Lokal   : http://localhost:${PORT}/controller`);
        console.log(`🏆 Sekretariat    : http://localhost:${PORT}/tournament`);
        console.log(`📺 TV Display     : http://localhost:${PORT}/display`);
        console.log(`📡 Jadwal LAN WiFi: http://${localIp}:${PORT}/schedule`);
        console.log(`🩺 Health Check   : http://localhost:${PORT}/api/health`);
        console.log('====================================================================\n');
    });
}
if (require.main === module) {
    startServer();
}
