"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../config/prisma");
const errorHandler_1 = require("../middlewares/errorHandler");
const validate_1 = require("../middlewares/validate");
const uwwBracketEngine_1 = require("../../../shared/engine/uwwBracketEngine");
const router = (0, express_1.Router)();
/**
 * Helper normalisasi kelas berat ke format standar "<angka> KG".
 */
function normalizeWeightClass(raw) {
    const trimmed = raw.trim().toUpperCase();
    const match = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (match) {
        return `${match[1]} KG`;
    }
    return trimmed;
}
/**
 * Helper normalisasi kode daerah kontingen (maksimal 5 huruf uppercase).
 */
function normalizeRegionCode(region, code) {
    if (code && code.trim()) {
        return code.trim().toUpperCase().slice(0, 10);
    }
    const clean = region.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (clean.slice(0, 3) || 'INA').toUpperCase();
}
const athleteInputSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'Nama atlet wajib diisi'),
    region: zod_1.z.string().trim().min(1, 'Daerah asal / kontingen wajib diisi'),
    regionCode: zod_1.z.string().trim().max(20).optional().nullable(),
    style: zod_1.z.enum(['FS', 'WW', 'GR'], {
        errorMap: () => ({ message: 'Gaya gulat (style) harus FS, WW, atau GR' }),
    }),
    ageCategory: zod_1.z.enum(['SENIOR', 'U23', 'U20', 'U17', 'U15'], {
        errorMap: () => ({
            message: 'Kategori umur (ageCategory) harus SENIOR, U23, U20, U17, atau U15',
        }),
    }),
    weightClass: zod_1.z.string().trim().min(1, 'Kelas berat (weightClass) wajib diisi'),
    seed: zod_1.z.number().int().min(1).max(4).optional().nullable(),
    drawNumber: zod_1.z.number().int().min(1).optional().nullable(),
});
const bulkAthletesSchema = zod_1.z.object({
    mode: zod_1.z.enum(['MERGE', 'REPLACE']).default('MERGE'),
    athletes: zod_1.z
        .array(athleteInputSchema)
        .min(1, 'Daftar atlet pada bulk import tidak boleh kosong'),
});
const createSingleAthleteSchema = athleteInputSchema.extend({
    tournamentId: zod_1.z.string().trim().min(1, 'tournamentId wajib diisi'),
});
const updateSingleAthleteSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).optional(),
    region: zod_1.z.string().trim().min(1).optional(),
    regionCode: zod_1.z.string().trim().min(1).max(20).optional(),
    style: zod_1.z.enum(['FS', 'WW', 'GR']).optional(),
    ageCategory: zod_1.z.enum(['SENIOR', 'U23', 'U20', 'U17', 'U15']).optional(),
    weightClass: zod_1.z.string().trim().min(1).optional(),
    seed: zod_1.z.number().int().min(1).max(4).optional().nullable(),
    drawNumber: zod_1.z.number().int().min(1).optional().nullable(),
});
/**
 * POST /api/tournaments/:id/athletes/bulk
 * Bulk import atlet transaksional (MERGE atau REPLACE) dengan auto-upsert divisions
 * dan deteksi format bagan resmi UWW otomatis.
 */
