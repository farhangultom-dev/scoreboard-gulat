import { Router } from 'express';
import { z } from 'zod';
import { BoutStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError, asyncHandler } from '../middlewares/errorHandler';
import { validateBody } from '../middlewares/validate';
import {
  completeBoutAndAdvance,
  getLiveScheduleSnapshot,
  loadBoutToSession,
  recordBoutEvent,
  undoLastBoutEvent,
  updateBoutClock,
  updateBoutSessionDetails,
} from '../services/matchSessionService';

const router = Router();

const generateScheduleSchema = z.object({
  mats: z.array(z.string().trim().min(1)).optional(),
});

const reorderBoutsSchema = z
  .object({
    bouts: z
      .array(
        z.object({
          id: z.string().min(1),
          boutNumber: z.number().int().positive().nullable().optional(),
          matName: z.string().trim().min(1).optional(),
          status: z
            .enum(['TBD', 'SCHEDULED', 'ON_DECK', 'IN_PROGRESS', 'COMPLETED'])
            .optional(),
        })
      )
      .optional(),
    orderedBoutIds: z.array(z.string().min(1)).optional(),
    matName: z.string().trim().min(1).optional(),
  })
  .refine(
    (data) =>
      (Array.isArray(data.bouts) && data.bouts.length > 0) ||
      (Array.isArray(data.orderedBoutIds) && data.orderedBoutIds.length > 0),
    {
      message: 'Sertakan daftar bouts atau orderedBoutIds untuk mengubah urutan partai.',
    }
  );

const createManualBoutSchema = z.object({
  tournamentId: z.string().optional().nullable(),
  divisionId: z.string().optional().nullable(),
  boutNumber: z.number().int().positive().optional().nullable(),
  matName: z.string().trim().min(1).default('MAT A'),
  round: z.string().trim().min(1).default('EXHIBITION'),
  redManualName: z.string().trim().min(1, 'Nama pegulat sudut merah wajib diisi'),
  redManualRegion: z.string().trim().min(1).max(50).default('RED'),
  blueManualName: z.string().trim().min(1, 'Nama pegulat sudut biru wajib diisi'),
  blueManualRegion: z.string().trim().min(1).max(50).default('BLUE'),
});

const loadBoutSchema = z.object({
  matName: z.string().trim().min(1).optional(),
  forceReplace: z.boolean().optional().default(false),
});

const recordEventSchema = z.object({
  corner: z.enum(['RED', 'BLUE']),
  type: z.enum([
    'POINT',
    'CAUTION',
    'PASSIVITY',
    'ACTIVITY_POINT',
    'CHALLENGE_LOST_POINT',
    'MANUAL_ADJUST',
  ]),
  points: z.number().int().min(-50).max(50).optional().default(0),
  period: z.number().int().min(1).max(2).optional(),
  matchClockMs: z.number().int().min(0).optional(),
  note: z.string().max(255).optional().nullable(),
  opponentPoints: z.number().int().min(0).max(5).optional(),
});

