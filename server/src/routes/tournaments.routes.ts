import { Router } from 'express';
import { z } from 'zod';
import { DivisionFormat } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError, asyncHandler } from '../middlewares/errorHandler';
import { validateBody } from '../middlewares/validate';
import { getLiveScheduleSnapshot } from '../services/matchSessionService';
import {
  broadcastBracketUpdate,
  broadcastScheduleUpdate,
} from '../socket/scoreboardSocket';

const router = Router();

const updateTournamentSchema = z.object({
  name: z.string().trim().min(1, 'Nama turnamen tidak boleh kosong').max(255).optional(),
  location: z.string().trim().max(255).optional().nullable(),
  eventDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

const updateDivisionSchema = z.object({
  assignedMat: z.string().trim().min(1).max(50).optional(),
  format: z
    .enum(['SINGLE_BOUT', 'NORDIC', 'GROUP_CROSS', 'ELIMINATION_REPECHAGE'])
    .optional(),
});

const createTournamentSchema = z.object({
  name: z.string().trim().min(1, 'Nama turnamen wajib diisi'),
  location: z.string().trim().optional().nullable(),
  eventDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional().default('ACTIVE'),
});

/**
 * GET /api/tournaments
 * Daftar seluruh turnamen beserta jumlah divisi, atlet, dan progres partai.
 */
router.get(
  '/tournaments',
  asyncHandler(async (_req, res) => {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            divisions: true,
            athletes: true,
            bouts: true,
          },
        },
        bouts: {
          select: {
            status: true,
          },
        },
      },
    });

    const data = tournaments.map((t) => {
      const completedBouts = t.bouts.filter((b) => b.status === 'COMPLETED').length;
      const inProgressBouts = t.bouts.filter((b) => b.status === 'IN_PROGRESS').length;
      return {
        id: t.id,
        name: t.name,
        location: t.location,
        eventDate: t.eventDate,
        status: t.status,
        createdAt: t.createdAt,
        counts: {
          divisions: t._count.divisions,
          athletes: t._count.athletes,
          totalBouts: t._count.bouts,
          completedBouts,
          inProgressBouts,
        },
      };
    });

    res.json({ tournaments: data });
  })
);

/**
 * POST /api/tournaments
 * Buat turnamen baru.
 */
router.post(
  '/tournaments',
  validateBody(createTournamentSchema),
  asyncHandler(async (req, res) => {
    const { name, location, eventDate, status } = req.body as z.infer<
      typeof createTournamentSchema
    >;

    let parsedDate: Date | null = null;
    if (eventDate) {
      const d = new Date(eventDate);
      if (isNaN(d.getTime())) {
        throw new AppError(400, 'Format tanggal eventDate tidak valid.');
      }
      parsedDate = d;
    }

    const tournament = await prisma.tournament.create({
      data: {
        name,
        location: location ?? null,
        eventDate: parsedDate,
        status: status ?? 'ACTIVE',
      },
    });

    res.status(201).json({ tournament });
  })
);

/**
 * PATCH /api/tournaments/:id
 * Memperbarui nama, lokasi, tanggal, atau status turnamen secara dinamis.
 */
router.patch(
  '/tournaments/:id',
  validateBody(updateTournamentSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, location, eventDate, status } = req.body as z.infer<
      typeof updateTournamentSchema
    >;

    const existing = await prisma.tournament.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'Turnamen tidak ditemukan.');
    }

    let parsedDate: Date | null | undefined = undefined;
    if (eventDate !== undefined) {
      if (eventDate === null || eventDate === '') {
        parsedDate = null;
      } else {
        const d = new Date(eventDate);
        if (isNaN(d.getTime())) {
          throw new AppError(400, 'Format tanggal eventDate tidak valid.');
        }
        parsedDate = d;
      }
    }

    const tournament = await prisma.tournament.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(location !== undefined ? { location } : {}),
        ...(parsedDate !== undefined ? { eventDate: parsedDate } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    res.json({ tournament });
  })
);

/**
 * DELETE /api/tournaments/:id
 * Hapus turnamen (cascade) dengan validasi eksplisit.
 */