router.post('/tournaments/:id/athletes/bulk', (0, validate_1.validateBody)(bulkAthletesSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const tournamentId = req.params.id;
    const { mode, athletes } = req.body;
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        const tournament = await tx.tournament.findUnique({
            where: { id: tournamentId },
        });
        if (!tournament) {
            throw new errorHandler_1.AppError(404, 'Turnamen tidak ditemukan.');
        }
        if (mode === 'REPLACE') {
            const activeOrCompletedCount = await tx.bout.count({
                where: {
                    tournamentId,
                    status: { in: ['IN_PROGRESS', 'COMPLETED'] },
                },
            });
            if (activeOrCompletedCount > 0) {
                throw new errorHandler_1.AppError(409, 'Tidak dapat melakukan REPLACE karena sudah ada partai yang sedang berjalan (IN_PROGRESS) atau telah selesai (COMPLETED).');
            }
            await tx.bout.deleteMany({ where: { tournamentId } });
            await tx.athlete.deleteMany({ where: { tournamentId } });
            await tx.division.deleteMany({ where: { tournamentId } });
        }
        // Normalisasi input atlet & kumpulkan daftar divisi unik
        const normalizedAthletes = athletes.map((a) => {
            const weightClass = normalizeWeightClass(a.weightClass);
            const regionCode = normalizeRegionCode(a.region, a.regionCode);
            const divKey = `${a.style}__${a.ageCategory}__${weightClass}`;
            return {
                ...a,
                weightClass,
                regionCode,
                divKey,
            };
        });
        const uniqueDivMap = new Map();
        for (const a of normalizedAthletes) {
            if (!uniqueDivMap.has(a.divKey)) {
                uniqueDivMap.set(a.divKey, {
                    style: a.style,
                    ageCategory: a.ageCategory,
                    weightClass: a.weightClass,
                });
            }
        }
        // Ambil divisi yang sudah ada untuk turnamen ini
        const existingDivisions = await tx.division.findMany({
            where: { tournamentId },
        });
        const divisionIdByKey = new Map();
        for (const div of existingDivisions) {
            const key = `${div.style}__${div.ageCategory}__${div.weightClass}`;
            divisionIdByKey.set(key, { id: div.id, isDrawLocked: div.isDrawLocked });
        }
        // Buat divisi baru yang belum ada secara batch
        const newDivisionsToCreate = [];
        for (const [key, meta] of uniqueDivMap.entries()) {
            if (!divisionIdByKey.has(key)) {
                const newId = (0, node_crypto_1.randomUUID)();
                divisionIdByKey.set(key, { id: newId, isDrawLocked: false });
                newDivisionsToCreate.push({
                    id: newId,
                    tournamentId,
                    style: meta.style,
                    ageCategory: meta.ageCategory,
                    weightClass: meta.weightClass,
                    format: 'SINGLE_BOUT',
                    assignedMat: 'MAT A',
                    isDrawLocked: false,
                });
            }
        }
        if (newDivisionsToCreate.length > 0) {
            await tx.division.createMany({
                data: newDivisionsToCreate,
            });
        }
        // Validasi anti-duplikat drawNumber per divisi sebelum insert massal
        const seenDrawsByDivKey = new Map();
        if (mode === 'MERGE' && existingDivisions.length > 0) {
            const existingWithDraws = await tx.athlete.findMany({
                where: {
                    tournamentId,
                    drawNumber: { not: null },
                },
                select: {
                    divisionId: true,
                    name: true,
                    drawNumber: true,
                },
            });
            const divKeyById = new Map();
            for (const [k, info] of divisionIdByKey.entries()) {
                divKeyById.set(info.id, k);
            }
            for (const ex of existingWithDraws) {
                const dk = divKeyById.get(ex.divisionId);
                if (dk && ex.drawNumber !== null) {
                    const mapForDiv = seenDrawsByDivKey.get(dk) || new Map();
                    mapForDiv.set(ex.drawNumber, ex.name);
                    seenDrawsByDivKey.set(dk, mapForDiv);
                }
            }
        }
        for (const a of normalizedAthletes) {
            if (a.drawNumber !== undefined && a.drawNumber !== null) {
                const mapForDiv = seenDrawsByDivKey.get(a.divKey) || new Map();
                const prevHolder = mapForDiv.get(a.drawNumber);
                if (prevHolder) {
                    throw new errorHandler_1.AppError(409, `Nomor undian #${a.drawNumber} duplikat pada kelas ${a.style} ${a.ageCategory} ${a.weightClass} antara "${prevHolder}" dan "${a.name}".`);
                }
                mapForDiv.set(a.drawNumber, a.name);
                seenDrawsByDivKey.set(a.divKey, mapForDiv);
            }
        }
        // Insert seluruh atlet sekaligus dengan createMany
        const athleteRows = normalizedAthletes.map((a) => {
            const divInfo = divisionIdByKey.get(a.divKey);
            return {
                id: (0, node_crypto_1.randomUUID)(),
                tournamentId,
                divisionId: divInfo.id,
                name: a.name,
                region: a.region,
                regionCode: a.regionCode,
                seed: a.seed ?? null,
                drawNumber: a.drawNumber ?? null,
            };
        });
        await tx.athlete.createMany({
            data: athleteRows,
        });
        // Hitung jumlah atlet per divisi yang terdampak dan perbarui format otomatis (jika belum dikunci)
        const affectedDivisionIds = Array.from(new Set(Array.from(uniqueDivMap.keys()).map((k) => divisionIdByKey.get(k).id)));
        const divisionCounts = await tx.athlete.groupBy({
            by: ['divisionId'],
            where: {
                divisionId: { in: affectedDivisionIds },
            },
            _count: {
                _all: true,
            },
        });
        for (const grp of divisionCounts) {
            const divEntry = Array.from(divisionIdByKey.values()).find((d) => d.id === grp.divisionId);
            if (divEntry && !divEntry.isDrawLocked) {
                const recommendedFormat = (0, uwwBracketEngine_1.detectRecommendedFormat)(grp._count._all);
                await tx.division.update({
                    where: { id: grp.divisionId },
                    data: { format: recommendedFormat },
                });
            }
        }
        return {
            mode,
            importedCount: athleteRows.length,
            divisionsAffected: affectedDivisionIds.length,
        };
    });
    res.status(201).json(result);
}));
/**
 * POST /api/athletes
 * Tambah atlet satuan saat weigh-in (otomatis upsert divisi & update format jika belum dikunci).
 */
