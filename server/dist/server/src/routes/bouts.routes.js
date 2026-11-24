"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const errorHandler_1 = require("../middlewares/errorHandler");
const validate_1 = require("../middlewares/validate");
const matchSessionService_1 = require("../services/matchSessionService");
const router = (0, express_1.Router)();
const generateScheduleSchema = zod_1.z.object({
    mats: zod_1.z.array(zod_1.z.string().trim().min(1)).optional(),
});
const reorderBoutsSchema = zod_1.z
    .object({
    bouts: zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        boutNumber: zod_1.z.number().int().positive().nullable().optional(),
        matName: zod_1.z.string().trim().min(1).optional(),
        status: zod_1.z
            .enum(['TBD', 'SCHEDULED', 'ON_DECK', 'IN_PROGRESS', 'COMPLETED'])
            .optional(),
    }))
        .optional(),
    orderedBoutIds: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    matName: zod_1.z.string().trim().min(1).optional(),
})
    .refine((data) => (Array.isArray(data.bouts) && data.bouts.length > 0) ||
    (Array.isArray(data.orderedBoutIds) && data.orderedBoutIds.length > 0), {
    message: 'Sertakan daftar bouts atau orderedBoutIds untuk mengubah urutan partai.',
});
const createManualBoutSchema = zod_1.z.object({
    tournamentId: zod_1.z.string().optional().nullable(),
    divisionId: zod_1.z.string().optional().nullable(),
    boutNumber: zod_1.z.number().int().positive().optional().nullable(),
    matName: zod_1.z.string().trim().min(1).default('MAT A'),
    round: zod_1.z.string().trim().min(1).default('EXHIBITION'),
    redManualName: zod_1.z.string().trim().min(1, 'Nama pegulat sudut merah wajib diisi'),
    redManualRegion: zod_1.z.string().trim().min(1).max(50).default('RED'),
    blueManualName: zod_1.z.string().trim().min(1, 'Nama pegulat sudut biru wajib diisi'),
    blueManualRegion: zod_1.z.string().trim().min(1).max(50).default('BLUE'),
});
const loadBoutSchema = zod_1.z.object({
    matName: zod_1.z.string().trim().min(1).optional(),
    forceReplace: zod_1.z.boolean().optional().default(false),
});
const recordEventSchema = zod_1.z.object({
    corner: zod_1.z.enum(['RED', 'BLUE']),
    type: zod_1.z.enum([
        'POINT',
        'CAUTION',
        'PASSIVITY',
        'ACTIVITY_POINT',
        'CHALLENGE_LOST_POINT',
        'MANUAL_ADJUST',
    ]),
    points: zod_1.z.number().int().min(-50).max(50).optional().default(0),
    period: zod_1.z.number().int().min(1).max(2).optional(),
    matchClockMs: zod_1.z.number().int().min(0).optional(),
    note: zod_1.z.string().max(255).optional().nullable(),
    opponentPoints: zod_1.z.number().int().min(0).max(5).optional(),
});
const clockActionSchema = zod_1.z.object({
    action: zod_1.z.enum([
        'TOGGLE_MAIN',
        'SET_MAIN',
        'ADJUST_MAIN',
        'CHANGE_PHASE',
        'TOGGLE_BREAK',
        'START_ACTIVITY',
        'CANCEL_ACTIVITY',
        'COMPLETE_ACTIVITY_TIMEOUT',
        'TOGGLE_MEDICAL',
        'OPEN_CHALLENGE',
        'RESOLVE_CHALLENGE',
    ]),
    remainingMs: zod_1.z.number().int().min(0).optional(),
    deltaMs: zod_1.z.number().int().optional(),
    phase: zod_1.z
        .enum(['PRE_MATCH', 'PERIOD_1', 'BREAK', 'PERIOD_2', 'FINISHED'])
        .optional(),
    corner: zod_1.z.enum(['RED', 'BLUE']).optional(),
    timerType: zod_1.z.enum(['INJURY', 'BLOOD']).optional(),
    won: zod_1.z.boolean().optional(),
    outcome: zod_1.z.enum(['WON', 'LOST', 'CANCEL']).optional(),
});
const completeBoutSchema = zod_1.z.object({
    winnerCorner: zod_1.z.enum(['RED', 'BLUE']),
    victoryType: zod_1.z.enum(['VFA', 'VSU', 'VSU1', 'VPO', 'VPO1', 'DSQ', 'VIN', 'VFO']),
    redScore: zod_1.z.number().int().min(0).optional(),
    blueScore: zod_1.z.number().int().min(0).optional(),
});
const updateSessionDetailsSchema = zod_1.z.object({
    metadata: zod_1.z
        .object({
        matName: zod_1.z.string().trim().min(1).optional(),
        boutNumber: zod_1.z.string().trim().min(1).optional(),
        style: zod_1.z.enum(['FS', 'GR', 'WW']).optional(),
        ageCategory: zod_1.z.enum(['SENIOR', 'U23', 'U20', 'U17', 'U15']).optional(),
        weightClass: zod_1.z.string().trim().min(1).optional(),
    })
        .optional(),
    red: zod_1.z
        .object({
        name: zod_1.z.string().trim().min(1).optional(),
        countryOrTeam: zod_1.z.string().trim().min(1).max(50).optional(),
    })
        .optional(),
    blue: zod_1.z
        .object({
        name: zod_1.z.string().trim().min(1).optional(),
        countryOrTeam: zod_1.z.string().trim().min(1).max(50).optional(),
    })
        .optional(),
});
/**
 * GET /api/tournaments/:id/bouts
 * Mendukung filter query ?mat=MAT%20A&status=SCHEDULED
 */