router.delete(
  '/tournaments/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      throw new AppError(400, 'ID turnamen wajib disertakan.');
    }

    const existing = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError(404, 'Turnamen tidak ditemukan.');
    }

    await prisma.tournament.delete({
      where: { id },
    });

    res.json({
      deleted: true,
      id,
      name: existing.name,
    });
  })
);

/**
 * GET /api/tournaments/:id/divisions
 * Daftar divisi terkelompok lengkap dengan jumlah atlet, format bagan, dan status isDrawLocked.
 */
router.get(
  '/tournaments/:id/divisions',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      throw new AppError(404, 'Turnamen tidak ditemukan.');
    }

    const divisions = await prisma.division.findMany({
      where: { tournamentId: id },
      include: {
        athletes: {
          orderBy: [{ drawNumber: 'asc' }, { name: 'asc' }],
        },
        _count: {
          select: {
            athletes: true,
            bouts: true,
          },
        },
      },
      orderBy: [{ style: 'asc' }, { ageCategory: 'asc' }, { weightClass: 'asc' }],
    });

    const formattedDivisions = divisions.map((div) => ({
      id: div.id,
      tournamentId: div.tournamentId,
      style: div.style,
      ageCategory: div.ageCategory,
      weightClass: div.weightClass,
      format: div.format,
      assignedMat: div.assignedMat,
      isDrawLocked: div.isDrawLocked,
      athleteCount: div._count.athletes,
      boutCount: div._count.bouts,
      athleteIds: div.athletes.map((a) => a.id),
      athletes: div.athletes,
    }));

    const groupedByStyle = {
      FS: formattedDivisions.filter((d) => d.style === 'FS'),
      GR: formattedDivisions.filter((d) => d.style === 'GR'),
      WW: formattedDivisions.filter((d) => d.style === 'WW'),
    };

    res.json({
      tournamentId: id,
      divisions: formattedDivisions,
      groupedByStyle,
    });
  })
);

/**
 * PATCH /api/divisions/:id
 * Memperbarui assignedMat dan/atau format bagan divisi di MySQL.
 */
router.patch(
  '/divisions/:id',
  validateBody(updateDivisionSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { assignedMat, format } = req.body as z.infer<typeof updateDivisionSchema>;

    const existing = await prisma.division.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError(404, 'Divisi tidak ditemukan.');
    }

    if (format && format !== existing.format && existing.isDrawLocked) {
      throw new AppError(
        400,
        'Format bagan tidak dapat diubah setelah undian (Draw) dikunci.'
      );
    }

    const normalizedMat = assignedMat ? assignedMat.trim().toUpperCase() : undefined;

    const updatedDivision = await prisma.$transaction(async (tx) => {
      const updated = await tx.division.update({
        where: { id },
        data: {
          ...(normalizedMat ? { assignedMat: normalizedMat } : {}),
          ...(format ? { format: format as DivisionFormat } : {}),
        },
      });

      if (normalizedMat && normalizedMat !== existing.assignedMat) {
        await tx.bout.updateMany({
          where: {
            divisionId: id,
            status: { in: ['TBD', 'SCHEDULED', 'ON_DECK'] },
          },
          data: { matName: normalizedMat },
        });
      }

      return updated;
    });

    broadcastBracketUpdate({
      divisionId: updatedDivision.id,
      tournamentId: updatedDivision.tournamentId,
    });
    const snapshot = await getLiveScheduleSnapshot();
    broadcastScheduleUpdate(snapshot);

    res.json({ division: updatedDivision });
  })
);

/**
 * DELETE /api/divisions/:id
 * Menghapus divisi beserta atlet dan partainya dari MySQL.
 */
router.delete(
  '/divisions/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.division.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError(404, 'Divisi tidak ditemukan.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.bout.deleteMany({ where: { divisionId: id } });
      await tx.athlete.deleteMany({ where: { divisionId: id } });
      await tx.division.delete({ where: { id } });
    });

    broadcastBracketUpdate({
      divisionId: id,
      tournamentId: existing.tournamentId,
    });
    const snapshot = await getLiveScheduleSnapshot();
    broadcastScheduleUpdate(snapshot);

    res.json({
      deleted: true,
      id,
      tournamentId: existing.tournamentId,
    });
  })
);

export default router;
