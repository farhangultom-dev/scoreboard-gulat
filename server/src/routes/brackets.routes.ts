import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { AppError, asyncHandler } from '../middlewares/errorHandler';
import { validateBody } from '../middlewares/validate';
import {
  generateDivisionBracketInTx,
  getDivisionBracketWithStandings,
  mapPrismaAthleteToShared,
} from '../services/bracketService';
import { generateOfficialDraw } from '../../../shared/engine/uwwDrawEngine';
import { validateManualDraw } from '../../../shared/engine/uwwManualDraw';

const router = Router();

const drawOptionsSchema = z.object({
  separateSameRegion: z.boolean().optional().default(true),
});

const manualDrawSchema = z
  .object({
    athleteId1: z.string().optional(),
    athleteId2: z.string().optional(),
    assignments: z
      .array(
        z.object({
          athleteId: z.string().min(1),
          drawNumber: z.number().int().min(1).nullable(),
        })
      )
      .optional(),
  })
  .refine(
    (data) =>
      (Boolean(data.athleteId1) && Boolean(data.athleteId2)) ||
      (Array.isArray(data.assignments) && data.assignments.length > 0),
    {
      message:
        'Sertakan pasangan athleteId1 & athleteId2 untuk ditukar, atau daftar assignments [{ athleteId, drawNumber }].',
    }
  );

const generateBracketSchema = z.object({
  separateSameRegion: z.boolean().optional().default(true),
  format: z
    .enum(['SINGLE_BOUT', 'NORDIC', 'GROUP_CROSS', 'ELIMINATION_REPECHAGE'])
    .optional(),
});

const unlockBracketSchema = z.object({
  force: z.boolean().optional().default(false),
});

/**
 * POST /api/divisions/:id/draw
 * Menjalankan shared/engine/uwwDrawEngine.ts dan menyimpan draw_number ke tabel athletes.
 */
router.post(
  '/divisions/:id/draw',
  validateBody(drawOptionsSchema),
  asyncHandler(async (req, res) => {
    const divisionId = req.params.id;
    const { separateSameRegion } = req.body as z.infer<typeof drawOptionsSchema>;

    const updatedAthletes = await prisma.$transaction(async (tx) => {
      const division = await tx.division.findUnique({
        where: { id: divisionId },
        include: {
          athletes: true,
        },
      });

      if (!division) {
        throw new AppError(404, 'Divisi pertandingan tidak ditemukan.');
      }

      if (division.isDrawLocked) {
        throw new AppError(
          409,
          'Undian divisi ini sudah dikunci. Buka kunci bagan terlebih dahulu untuk mengundi ulang.'
        );
      }

      const sharedAthletes = division.athletes.map((a) =>
        mapPrismaAthleteToShared(a, division)
      );

      const drawn = generateOfficialDraw(sharedAthletes, { separateSameRegion });

      // Transaksi 2-tahap agar update acak tidak menabrak @@unique([divisionId, drawNumber])
      await tx.athlete.updateMany({
        where: { divisionId },
        data: { drawNumber: null },
      });

      for (const ath of drawn) {
        await tx.athlete.update({
          where: { id: ath.id },
          data: { drawNumber: ath.drawNumber ?? null },
        });
      }

      return tx.athlete.findMany({
        where: { divisionId },
        orderBy: [{ drawNumber: 'asc' }, { name: 'asc' }],
      });
    });

    res.json({
      divisionId,
      athletes: updatedAthletes,
    });
  })
);

/**
 * PATCH /api/divisions/:id/draw/manual
 * Menyimpan atau menukar draw_number atlet secara manual menggunakan transaksi 2-tahap
 * anti-bentrok (reset NULL -> tulis nilai baru) dan memvalidasi aturan keunikan 1..N.
 */
