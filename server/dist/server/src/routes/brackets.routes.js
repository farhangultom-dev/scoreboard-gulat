"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const errorHandler_1 = require("../middlewares/errorHandler");
const validate_1 = require("../middlewares/validate");
const bracketService_1 = require("../services/bracketService");
const uwwDrawEngine_1 = require("../../../shared/engine/uwwDrawEngine");
const uwwManualDraw_1 = require("../../../shared/engine/uwwManualDraw");
const router = (0, express_1.Router)();
const drawOptionsSchema = zod_1.z.object({
    separateSameRegion: zod_1.z.boolean().optional().default(true),
});
const manualDrawSchema = zod_1.z
    .object({
    athleteId1: zod_1.z.string().optional(),
    athleteId2: zod_1.z.string().optional(),
    assignments: zod_1.z
        .array(zod_1.z.object({
        athleteId: zod_1.z.string().min(1),
        drawNumber: zod_1.z.number().int().min(1).nullable(),
    }))
        .optional(),
})
    .refine((data) => (Boolean(data.athleteId1) && Boolean(data.athleteId2)) ||
    (Array.isArray(data.assignments) && data.assignments.length > 0), {
    message: 'Sertakan pasangan athleteId1 & athleteId2 untuk ditukar, atau daftar assignments [{ athleteId, drawNumber }].',
});
const generateBracketSchema = zod_1.z.object({
    separateSameRegion: zod_1.z.boolean().optional().default(true),
    format: zod_1.z
        .enum(['SINGLE_BOUT', 'NORDIC', 'GROUP_CROSS', 'ELIMINATION_REPECHAGE'])
        .optional(),
});
const unlockBracketSchema = zod_1.z.object({
    force: zod_1.z.boolean().optional().default(false),
});
/**
 * POST /api/divisions/:id/draw
 * Menjalankan shared/engine/uwwDrawEngine.ts dan menyimpan draw_number ke tabel athletes.
 */