router.get('/tournaments/:id/bouts', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const tournamentId = req.params.id;
    const matFilter = typeof req.query.mat === 'string' ? req.query.mat.trim() : undefined;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const divisionFilter = typeof req.query.divisionId === 'string' ? req.query.divisionId.trim() : undefined;
    const validStatuses = new Set([
        'TBD',
        'SCHEDULED',
        'ON_DECK',
        'IN_PROGRESS',
        'COMPLETED',
    ]);
    if (statusFilter && !validStatuses.has(statusFilter)) {
        throw new errorHandler_1.AppError(400, `Filter status "${statusFilter}" tidak valid.`);
    }
    const bouts = await prisma_1.prisma.bout.findMany({
        where: {
            tournamentId,
            ...(matFilter ? { matName: matFilter } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(divisionFilter ? { divisionId: divisionFilter } : {}),
        },
        include: {
            redAthlete: true,
            blueAthlete: true,
            winnerAthlete: true,
            division: true,
        },
        orderBy: [{ roundOrder: 'asc' }, { bracketPosition: 'asc' }],
    });
    bouts.sort((a, b) => {
        if (a.boutNumber !== null && b.boutNumber !== null) {
            return a.boutNumber - b.boutNumber;
        }
        if (a.boutNumber !== null)
            return -1;
        if (b.boutNumber !== null)
            return 1;
        if (a.roundOrder !== b.roundOrder)
            return a.roundOrder - b.roundOrder;
        return a.bracketPosition - b.bracketPosition;
    });
    res.json({
        tournamentId,
        total: bouts.length,
        bouts,
    });
}));
/**
 * POST /api/tournaments/:id/schedule/generate
 * Mengatur bout_number dan mat_name otomatis secara merata antar ronde (roundOrder).
 */
router.post('/tournaments/:id/schedule/generate', (0, validate_1.validateBody)(generateScheduleSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const tournamentId = req.params.id;
    const { mats } = req.body;
    const scheduledBouts = await prisma_1.prisma.$transaction(async (tx) => {
        const tournament = await tx.tournament.findUnique({
            where: { id: tournamentId },
        });
        if (!tournament) {
            throw new errorHandler_1.AppError(404, 'Turnamen tidak ditemukan.');
        }
        const allBouts = await tx.bout.findMany({
            where: { tournamentId },
            include: { division: true },
            orderBy: [
                { roundOrder: 'asc' },
                { divisionId: 'asc' },
                { bracketPosition: 'asc' },
            ],
        });
        let counter = 1;
        for (let i = 0; i < allBouts.length; i++) {
            const b = allBouts[i];
            const targetMat = mats && mats.length > 0
                ? mats[i % mats.length]
                : b.division?.assignedMat || b.matName || 'MAT A';
            await tx.bout.update({
                where: { id: b.id },
                data: {
                    boutNumber: counter++,
                    matName: targetMat,
                },
            });
        }
        return tx.bout.findMany({
            where: { tournamentId },
            include: {
                redAthlete: true,
                blueAthlete: true,
                division: true,
            },
            orderBy: [{ boutNumber: 'asc' }],
        });
    });
    res.json({
        tournamentId,
        scheduledCount: scheduledBouts.length,
        bouts: scheduledBouts,
    });
}));
/**
 * PATCH /api/tournaments/:id/bouts/reorder
 * Memperbarui urutan bout_number dan pemindahan mat_name secara massal dalam 1 transaksi.
 */