router.patch(
  '/divisions/:id/draw/manual',
  validateBody(manualDrawSchema),
  asyncHandler(async (req, res) => {
    const divisionId = req.params.id;
    const { athleteId1, athleteId2, assignments } = req.body as z.infer<
      typeof manualDrawSchema
    >;

    const txResult = await prisma.$transaction(async (tx) => {
      const division = await tx.division.findUnique({
        where: { id: divisionId },
        include: { athletes: true },
      });

      if (!division) {
        throw new AppError(404, 'Divisi pertandingan tidak ditemukan.');
      }

      if (division.isDrawLocked) {
        throw new AppError(
          409,
          'Undian divisi sudah dikunci. Tidak dapat menukar atau mengubah nomor undian.'
        );
      }

      const totalAthletes = division.athletes.length;
      const athleteById = new Map(division.athletes.map((a) => [a.id, a]));

      // Normalisasi payload swap (athleteId1 & athleteId2) ataupun batch assignments
      let normalizedAssignments: Array<{
        athleteId: string;
        drawNumber: number | null;
      }> = [];

      if (athleteId1 && athleteId2) {
        const ath1 = athleteById.get(athleteId1);
        const ath2 = athleteById.get(athleteId2);

        if (!ath1 || !ath2) {
          throw new AppError(
            404,
            'Salah satu atlet tidak ditemukan pada divisi ini.'
          );
        }

        normalizedAssignments = [
          { athleteId: ath1.id, drawNumber: ath2.drawNumber ?? null },
          { athleteId: ath2.id, drawNumber: ath1.drawNumber ?? null },
        ];
      } else if (assignments && assignments.length > 0) {
        // Deduplicate jika ada athleteId berulang di payload (ambil entri terakhir)
        const deduped = new Map<string, number | null>();
        for (const item of assignments) {
          if (!athleteById.has(item.athleteId)) {
            throw new AppError(
              400,
              `Atlet ${item.athleteId} bukan anggota dari divisi ini.`
            );
          }
          deduped.set(item.athleteId, item.drawNumber);
        }
        normalizedAssignments = Array.from(deduped.entries()).map(
          ([athleteId, drawNumber]) => ({ athleteId, drawNumber })
        );
      }

      // Validasi business rules: rentang 1..N dan anti-duplikat setelah digabung dengan atlet lain
      const simulatedDrawMap = new Map<string, number | null>();
      for (const ath of division.athletes) {
        simulatedDrawMap.set(ath.id, ath.drawNumber ?? null);
      }
      for (const item of normalizedAssignments) {
        if (item.drawNumber !== null) {
          if (
            !Number.isInteger(item.drawNumber) ||
            item.drawNumber < 1 ||
            item.drawNumber > totalAthletes
          ) {
            throw new AppError(
              400,
              `Nomor undian #${item.drawNumber} tidak sah. Wajib bernilai antara 1 hingga ${totalAthletes}.`
            );
          }
        }
        simulatedDrawMap.set(item.athleteId, item.drawNumber);
      }

      const usedBallOwner = new Map<number, string>();
      for (const [athId, drawNum] of simulatedDrawMap.entries()) {
        if (drawNum !== null) {
          const existingOwnerId = usedBallOwner.get(drawNum);
          if (existingOwnerId && existingOwnerId !== athId) {
            const ownerName = athleteById.get(existingOwnerId)?.name || existingOwnerId;
            const conflictName = athleteById.get(athId)?.name || athId;
            throw new AppError(
              409,
              `Nomor undian #${drawNum} duplikat antara "${ownerName}" dan "${conflictName}" pada divisi ini.`
            );
          }
          usedBallOwner.set(drawNum, athId);
        }
      }

      // Transaksi 2-Tahap Anti-Bentrok:
      // Tahap 1: Kosongkan draw_number atlet yang berubah menjadi NULL
      const changedIds = normalizedAssignments.map((a) => a.athleteId);
      if (changedIds.length > 0) {
        await tx.athlete.updateMany({
          where: {
            id: { in: changedIds },
            divisionId,
          },
          data: { drawNumber: null },
        });
      }

      // Tahap 2: Set nilai draw_number baru untuk yang non-null
      for (const item of normalizedAssignments) {
        if (item.drawNumber !== null) {
          await tx.athlete.update({
            where: { id: item.athleteId },
            data: { drawNumber: item.drawNumber },
          });
        }
      }

      const latestAthletes = await tx.athlete.findMany({
        where: { divisionId },
        orderBy: [{ drawNumber: 'asc' }, { name: 'asc' }],
      });

      const sharedAthletes = latestAthletes.map((a) =>
        mapPrismaAthleteToShared(a, division)
      );
      const validation = validateManualDraw(sharedAthletes);

      return {
        athletes: latestAthletes,
        validation,
      };
    });

    res.json({
      divisionId,
      athletes: txResult.athletes,
      validation: txResult.validation,
    });
  })
);

/**
 * POST /api/divisions/:id/bracket/generate
 * Mengunci is_draw_locked = true, menjalankan shared/engine/uwwBracketEngine.ts,
 * dan menyimpan seluruh node bouts beserta next_win_bout_id / next_lose_bout_id
 * dalam satu prisma.$transaction. Menolak dengan 409 Conflict jika sudah ada partai
 * berstatus IN_PROGRESS atau COMPLETED.
 */
router.post(
  '/divisions/:id/bracket/generate',
  validateBody(generateBracketSchema),
  asyncHandler(async (req, res) => {
    const divisionId = req.params.id;
    const { separateSameRegion, format } = req.body as z.infer<
      typeof generateBracketSchema
    >;

    await generateDivisionBracketInTx(divisionId, {
      separateSameRegion,
      format,
    });

    const bracketData = await getDivisionBracketWithStandings(divisionId);
    res.status(201).json(bracketData);
  })
);

/**
 * POST /api/divisions/:id/bracket/unlock
 * Membuka kunci & menghapus bagan divisi (hanya diizinkan jika belum ada partai selesai,
 * atau dengan flag force: true).
 */
router.post(
  '/divisions/:id/bracket/unlock',
  validateBody(unlockBracketSchema),
  asyncHandler(async (req, res) => {
    const divisionId = req.params.id;
    const { force } = req.body as z.infer<typeof unlockBracketSchema>;

    const result = await prisma.$transaction(async (tx) => {
      const division = await tx.division.findUnique({
        where: { id: divisionId },
        include: { bouts: true },
      });

      if (!division) {
        throw new AppError(404, 'Divisi pertandingan tidak ditemukan.');
      }

      const activeOrCompleted = division.bouts.filter(
        (b) => b.status === 'IN_PROGRESS' || b.status === 'COMPLETED'
      );

      if (activeOrCompleted.length > 0 && !force) {
        throw new AppError(
          409,
          'Tidak dapat membuka kunci bagan karena sudah ada partai yang sedang berjalan atau selesai. Kirim { "force": true } jika ingin mereset paksa.'
        );
      }

      const deleted = await tx.bout.deleteMany({
        where: { divisionId },
      });

      const updatedDivision = await tx.division.update({
        where: { id: divisionId },
        data: { isDrawLocked: false },
      });

      return {
        divisionId,
        isDrawLocked: updatedDivision.isDrawLocked,
        deletedBoutsCount: deleted.count,
      };
    });

    res.json(result);
  })
);

/**
 * GET /api/divisions/:id/bracket
 * Mengembalikan daftar bouts lengkap dengan data atlet serta hasil kalkulasi klasemen (StandingRow[]).
 */
router.get(
  '/divisions/:id/bracket',
  asyncHandler(async (req, res) => {
    const divisionId = req.params.id;
    const bracketData = await getDivisionBracketWithStandings(divisionId);
    res.json(bracketData);
  })
);

export default router;