router.post('/divisions/:id/draw', (0, validate_1.validateBody)(drawOptionsSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const divisionId = req.params.id;
    const { separateSameRegion } = req.body;
    const updatedAthletes = await prisma_1.prisma.$transaction(async (tx) => {
        const division = await tx.division.findUnique({
            where: { id: divisionId },
            include: {
                athletes: true,
            },
        });
        if (!division) {
            throw new errorHandler_1.AppError(404, 'Divisi pertandingan tidak ditemukan.');
        }
        if (division.isDrawLocked) {
            throw new errorHandler_1.AppError(409, 'Undian divisi ini sudah dikunci. Buka kunci bagan terlebih dahulu untuk mengundi ulang.');
        }
        const sharedAthletes = division.athletes.map((a) => (0, bracketService_1.mapPrismaAthleteToShared)(a, division));
        const drawn = (0, uwwDrawEngine_1.generateOfficialDraw)(sharedAthletes, { separateSameRegion });
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
}));
/**
 * PATCH /api/divisions/:id/draw/manual
 * Menyimpan atau menukar draw_number atlet secara manual menggunakan transaksi 2-tahap
 * anti-bentrok (reset NULL -> tulis nilai baru) dan memvalidasi aturan keunikan 1..N.
 */
router.patch('/divisions/:id/draw/manual', (0, validate_1.validateBody)(manualDrawSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const divisionId = req.params.id;
    const { athleteId1, athleteId2, assignments } = req.body;
    const txResult = await prisma_1.prisma.$transaction(async (tx) => {
        const division = await tx.division.findUnique({
            where: { id: divisionId },
            include: { athletes: true },
        });
        if (!division) {
            throw new errorHandler_1.AppError(404, 'Divisi pertandingan tidak ditemukan.');
        }
        if (division.isDrawLocked) {
            throw new errorHandler_1.AppError(409, 'Undian divisi sudah dikunci. Tidak dapat menukar atau mengubah nomor undian.');
        }
        const totalAthletes = division.athletes.length;
        const athleteById = new Map(division.athletes.map((a) => [a.id, a]));
        // Normalisasi payload swap (athleteId1 & athleteId2) ataupun batch assignments
        let normalizedAssignments = [];
        if (athleteId1 && athleteId2) {
            const ath1 = athleteById.get(athleteId1);
            const ath2 = athleteById.get(athleteId2);
            if (!ath1 || !ath2) {
                throw new errorHandler_1.AppError(404, 'Salah satu atlet tidak ditemukan pada divisi ini.');
            }
            normalizedAssignments = [
                { athleteId: ath1.id, drawNumber: ath2.drawNumber ?? null },
                { athleteId: ath2.id, drawNumber: ath1.drawNumber ?? null },
            ];
        }
        else if (assignments && assignments.length > 0) {
            // Deduplicate jika ada athleteId berulang di payload (ambil entri terakhir)
            const deduped = new Map();
            for (const item of assignments) {
                if (!athleteById.has(item.athleteId)) {
                    throw new errorHandler_1.AppError(400, `Atlet ${item.athleteId} bukan anggota dari divisi ini.`);
                }
                deduped.set(item.athleteId, item.drawNumber);
            }
            normalizedAssignments = Array.from(deduped.entries()).map(([athleteId, drawNumber]) => ({ athleteId, drawNumber }));
        }
        // Validasi business rules: rentang 1..N dan anti-duplikat setelah digabung dengan atlet lain
        const simulatedDrawMap = new Map();
        for (const ath of division.athletes) {
            simulatedDrawMap.set(ath.id, ath.drawNumber ?? null);
        }
        for (const item of normalizedAssignments) {
            if (item.drawNumber !== null) {
                if (!Number.isInteger(item.drawNumber) ||
                    item.drawNumber < 1 ||
                    item.drawNumber > totalAthletes) {
                    throw new errorHandler_1.AppError(400, `Nomor undian #${item.drawNumber} tidak sah. Wajib bernilai antara 1 hingga ${totalAthletes}.`);
                }
            }
            simulatedDrawMap.set(item.athleteId, item.drawNumber);
        }
        const usedBallOwner = new Map();
        for (const [athId, drawNum] of simulatedDrawMap.entries()) {
            if (drawNum !== null) {
                const existingOwnerId = usedBallOwner.get(drawNum);
                if (existingOwnerId && existingOwnerId !== athId) {
                    const ownerName = athleteById.get(existingOwnerId)?.name || existingOwnerId;
                    const conflictName = athleteById.get(athId)?.name || athId;
                    throw new errorHandler_1.AppError(409, `Nomor undian #${drawNum} duplikat antara "${ownerName}" dan "${conflictName}" pada divisi ini.`);
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
        const sharedAthletes = latestAthletes.map((a) => (0, bracketService_1.mapPrismaAthleteToShared)(a, division));
        const validation = (0, uwwManualDraw_1.validateManualDraw)(sharedAthletes);
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
}));
/**
 * POST /api/divisions/:id/bracket/generate
 * Mengunci is_draw_locked = true, menjalankan shared/engine/uwwBracketEngine.ts,
 * dan menyimpan seluruh node bouts beserta next_win_bout_id / next_lose_bout_id
 * dalam satu prisma.$transaction. Menolak dengan 409 Conflict jika sudah ada partai
 * berstatus IN_PROGRESS atau COMPLETED.
 */
router.post('/divisions/:id/bracket/generate', (0, validate_1.validateBody)(generateBracketSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const divisionId = req.params.id;
    const { separateSameRegion, format } = req.body;
    await (0, bracketService_1.generateDivisionBracketInTx)(divisionId, {
        separateSameRegion,
        format,
    });
    const bracketData = await (0, bracketService_1.getDivisionBracketWithStandings)(divisionId);
    res.status(201).json(bracketData);
}));
/**
 * POST /api/divisions/:id/bracket/unlock
 * Membuka kunci & menghapus bagan divisi (hanya diizinkan jika belum ada partai selesai,
 * atau dengan flag force: true).
 */
router.post('/divisions/:id/bracket/unlock', (0, validate_1.validateBody)(unlockBracketSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const divisionId = req.params.id;
    const { force } = req.body;
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        const division = await tx.division.findUnique({
            where: { id: divisionId },
            include: { bouts: true },
        });
        if (!division) {
            throw new errorHandler_1.AppError(404, 'Divisi pertandingan tidak ditemukan.');
        }
        const activeOrCompleted = division.bouts.filter((b) => b.status === 'IN_PROGRESS' || b.status === 'COMPLETED');
        if (activeOrCompleted.length > 0 && !force) {
            throw new errorHandler_1.AppError(409, 'Tidak dapat membuka kunci bagan karena sudah ada partai yang sedang berjalan atau selesai. Kirim { "force": true } jika ingin mereset paksa.');
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
}));
/**
 * GET /api/divisions/:id/bracket
 * Mengembalikan daftar bouts lengkap dengan data atlet serta hasil kalkulasi klasemen (StandingRow[]).
 */
router.get('/divisions/:id/bracket', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const divisionId = req.params.id;
    const bracketData = await (0, bracketService_1.getDivisionBracketWithStandings)(divisionId);
    res.json(bracketData);
}));
exports.default = router;