router.post('/athletes', (0, validate_1.validateBody)(createSingleAthleteSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const data = req.body;
    const weightClass = normalizeWeightClass(data.weightClass);
    const regionCode = normalizeRegionCode(data.region, data.regionCode);
    const createdAthlete = await prisma_1.prisma.$transaction(async (tx) => {
        const tournament = await tx.tournament.findUnique({
            where: { id: data.tournamentId },
        });
        if (!tournament) {
            throw new errorHandler_1.AppError(404, 'Turnamen tidak ditemukan.');
        }
        const division = await tx.division.upsert({
            where: {
                tournamentId_style_ageCategory_weightClass: {
                    tournamentId: data.tournamentId,
                    style: data.style,
                    ageCategory: data.ageCategory,
                    weightClass,
                },
            },
            update: {},
            create: {
                tournamentId: data.tournamentId,
                style: data.style,
                ageCategory: data.ageCategory,
                weightClass,
                format: 'SINGLE_BOUT',
                assignedMat: 'MAT A',
                isDrawLocked: false,
            },
        });
        const athlete = await tx.athlete.create({
            data: {
                tournamentId: data.tournamentId,
                divisionId: division.id,
                name: data.name,
                region: data.region,
                regionCode,
                seed: data.seed ?? null,
                drawNumber: data.drawNumber ?? null,
            },
        });
        if (!division.isDrawLocked) {
            const count = await tx.athlete.count({
                where: { divisionId: division.id },
            });
            await tx.division.update({
                where: { id: division.id },
                data: { format: (0, uwwBracketEngine_1.detectRecommendedFormat)(count) },
            });
        }
        return athlete;
    });
    res.status(201).json({ athlete: createdAthlete });
}));
/**
 * PATCH /api/athletes/:id
 * Koreksi atlet satuan saat weigh-in (otomatis memperbarui divisi & format jika belum dikunci).
 */
