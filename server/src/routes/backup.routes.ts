import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { AppError, asyncHandler } from '../middlewares/errorHandler';
import { validateBody } from '../middlewares/validate';
import { hydrateActiveSessionsFromDb } from '../services/matchSessionService';

const router = Router();

const restoreBackupSchema = z.object({
  version: z.number().optional(),
  exportedAt: z.string().optional(),
  tournament: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    location: z.string().nullable().optional(),
    eventDate: z.string().nullable().optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional().default('ACTIVE'),
    createdAt: z.string().optional(),
  }),
  divisions: z.array(
    z.object({
      id: z.string().min(1),
      tournamentId: z.string().min(1),
      style: z.enum(['FS', 'WW', 'GR']),
      ageCategory: z.enum(['SENIOR', 'U23', 'U20', 'U17', 'U15']),
      weightClass: z.string().min(1),
      format: z.enum([
        'SINGLE_BOUT',
        'NORDIC',
        'GROUP_CROSS',
        'ELIMINATION_REPECHAGE',
      ]),
      assignedMat: z.string().default('MAT A'),
      isDrawLocked: z.boolean().default(false),
    })
  ),
  athletes: z.array(
    z.object({
      id: z.string().min(1),
      tournamentId: z.string().min(1),
      divisionId: z.string().min(1),
      name: z.string().min(1),
      region: z.string().min(1),
      regionCode: z.string().min(1),
      seed: z.number().int().nullable().optional(),
      drawNumber: z.number().int().nullable().optional(),
    })
  ),
  bouts: z.array(
    z.object({
      id: z.string().min(1),
      tournamentId: z.string().nullable().optional(),
      divisionId: z.string().nullable().optional(),
      boutNumber: z.number().int().nullable().optional(),
      matName: z.string().default('MAT A'),
      round: z.string().min(1),
      roundOrder: z.number().int().default(10),
      bracketPosition: z.number().int().default(1),
      bracketSide: z.enum(['TOP', 'BOTTOM']).nullable().optional(),
      redAthleteId: z.string().nullable().optional(),
      blueAthleteId: z.string().nullable().optional(),
      redManualName: z.string().nullable().optional(),
      redManualRegion: z.string().nullable().optional(),
      blueManualName: z.string().nullable().optional(),
      blueManualRegion: z.string().nullable().optional(),
      redSourceLabel: z.string().nullable().optional(),
      blueSourceLabel: z.string().nullable().optional(),
      nextWinBoutId: z.string().nullable().optional(),
      nextWinSlot: z.enum(['RED', 'BLUE']).nullable().optional(),
      nextLoseBoutId: z.string().nullable().optional(),
      nextLoseSlot: z.enum(['RED', 'BLUE']).nullable().optional(),
      status: z
        .enum(['TBD', 'SCHEDULED', 'ON_DECK', 'IN_PROGRESS', 'COMPLETED'])
        .default('TBD'),
      winnerCorner: z.enum(['RED', 'BLUE']).nullable().optional(),
      winnerAthleteId: z.string().nullable().optional(),
      redScore: z.number().int().default(0),
      blueScore: z.number().int().default(0),
      victoryType: z
        .enum(['VFA', 'VSU', 'VSU1', 'VPO', 'VPO1', 'DSQ', 'VIN', 'VFO'])
        .nullable()
        .optional(),
      redClassificationPts: z.number().int().default(0),
      blueClassificationPts: z.number().int().default(0),
      completedAt: z.string().nullable().optional(),
    })
  ),
  matchSessions: z
    .array(
      z.object({
        boutId: z.string().min(1),
        matName: z.string().nullable().optional(),
        version: z.number().int().default(1),
        phase: z
          .enum(['PRE_MATCH', 'PERIOD_1', 'BREAK', 'PERIOD_2', 'FINISHED'])
          .default('PRE_MATCH'),
        mainClockJson: z.unknown(),
        breakClockJson: z.unknown(),
        activityClockJson: z.unknown(),
        redStateJson: z.unknown(),
        blueStateJson: z.unknown(),
        activeChallengeCorner: z.enum(['RED', 'BLUE']).nullable().optional(),
      })
    )
    .optional()
    .default([]),
  matchEvents: z
    .array(
      z.object({
        id: z.string().min(1),
        boutId: z.string().min(1),
        sequenceNo: z.number().int(),
        period: z.number().int(),
        matchClockMs: z.number().int(),
        corner: z.enum(['RED', 'BLUE']),
        type: z.enum([
          'POINT',
          'CAUTION',
          'PASSIVITY',
          'ACTIVITY_POINT',
          'CHALLENGE_LOST_POINT',
          'MANUAL_ADJUST',
        ]),
        points: z.number().int(),
        note: z.string().nullable().optional(),
        isUndone: z.boolean().default(false),
        createdAt: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

/**
 * GET /api/tournaments/:id/backup
 * Mengekspor 1 file .json lengkap berisi turnamen, seluruh divisi, atlet, bagan/partai,
 * match_sessions, dan seluruh match_events.
 */
router.get(
  '/tournaments/:id/backup',
  asyncHandler(async (req, res) => {
    const tournamentId = req.params.id;

    const tournament = await prisma.tournament.findUnique({
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
      throw new AppError(404, 'Turnamen tidak ditemukan untuk di-backup.');
    }

    const matchSessions = tournament.bouts
      .filter((b) => b.matchSession !== null)
      .map((b) => b.matchSession!);

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

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="uww-backup-${safeName || 'tournament'}.json"`
    );
    res.json(backupPayload);
  })
);

/**
 * POST /api/tournaments/restore
 * Mengimpor kembali file .json hasil backup ke MySQL dalam satu transaksi atomik.
 */
router.post(
  '/tournaments/restore',
  validateBody(restoreBackupSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof restoreBackupSchema>;

    const summary = await prisma.$transaction(async (tx) => {
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
              mainClockJson: (s.mainClockJson ?? {}) as Prisma.InputJsonValue,
              breakClockJson: (s.breakClockJson ?? {}) as Prisma.InputJsonValue,
              activityClockJson: (s.activityClockJson ?? {}) as Prisma.InputJsonValue,
              redStateJson: (s.redStateJson ?? {}) as Prisma.InputJsonValue,
              blueStateJson: (s.blueStateJson ?? {}) as Prisma.InputJsonValue,
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

    await hydrateActiveSessionsFromDb();

    res.status(201).json(summary);
  })
);

export default router;