router.patch('/tournaments/:id/bouts/reorder', (0, validate_1.validateBody)(reorderBoutsSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const tournamentId = req.params.id;
    const { bouts, orderedBoutIds, matName } = req.body;
    const updatedCount = await prisma_1.prisma.$transaction(async (tx) => {
        let count = 0;
        if (bouts && bouts.length > 0) {
            for (const item of bouts) {
                await tx.bout.updateMany({
                    where: {
                        id: item.id,
                        tournamentId,
                    },
                    data: {
                        ...(item.boutNumber !== undefined ? { boutNumber: item.boutNumber } : {}),
                        ...(item.matName !== undefined ? { matName: item.matName } : {}),
                        ...(item.status !== undefined ? { status: item.status } : {}),
                    },
                });
                count++;
            }
        }
        else if (orderedBoutIds && orderedBoutIds.length > 0) {
            for (let idx = 0; idx < orderedBoutIds.length; idx++) {
                await tx.bout.updateMany({
                    where: {
                        id: orderedBoutIds[idx],
                        tournamentId,
                    },
                    data: {
                        boutNumber: idx + 1,
                        ...(matName ? { matName } : {}),
                    },
                });
                count++;
            }
        }
        return count;
    });
    res.json({
        tournamentId,
        updatedCount,
    });
}));
/**
 * POST /api/bouts/manual
 * Membuat partai manual/ekshibisi cepat (tournament_id = null, division_id = null)
 * dengan nama/kontingen manual agar tetap tercatat lengkap di MySQL.
 */
router.post('/bouts/manual', (0, validate_1.validateBody)(createManualBoutSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const data = req.body;
    const manualBout = await prisma_1.prisma.bout.create({
        data: {
            tournamentId: data.tournamentId ?? null,
            divisionId: data.divisionId ?? null,
            boutNumber: data.boutNumber ?? null,
            matName: data.matName,
            round: data.round,
            roundOrder: 10,
            bracketPosition: 1,
            redAthleteId: null,
            blueAthleteId: null,
            redManualName: data.redManualName,
            redManualRegion: data.redManualRegion,
            blueManualName: data.blueManualName,
            blueManualRegion: data.blueManualRegion,
            status: 'SCHEDULED',
        },
    });
    res.status(201).json({ bout: manualBout });
}));
// ============================================================================
// Phase 14: Live Scoring & Match Session Endpoints
// ============================================================================
/**
 * POST /api/bouts/:id/load
 * Memuat partai ke match_sessions pada mat_name terkait, mengubah status menjadi IN_PROGRESS,
 * dan memilih partai ON_DECK berikutnya.
 */
router.post('/bouts/:id/load', (0, validate_1.validateBody)(loadBoutSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const boutId = req.params.id;
    const { matName, forceReplace } = req.body;
    const matchState = await (0, matchSessionService_1.loadBoutToSession)(boutId, { matName, forceReplace });
    res.json({ matchState });
}));
/**
 * POST /api/bouts/:id/events
 * Menambahkan event poin/caution/passivity ke match_events dan menghitung ulang MatchState.
 */
router.post('/bouts/:id/events', (0, validate_1.validateBody)(recordEventSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const boutId = req.params.id;
    const payload = req.body;
    const result = await (0, matchSessionService_1.recordBoutEvent)(boutId, payload);
    res.status(201).json(result);
}));
/**
 * POST /api/bouts/:id/events/undo
 * Soft-undo event terakhir (is_undone = true) tanpa menghapus record di MySQL.
 */
router.post('/bouts/:id/events/undo', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const boutId = req.params.id;
    const result = await (0, matchSessionService_1.undoLastBoutEvent)(boutId);
    res.json(result);
}));
/**
 * PATCH /api/bouts/:id/clock
 * Menangani transisi diskrit jam, babak, activity clock, medical timer, dan challenge.
 */
router.patch('/bouts/:id/clock', (0, validate_1.validateBody)(clockActionSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const boutId = req.params.id;
    const payload = req.body;
    const result = await (0, matchSessionService_1.updateBoutClock)(boutId, payload);
    res.json(result);
}));
/**
 * PATCH /api/bouts/:id/session
 * Memperbarui metadata dan nama/kontingen pegulat pada sesi live aktif.
 */
router.patch('/bouts/:id/session', (0, validate_1.validateBody)(updateSessionDetailsSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const boutId = req.params.id;
    const payload = req.body;
    const result = await (0, matchSessionService_1.updateBoutSessionDetails)(boutId, payload);
    res.json(result);
}));
/**
 * POST /api/bouts/:id/complete
 * Menyelesaikan partai dan memajukan pemenang ke babak berikutnya / Repechage dalam 1 transaksi atomik.
 */
router.post('/bouts/:id/complete', (0, validate_1.validateBody)(completeBoutSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const boutId = req.params.id;
    const payload = req.body;
    const result = await (0, matchSessionService_1.completeBoutAndAdvance)(boutId, payload);
    res.json(result);
}));
/**
 * GET /api/schedule/snapshot
 * Mengembalikan ScheduleSnapshot terbaru (activeMats + upcomingBouts).
 */
router.get('/schedule/snapshot', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const matFilter = typeof req.query.mat === 'string' ? req.query.mat.trim() : undefined;
    const tournamentId = typeof req.query.tournamentId === 'string'
        ? req.query.tournamentId.trim()
        : undefined;
    const snapshot = await (0, matchSessionService_1.getLiveScheduleSnapshot)({ matFilter, tournamentId });
    res.json(snapshot);
}));
exports.default = router;
