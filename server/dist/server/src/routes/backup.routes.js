"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const errorHandler_1 = require("../middlewares/errorHandler");
const validate_1 = require("../middlewares/validate");
const matchSessionService_1 = require("../services/matchSessionService");
const router = (0, express_1.Router)();
const restoreBackupSchema = zod_1.z.object({
    version: zod_1.z.number().optional(),
    exportedAt: zod_1.z.string().optional(),
    tournament: zod_1.z.object({
        id: zod_1.z.string().min(1),
        name: zod_1.z.string().min(1),
        location: zod_1.z.string().nullable().optional(),
        eventDate: zod_1.z.string().nullable().optional(),
        status: zod_1.z.enum(['ACTIVE', 'ARCHIVED']).optional().default('ACTIVE'),
        createdAt: zod_1.z.string().optional(),
    }),
    divisions: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        tournamentId: zod_1.z.string().min(1),
        style: zod_1.z.enum(['FS', 'WW', 'GR']),
        ageCategory: zod_1.z.enum(['SENIOR', 'U23', 'U20', 'U17', 'U15']),
        weightClass: zod_1.z.string().min(1),
        format: zod_1.z.enum([
            'SINGLE_BOUT',
            'NORDIC',
            'GROUP_CROSS',
            'ELIMINATION_REPECHAGE',
        ]),
        assignedMat: zod_1.z.string().default('MAT A'),
        isDrawLocked: zod_1.z.boolean().default(false),
    })),
    athletes: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        tournamentId: zod_1.z.string().min(1),
        divisionId: zod_1.z.string().min(1),
        name: zod_1.z.string().min(1),
        region: zod_1.z.string().min(1),
        regionCode: zod_1.z.string().min(1),
        seed: zod_1.z.number().int().nullable().optional(),
        drawNumber: zod_1.z.number().int().nullable().optional(),
    })),
    bouts: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        tournamentId: zod_1.z.string().nullable().optional(),
        divisionId: zod_1.z.string().nullable().optional(),
        boutNumber: zod_1.z.number().int().nullable().optional(),
        matName: zod_1.z.string().default('MAT A'),
        round: zod_1.z.string().min(1),
        roundOrder: zod_1.z.number().int().default(10),
        bracketPosition: zod_1.z.number().int().default(1),
        bracketSide: zod_1.z.enum(['TOP', 'BOTTOM']).nullable().optional(),
        redAthleteId: zod_1.z.string().nullable().optional(),
        blueAthleteId: zod_1.z.string().nullable().optional(),
        redManualName: zod_1.z.string().nullable().optional(),
        redManualRegion: zod_1.z.string().nullable().optional(),
        blueManualName: zod_1.z.string().nullable().optional(),
        blueManualRegion: zod_1.z.string().nullable().optional(),
        redSourceLabel: zod_1.z.string().nullable().optional(),
        blueSourceLabel: zod_1.z.string().nullable().optional(),
        nextWinBoutId: zod_1.z.string().nullable().optional(),
        nextWinSlot: zod_1.z.enum(['RED', 'BLUE']).nullable().optional(),
        nextLoseBoutId: zod_1.z.string().nullable().optional(),
        nextLoseSlot: zod_1.z.enum(['RED', 'BLUE']).nullable().optional(),
        status: zod_1.z
            .enum(['TBD', 'SCHEDULED', 'ON_DECK', 'IN_PROGRESS', 'COMPLETED'])
            .default('TBD'),
        winnerCorner: zod_1.z.enum(['RED', 'BLUE']).nullable().optional(),
        winnerAthleteId: zod_1.z.string().nullable().optional(),
        redScore: zod_1.z.number().int().default(0),
        blueScore: zod_1.z.number().int().default(0),
        victoryType: zod_1.z
            .enum(['VFA', 'VSU', 'VSU1', 'VPO', 'VPO1', 'DSQ', 'VIN', 'VFO'])
            .nullable()
            .optional(),
        redClassificationPts: zod_1.z.number().int().default(0),
        blueClassificationPts: zod_1.z.number().int().default(0),
        completedAt: zod_1.z.string().nullable().optional(),
    })),
    matchSessions: zod_1.z
        .array(zod_1.z.object({
        boutId: zod_1.z.string().min(1),
        matName: zod_1.z.string().nullable().optional(),
        version: zod_1.z.number().int().default(1),
        phase: zod_1.z
            .enum(['PRE_MATCH', 'PERIOD_1', 'BREAK', 'PERIOD_2', 'FINISHED'])
            .default('PRE_MATCH'),
        mainClockJson: zod_1.z.unknown(),
        breakClockJson: zod_1.z.unknown(),
        activityClockJson: zod_1.z.unknown(),
        redStateJson: zod_1.z.unknown(),
        blueStateJson: zod_1.z.unknown(),
        activeChallengeCorner: zod_1.z.enum(['RED', 'BLUE']).nullable().optional(),
    }))
        .optional()
        .default([]),
    matchEvents: zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        boutId: zod_1.z.string().min(1),
        sequenceNo: zod_1.z.number().int(),
        period: zod_1.z.number().int(),
        matchClockMs: zod_1.z.number().int(),
        corner: zod_1.z.enum(['RED', 'BLUE']),
        type: zod_1.z.enum([
            'POINT',
            'CAUTION',
            'PASSIVITY',
            'ACTIVITY_POINT',
            'CHALLENGE_LOST_POINT',
            'MANUAL_ADJUST',
        ]),
        points: zod_1.z.number().int(),
        note: zod_1.z.string().nullable().optional(),
        isUndone: zod_1.z.boolean().default(false),
        createdAt: zod_1.z.string().optional(),
    }))
        .optional()
        .default([]),
});
/**
 * GET /api/tournaments/:id/backup
 * Mengekspor 1 file .json lengkap berisi turnamen, seluruh divisi, atlet, bagan/partai,
 * match_sessions, dan seluruh match_events.
 */