const clockActionSchema = z.object({
  action: z.enum([
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
  remainingMs: z.number().int().min(0).optional(),
  deltaMs: z.number().int().optional(),
  phase: z
    .enum(['PRE_MATCH', 'PERIOD_1', 'BREAK', 'PERIOD_2', 'FINISHED'])
    .optional(),
  corner: z.enum(['RED', 'BLUE']).optional(),
  timerType: z.enum(['INJURY', 'BLOOD']).optional(),
  won: z.boolean().optional(),
  outcome: z.enum(['WON', 'LOST', 'CANCEL']).optional(),
});

const completeBoutSchema = z.object({
  winnerCorner: z.enum(['RED', 'BLUE']),
  victoryType: z.enum(['VFA', 'VSU', 'VSU1', 'VPO', 'VPO1', 'DSQ', 'VIN', 'VFO']),
  redScore: z.number().int().min(0).optional(),
  blueScore: z.number().int().min(0).optional(),
});

const updateSessionDetailsSchema = z.object({
  metadata: z
    .object({
      matName: z.string().trim().min(1).optional(),
      boutNumber: z.string().trim().min(1).optional(),
      style: z.enum(['FS', 'GR', 'WW']).optional(),
      ageCategory: z.enum(['SENIOR', 'U23', 'U20', 'U17', 'U15']).optional(),
      weightClass: z.string().trim().min(1).optional(),
    })
    .optional(),
  red: z
    .object({
      name: z.string().trim().min(1).optional(),
      countryOrTeam: z.string().trim().min(1).max(50).optional(),
    })
    .optional(),
  blue: z
    .object({
      name: z.string().trim().min(1).optional(),
      countryOrTeam: z.string().trim().min(1).max(50).optional(),
    })
    .optional(),
});

/**
 * GET /api/tournaments/:id/bouts
 * Mendukung filter query ?mat=MAT%20A&status=SCHEDULED
 */
router.get(
  '/tournaments/:id/bouts',
  asyncHandler(async (req, res) => {
    const tournamentId = req.params.id;
    const matFilter = typeof req.query.mat === 'string' ? req.query.mat.trim() : undefined;
    const statusFilter =
      typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const divisionFilter =
      typeof req.query.divisionId === 'string' ? req.query.divisionId.trim() : undefined;

    const validStatuses = new Set([
      'TBD',
      'SCHEDULED',
      'ON_DECK',
      'IN_PROGRESS',
      'COMPLETED',
    ]);

    if (statusFilter && !validStatuses.has(statusFilter)) {
      throw new AppError(400, `Filter status "${statusFilter}" tidak valid.`);
    }

    const bouts = await prisma.bout.findMany({
      where: {
        tournamentId,
        ...(matFilter ? { matName: matFilter } : {}),
        ...(statusFilter ? { status: statusFilter as BoutStatus } : {}),
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
      if (a.boutNumber !== null) return -1;
      if (b.boutNumber !== null) return 1;
      if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
      return a.bracketPosition - b.bracketPosition;
    });

    res.json({
      tournamentId,
      total: bouts.length,
      bouts,
    });
  })
);

/**
 * POST /api/tournaments/:id/schedule/generate
 * Mengatur bout_number dan mat_name otomatis secara merata antar ronde (roundOrder).
 */
router.post(
  '/tournaments/:id/schedule/generate',
  validateBody(generateScheduleSchema),
  asyncHandler(async (req, res) => {
    const tournamentId = req.params.id;
    const { mats } = req.body as z.infer<typeof generateScheduleSchema>;

    const scheduledBouts = await prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({
        where: { id: tournamentId },
      });
      if (!tournament) {
        throw new AppError(404, 'Turnamen tidak ditemukan.');
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
        const targetMat =
          mats && mats.length > 0
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
  })
);

/**
 * PATCH /api/tournaments/:id/bouts/reorder
 * Memperbarui urutan bout_number dan pemindahan mat_name secara massal dalam 1 transaksi.
 */
router.patch(
  '/tournaments/:id/bouts/reorder',
  validateBody(reorderBoutsSchema),
  asyncHandler(async (req, res) => {
    const tournamentId = req.params.id;
    const { bouts, orderedBoutIds, matName } = req.body as z.infer<
      typeof reorderBoutsSchema
    >;

    const updatedCount = await prisma.$transaction(async (tx) => {
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
      } else if (orderedBoutIds && orderedBoutIds.length > 0) {
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
  })
);

/**
 * POST /api/bouts/manual
 * Membuat partai manual/ekshibisi cepat (tournament_id = null, division_id = null)
 * dengan nama/kontingen manual agar tetap tercatat lengkap di MySQL.
 */
router.post(
  '/bouts/manual',
  validateBody(createManualBoutSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof createManualBoutSchema>;

    const manualBout = await prisma.bout.create({
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
  })
);

// ============================================================================
// Phase 14: Live Scoring & Match Session Endpoints
// ============================================================================

/**
 * POST /api/bouts/:id/load
 * Memuat partai ke match_sessions pada mat_name terkait, mengubah status menjadi IN_PROGRESS,
 * dan memilih partai ON_DECK berikutnya.
 */
router.post(
  '/bouts/:id/load',
  validateBody(loadBoutSchema),
  asyncHandler(async (req, res) => {
    const boutId = req.params.id;
    const { matName, forceReplace } = req.body as z.infer<typeof loadBoutSchema>;
    const matchState = await loadBoutToSession(boutId, { matName, forceReplace });
    res.json({ matchState });
  })
);

/**
 * POST /api/bouts/:id/events
 * Menambahkan event poin/caution/passivity ke match_events dan menghitung ulang MatchState.
 */
router.post(
  '/bouts/:id/events',
  validateBody(recordEventSchema),
  asyncHandler(async (req, res) => {
    const boutId = req.params.id;
    const payload = req.body as z.infer<typeof recordEventSchema>;
    const result = await recordBoutEvent(boutId, payload);
    res.status(201).json(result);
  })
);

/**
 * POST /api/bouts/:id/events/undo
 * Soft-undo event terakhir (is_undone = true) tanpa menghapus record di MySQL.
 */
router.post(
  '/bouts/:id/events/undo',
  asyncHandler(async (req, res) => {
    const boutId = req.params.id;
    const result = await undoLastBoutEvent(boutId);
    res.json(result);
  })
);

/**
 * PATCH /api/bouts/:id/clock
 * Menangani transisi diskrit jam, babak, activity clock, medical timer, dan challenge.
 */
router.patch(
  '/bouts/:id/clock',
  validateBody(clockActionSchema),
  asyncHandler(async (req, res) => {
    const boutId = req.params.id;
    const payload = req.body as z.infer<typeof clockActionSchema>;
    const result = await updateBoutClock(boutId, payload);
    res.json(result);
  })
);

/**
 * PATCH /api/bouts/:id/session
 * Memperbarui metadata dan nama/kontingen pegulat pada sesi live aktif.
 */
router.patch(
  '/bouts/:id/session',
  validateBody(updateSessionDetailsSchema),
  asyncHandler(async (req, res) => {
    const boutId = req.params.id;
    const payload = req.body as z.infer<typeof updateSessionDetailsSchema>;
    const result = await updateBoutSessionDetails(boutId, payload);
    res.json(result);
  })
);

/**
 * POST /api/bouts/:id/complete
 * Menyelesaikan partai dan memajukan pemenang ke babak berikutnya / Repechage dalam 1 transaksi atomik.
 */
router.post(
  '/bouts/:id/complete',
  validateBody(completeBoutSchema),
  asyncHandler(async (req, res) => {
    const boutId = req.params.id;
    const payload = req.body as z.infer<typeof completeBoutSchema>;
    const result = await completeBoutAndAdvance(boutId, payload);
    res.json(result);
  })
);

/**
 * GET /api/schedule/snapshot
 * Mengembalikan ScheduleSnapshot terbaru (activeMats + upcomingBouts).
 */
router.get(
  '/schedule/snapshot',
  asyncHandler(async (req, res) => {
    const matFilter =
      typeof req.query.mat === 'string' ? req.query.mat.trim() : undefined;
    const tournamentId =
      typeof req.query.tournamentId === 'string'
        ? req.query.tournamentId.trim()
        : undefined;

    const snapshot = await getLiveScheduleSnapshot({ matFilter, tournamentId });
    res.json(snapshot);
  })
);

export default router;