router.patch('/athletes/:id', (0, validate_1.validateBody)(updateSingleAthleteSchema), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const athleteId = req.params.id;
    const updates = req.body;
    const updatedAthlete = await prisma_1.prisma.$transaction(async (tx) => {
        const existing = await tx.athlete.findUnique({
            where: { id: athleteId },
            include: { division: true },
        });
        if (!existing) {
            throw new errorHandler_1.AppError(404, 'Atlet tidak ditemukan.');
        }
        const nextStyle = updates.style ?? existing.division.style;
        const nextAge = updates.ageCategory ?? existing.division.ageCategory;
        const nextWeight = updates.weightClass
            ? normalizeWeightClass(updates.weightClass)
            : existing.division.weightClass;
        const isChangingDivision = nextStyle !== existing.division.style ||
            nextAge !== existing.division.ageCategory ||
            nextWeight !== existing.division.weightClass;
        if (isChangingDivision && existing.division.isDrawLocked) {
            throw new errorHandler_1.AppError(409, 'Tidak dapat memindahkan kelas atlet karena undian pada divisi asal sudah dikunci.');
        }
        let targetDivisionId = existing.divisionId;
        let targetDivisionLocked = existing.division.isDrawLocked;
        if (isChangingDivision) {
            const targetDivision = await tx.division.upsert({
                where: {
                    tournamentId_style_ageCategory_weightClass: {
                        tournamentId: existing.tournamentId,
                        style: nextStyle,
                        ageCategory: nextAge,
                        weightClass: nextWeight,
                    },
                },
                update: {},
                create: {
                    tournamentId: existing.tournamentId,
                    style: nextStyle,
                    ageCategory: nextAge,
                    weightClass: nextWeight,
                    format: 'SINGLE_BOUT',
                    assignedMat: existing.division.assignedMat || 'MAT A',
                    isDrawLocked: false,
                },
            });
            if (targetDivision.isDrawLocked) {
                throw new errorHandler_1.AppError(409, 'Tidak dapat memindahkan atlet ke divisi tujuan yang undiannya sudah dikunci.');
            }
            targetDivisionId = targetDivision.id;
            targetDivisionLocked = targetDivision.isDrawLocked;
        }
        const nextRegion = updates.region ?? existing.region;
        const nextRegionCode = updates.regionCode !== undefined
            ? normalizeRegionCode(nextRegion, updates.regionCode)
            : updates.region
                ? normalizeRegionCode(updates.region, existing.regionCode)
                : existing.regionCode;
        const athlete = await tx.athlete.update({
            where: { id: athleteId },
            data: {
                divisionId: targetDivisionId,
                name: updates.name ?? existing.name,
                region: nextRegion,
                regionCode: nextRegionCode,
                seed: updates.seed !== undefined ? updates.seed : existing.seed,
                drawNumber: updates.drawNumber !== undefined ? updates.drawNumber : existing.drawNumber,
            },
        });
        if (isChangingDivision) {
            // Perbarui format divisi asal & tujuan
            if (!existing.division.isDrawLocked) {
                const oldCount = await tx.athlete.count({
                    where: { divisionId: existing.divisionId },
                });
                await tx.division.update({
                    where: { id: existing.divisionId },
                    data: { format: (0, uwwBracketEngine_1.detectRecommendedFormat)(oldCount) },
                });
            }
            if (!targetDivisionLocked) {
                const newCount = await tx.athlete.count({
                    where: { divisionId: targetDivisionId },
                });
                await tx.division.update({
                    where: { id: targetDivisionId },
                    data: { format: (0, uwwBracketEngine_1.detectRecommendedFormat)(newCount) },
                });
            }
        }
        return athlete;
    });
    res.json({ athlete: updatedAthlete });
}));
/**
 * DELETE /api/athletes/:id
 * Hapus atlet satuan (otomatis memperbarui format divisi jika undian belum dikunci).
 */
router.delete('/athletes/:id', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const athleteId = req.params.id;
    await prisma_1.prisma.$transaction(async (tx) => {
        const existing = await tx.athlete.findUnique({
            where: { id: athleteId },
            include: { division: true },
        });
        if (!existing) {
            throw new errorHandler_1.AppError(404, 'Atlet tidak ditemukan.');
        }
        if (existing.division.isDrawLocked) {
            throw new errorHandler_1.AppError(409, 'Tidak dapat menghapus atlet karena undian/bagan pada divisi ini sudah dikunci.');
        }
        await tx.athlete.delete({
            where: { id: athleteId },
        });
        const remainingCount = await tx.athlete.count({
            where: { divisionId: existing.divisionId },
        });
        await tx.division.update({
            where: { id: existing.divisionId },
            data: { format: (0, uwwBracketEngine_1.detectRecommendedFormat)(remainingCount) },
        });
    });
    res.json({ deleted: true, id: athleteId });
}));
exports.default = router;