router.get('/tournaments/:id/backup', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const tournamentId = req.params.id;
    const tournament = await prisma_1.prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
            divisions: {
                orderBy: [{ style: 'asc' }, { ageCategory: 'asc' }, { weightClass: 'asc' }],
            },
            athletes: {
                orderBy: [{ divisionId: 'asc' }, { drawNumber: 'asc' }, { name: 'asc' }],
            },
            bouts: {
                include: {
                    matchSession: true,
                    matchEvents: {
                        orderBy: { sequenceNo: 'asc' },
                    },
                },
                orderBy: [{ roundOrder: 'asc' }, { bracketPosition: 'asc' }],
            },
        },
    });
    if (!tournament) {
        throw new errorHandler_1.AppError(404, 'Turnamen tidak ditemukan untuk di-backup.');
    }
    const matchSessions = tournament.bouts
        .filter((b) => b.matchSession !== null)
        .map((b) => b.matchSession);
    const matchEvents = tournament.bouts.flatMap((b) => b.matchEvents);
    const boutsClean = tournament.bouts.map((b) => ({
        id: b.id,
        tournamentId: b.tournamentId,
        divisionId: b.divisionId,
        boutNumber: b.boutNumber,
        matName: b.matName,
        round: b.round,
        roundOrder: b.roundOrder,
        bracketPosition: b.bracketPosition,
        bracketSide: b.bracketSide,
        redAthleteId: b.redAthleteId,
        blueAthleteId: b.blueAthleteId,
        redManualName: b.redManualName,
        redManualRegion: b.redManualRegion,
        blueManualName: b.blueManualName,
        blueManualRegion: b.blueManualRegion,
        redSourceLabel: b.redSourceLabel,
        blueSourceLabel: b.blueSourceLabel,
        nextWinBoutId: b.nextWinBoutId,
        nextWinSlot: b.nextWinSlot,
        nextLoseBoutId: b.nextLoseBoutId,
        nextLoseSlot: b.nextLoseSlot,
        status: b.status,
        winnerCorner: b.winnerCorner,
        winnerAthleteId: b.winnerAthleteId,
        redScore: b.redScore,
        blueScore: b.blueScore,
        victoryType: b.victoryType,
        redClassificationPts: b.redClassificationPts,
        blueClassificationPts: b.blueClassificationPts,
        completedAt: b.completedAt ? b.completedAt.toISOString() : null,
    }));
    const backupPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        tournament: {
            id: tournament.id,
            name: tournament.name,
            location: tournament.location,
            eventDate: tournament.eventDate ? tournament.eventDate.toISOString() : null,
            status: tournament.status,
            createdAt: tournament.createdAt.toISOString(),
        },
        divisions: tournament.divisions,
        athletes: tournament.athletes,
        bouts: boutsClean,
        matchSessions,
        matchEvents: matchEvents.map((e) => ({
            ...e,
            createdAt: e.createdAt.toISOString(),
        })),
    };
    const safeName = tournament.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="uww-backup-${safeName || 'tournament'}.json"`);
    res.json(backupPayload);
}));
/**
 * POST /api/tournaments/restore
 * Mengimpor kembali file .json hasil backup ke MySQL dalam satu transaksi atomik.
 */
router.post('/tournaments/restore', (0, validate_1.validateBody)(restoreBackupSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const data = req.body;
    const summary = await prisma_1.prisma.$transaction(async (tx) => {
        // Hapus turnamen dengan ID yang sama apabila sudah ada di database target
        const existing = await tx.tournament.findUnique({
            where: { id: data.tournament.id },
        });
        if (existing) {
            await tx.tournament.delete({
                where: { id: data.tournament.id },
            });
        }
        // 1. Insert Tournament
        await tx.tournament.create({
            data: {
                id: data.tournament.id,
                name: data.tournament.name,
                location: data.tournament.location ?? null,
                eventDate: data.tournament.eventDate
                    ? new Date(data.tournament.eventDate)
                    : null,
                status: data.tournament.status ?? 'ACTIVE',
                createdAt: data.tournament.createdAt
                    ? new Date(data.tournament.createdAt)
                    : new Date(),
            },
        });
        // 2. Insert Divisions
        if (data.divisions.length > 0) {
            await tx.division.createMany({
                data: data.divisions.map((d) => ({
                    id: d.id,
                    tournamentId: data.tournament.id,
                    style: d.style,
                    ageCategory: d.ageCategory,
                    weightClass: d.weightClass,
                    format: d.format,
                    assignedMat: d.assignedMat,
                    isDrawLocked: d.isDrawLocked,
                })),
            });
        }
        // 3. Insert Athletes
        if (data.athletes.length > 0) {
            await tx.athlete.createMany({
                data: data.athletes.map((a) => ({
                    id: a.id,
                    tournamentId: data.tournament.id,
                    divisionId: a.divisionId,
                    name: a.name,
                    region: a.region,
                    regionCode: a.regionCode,
                    seed: a.seed ?? null,
                    drawNumber: a.drawNumber ?? null,
                })),
            });
        }
        // 4. Insert Bouts (Pass 1: tanpa self-referential FK nextWinBoutId / nextLoseBoutId)
        if (data.bouts.length > 0) {
            await tx.bout.createMany({
                data: data.bouts.map((b) => ({
                    id: b.id,
                    tournamentId: b.tournamentId ?? data.tournament.id,
                    divisionId: b.divisionId ?? null,
                    boutNumber: b.boutNumber ?? null,
                    matName: b.matName,
                    round: b.round,
                    roundOrder: b.roundOrder,
                    bracketPosition: b.bracketPosition,
                    bracketSide: b.bracketSide ?? null,
                    redAthleteId: b.redAthleteId ?? null,
                    blueAthleteId: b.blueAthleteId ?? null,
                    redManualName: b.redManualName ?? null,
                    redManualRegion: b.redManualRegion ?? null,
                    blueManualName: b.blueManualName ?? null,
                    blueManualRegion: b.blueManualRegion ?? null,
                    redSourceLabel: b.redSourceLabel ?? null,
                    blueSourceLabel: b.blueSourceLabel ?? null,
                    status: b.status,
                    winnerCorner: b.winnerCorner ?? null,
                    winnerAthleteId: b.winnerAthleteId ?? null,
                    redScore: b.redScore,
                    blueScore: b.blueScore,
                    victoryType: b.victoryType ?? null,
                    redClassificationPts: b.redClassificationPts,
                    blueClassificationPts: b.blueClassificationPts,
                    completedAt: b.completedAt ? new Date(b.completedAt) : null,
                })),
            });
            // Pass 2: Hubungkan nextWinBoutId dan nextLoseBoutId
            for (const b of data.bouts) {
                if (b.nextWinBoutId || b.nextLoseBoutId) {
                    await tx.bout.update({
                        where: { id: b.id },
                        data: {
                            nextWinBoutId: b.nextWinBoutId ?? null,
                            nextWinSlot: b.nextWinSlot ?? null,
                            nextLoseBoutId: b.nextLoseBoutId ?? null,
                            nextLoseSlot: b.nextLoseSlot ?? null,
                        },
                    });
                }
            }
        }
        // 5. Insert Match Sessions
        if (data.matchSessions && data.matchSessions.length > 0) {
            for (const s of data.matchSessions) {
                // Bebaskan matName pada sesi lain jika bentrok dengan sesi aktif yang di-restore
                if (s.matName) {
                    await tx.matchSession.updateMany({
                        where: { matName: s.matName },
                        data: { matName: null },
                    });
                }
                await tx.matchSession.create({
                    data: {
                        boutId: s.boutId,
                        matName: s.matName ?? null,
                        version: s.version,
                        phase: s.phase,
                        mainClockJson: (s.mainClockJson ?? {}),
                        breakClockJson: (s.breakClockJson ?? {}),
                        activityClockJson: (s.activityClockJson ?? {}),
                        redStateJson: (s.redStateJson ?? {}),
                        blueStateJson: (s.blueStateJson ?? {}),
                        activeChallengeCorner: s.activeChallengeCorner ?? null,
                    },
                });
            }
        }
        // 6. Insert Match Events
        if (data.matchEvents && data.matchEvents.length > 0) {
            await tx.matchEventRecord.createMany({
                data: data.matchEvents.map((e) => ({
                    id: e.id,
                    boutId: e.boutId,
                    sequenceNo: e.sequenceNo,
                    period: e.period,
                    matchClockMs: e.matchClockMs,
                    corner: e.corner,
                    type: e.type,
                    points: e.points,
                    note: e.note ?? null,
                    isUndone: e.isUndone,
                    createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
                })),
            });
        }
        return {
            restored: true,
            tournamentId: data.tournament.id,
            tournamentName: data.tournament.name,
            counts: {
                divisions: data.divisions.length,
                athletes: data.athletes.length,
                bouts: data.bouts.length,
                matchSessions: data.matchSessions.length,
                matchEvents: data.matchEvents.length,
            },
        };
    });
    await (0, matchSessionService_1.hydrateActiveSessionsFromDb)();
    res.status(201).json(summary);
}));
exports.default = router;
