import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma, verifyDatabaseConnection } from './config/prisma';
import { errorHandler } from './middlewares/errorHandler';
import tournamentsRouter from './routes/tournaments.routes';
import athletesRouter from './routes/athletes.routes';
import bracketsRouter from './routes/brackets.routes';
import boutsRouter from './routes/bouts.routes';
import backupRouter from './routes/backup.routes';
import { initScoreboardSocket } from './socket/scoreboardSocket';
import { hydrateActiveSessionsFromDb } from './services/matchSessionService';

dotenv.config();

export const app = express();
export const httpServer = http.createServer(app);
export const io = initScoreboardSocket(httpServer);

const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

/**
 * Mendeteksi alamat IPv4 LAN lokal laptop menggunakan os.networkInterfaces().
 */
export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
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
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      database: 'connected',
      localIp: getLocalIpAddress(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      localIp: getLocalIpAddress(),
      message: error instanceof Error ? error.message : 'Database connection failed',
    });
  }
});

// Mount Local REST API Routes (Phase 13, 14, 15)
app.use('/api', tournamentsRouter);
app.use('/api', athletesRouter);
app.use('/api', bracketsRouter);
app.use('/api', boutsRouter);
app.use('/api', backupRouter);

// Global JSON Error Handler for API routes
app.use(errorHandler);

// Single-Server Local Mode: Serve frontend static build (../dist) & SPA fallback
const candidateDistPaths = [
  path.resolve(__dirname, '../../dist'),
  path.resolve(__dirname, '../../../dist'),
  path.resolve(process.cwd(), '../dist'),
  path.resolve(process.cwd(), 'dist'),
];

const frontendDistPath = candidateDistPaths.find((p) =>
  fs.existsSync(path.join(p, 'index.html'))
);

if (frontendDistPath) {
  app.use(express.static(frontendDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

export async function startServer(): Promise<void> {
  await verifyDatabaseConnection();
  await hydrateActiveSessionsFromDb();
  const localIp = getLocalIpAddress();

  httpServer.listen(PORT, '0.0.0.0', () => {
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
