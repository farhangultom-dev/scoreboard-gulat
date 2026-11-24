"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/config/prisma");
const uwwDrawEngine_1 = require("../../shared/engine/uwwDrawEngine");
const uwwBracketEngine_1 = require("../../shared/engine/uwwBracketEngine");
async function main() {
    console.log('🌱 Memulai proses seeding data turnamen lokal UWW...');
    await (0, prisma_1.verifyDatabaseConnection)();
    // Bersihkan turnamen contoh lama jika ada dengan nama yang sama
    await prisma_1.prisma.tournament.deleteMany({
        where: {
            name: 'Kejurnas Gulat UWW Lokal 2026',
        },
    });
    // 1. Buat Turnamen Contoh
    const tournament = await prisma_1.prisma.tournament.create({
        data: {
            name: 'Kejurnas Gulat UWW Lokal 2026',
            location: 'GOR Pajajaran Bandung',
            eventDate: new Date('2026-11-21T08:00:00.000Z'),
            status: 'ACTIVE',
        },
    });
    console.log(`✅ Turnamen dibuat: ${tournament.name} (${tournament.id})`);
    // =========================================================================
    // 2. Divisi 1: FS 74 KG SENIOR (11 Atlet -> ELIMINATION_REPECHAGE)
    // =========================================================================
    const divFs74 = await prisma_1.prisma.division.create({
        data: {
            tournamentId: tournament.id,
            style: 'FS',
            ageCategory: 'SENIOR',
            weightClass: '74 KG',
            format: 'ELIMINATION_REPECHAGE',
            assignedMat: 'MAT A',
            isDrawLocked: true,
        },
    });
    const fs74RawAthletes = [
        { name: 'Ahmad Pratama', region: 'Jawa Barat', regionCode: 'JBR', seed: 1 },
        { name: 'Rizky Saputra', region: 'Jawa Timur', regionCode: 'JTM', seed: 2 },
        { name: 'Budi Santoso', region: 'DKI Jakarta', regionCode: 'DKI', seed: 3 },
        { name: 'Dedi Kurniawan', region: 'Lampung', regionCode: 'LPG', seed: 4 },
        { name: 'Eko Wijaya', region: 'Jawa Tengah', regionCode: 'JTG' },
        { name: 'Fajar Hidayat', region: 'Sumatera Utara', regionCode: 'SMU' },
        { name: 'Gilang Ramadhan', region: 'Kalimantan Timur', regionCode: 'KTM' },
        { name: 'Hendra Gunawan', region: 'Banten', regionCode: 'BTN' },
        { name: 'Ilham Jaya', region: 'Sulawesi Selatan', regionCode: 'SLS' },
        { name: 'Joko Susilo', region: 'DI Yogyakarta', regionCode: 'DIY' },
        { name: 'Kurnia Sandi', region: 'Sumatera Barat', regionCode: 'SMB' },
    ];
    const createdFs74Athletes = [];
    for (const raw of fs74RawAthletes) {
        const dbAth = await prisma_1.prisma.athlete.create({
            data: {
                tournamentId: tournament.id,
                divisionId: divFs74.id,
                name: raw.name,
                region: raw.region,
                regionCode: raw.regionCode,
                seed: raw.seed ?? null,
            },
        });
        createdFs74Athletes.push({
            id: dbAth.id,
            name: dbAth.name,
            region: dbAth.region,
            regionCode: dbAth.regionCode,
            style: 'FS',
            ageCategory: 'SENIOR',
            weightClass: '74 KG',
            seed: dbAth.seed ?? undefined,
        });
    }
    // Jalankan pengundian resmi UWW
    const drawnFs74 = (0, uwwDrawEngine_1.generateOfficialDraw)(createdFs74Athletes, {
        separateSameRegion: true,
    });
    for (const ath of drawnFs74) {
        await prisma_1.prisma.athlete.update({
            where: { id: ath.id },
            data: { drawNumber: ath.drawNumber ?? null },
        });
    }
    const fs74DivObj = {
        id: divFs74.id,
        style: 'FS',
        ageCategory: 'SENIOR',
        weightClass: '74 KG',
        athleteIds: drawnFs74.map((a) => a.id),
        format: 'ELIMINATION_REPECHAGE',
        assignedMat: 'MAT A',
        isDrawLocked: true,
    };
    const fs74Bouts = (0, uwwBracketEngine_1.generateDivisionBouts)(fs74DivObj, drawnFs74);
    // =========================================================================
    // 3. Divisi 2: GR 77 KG SENIOR (4 Atlet -> NORDIC)
    // =========================================================================
    const divGr77 = await prisma_1.prisma.division.create({
        data: {
            tournamentId: tournament.id,
            style: 'GR',
            ageCategory: 'SENIOR',
            weightClass: '77 KG',
            format: 'NORDIC',
            assignedMat: 'MAT B',
            isDrawLocked: true,
        },
    });
    const gr77RawAthletes = [
        { name: 'Lukman Hakim', region: 'Jawa Timur', regionCode: 'JTM', seed: 1 },
        { name: 'Muhammad Ridwan', region: 'Jawa Barat', regionCode: 'JBR', seed: 2 },
        { name: 'Nanda Putra', region: 'Kalimantan Selatan', regionCode: 'KLS' },
        { name: 'Oki Setiawan', region: 'Bali', regionCode: 'BLI' },
    ];
    const createdGr77Athletes = [];
    for (const raw of gr77RawAthletes) {
        const dbAth = await prisma_1.prisma.athlete.create({
            data: {
                tournamentId: tournament.id,
                divisionId: divGr77.id,
                name: raw.name,
                region: raw.region,
                regionCode: raw.regionCode,
                seed: raw.seed ?? null,
            },
        });
        createdGr77Athletes.push({
            id: dbAth.id,
            name: dbAth.name,
            region: dbAth.region,
            regionCode: dbAth.regionCode,
            style: 'GR',
            ageCategory: 'SENIOR',
            weightClass: '77 KG',
            seed: dbAth.seed ?? undefined,
        });
    }
    const drawnGr77 = (0, uwwDrawEngine_1.generateOfficialDraw)(createdGr77Athletes, {
        separateSameRegion: true,
    });
    for (const ath of drawnGr77) {
        await prisma_1.prisma.athlete.update({
            where: { id: ath.id },
            data: { drawNumber: ath.drawNumber ?? null },
        });
    }
    const gr77DivObj = {
        id: divGr77.id,
        style: 'GR',
        ageCategory: 'SENIOR',
        weightClass: '77 KG',
        athleteIds: drawnGr77.map((a) => a.id),
        format: 'NORDIC',
        assignedMat: 'MAT B',
        isDrawLocked: true,
    };
    const gr77Bouts = (0, uwwBracketEngine_1.generateDivisionBouts)(gr77DivObj, drawnGr77);
    // Simpan seluruh bouts dengan UUID baru yang terpetakan dari ID logis bagan
    const allGeneratedBouts = [...fs74Bouts, ...gr77Bouts];
    const idMap = new Map();
    const { randomUUID } = await Promise.resolve().then(() => __importStar(require('node:crypto')));
    for (const b of allGeneratedBouts) {
        idMap.set(b.id, randomUUID());
    }
    // Pass 1: Insert seluruh bout tanpa self-FK (nextWinBoutId / nextLoseBoutId) dulu
    let boutNo = 1;
    for (const b of allGeneratedBouts) {
        const dbBoutId = idMap.get(b.id);
        await prisma_1.prisma.bout.create({
            data: {
                id: dbBoutId,
                tournamentId: tournament.id,
                divisionId: b.divisionId,
                boutNumber: boutNo++,
                matName: b.matName,
                round: b.round,
                roundOrder: b.roundOrder,
                bracketPosition: b.bracketPosition,
                bracketSide: b.bracketSide ?? null,
                redAthleteId: b.redAthleteId,
                blueAthleteId: b.blueAthleteId,
                redSourceLabel: b.redSourceLabel ?? null,
                blueSourceLabel: b.blueSourceLabel ?? null,
                status: b.status,
            },
        });
    }
    // Pass 2: Hubungkan nextWinBoutId dan nextLoseBoutId
    for (const b of allGeneratedBouts) {
        if (b.nextWinBoutId || b.nextLoseBoutId) {
            const dbBoutId = idMap.get(b.id);
            await prisma_1.prisma.bout.update({
                where: { id: dbBoutId },
                data: {
                    nextWinBoutId: b.nextWinBoutId ? idMap.get(b.nextWinBoutId) ?? null : null,
                    nextWinSlot: b.nextWinSlot ?? null,
                    nextLoseBoutId: b.nextLoseBoutId ? idMap.get(b.nextLoseBoutId) ?? null : null,
                    nextLoseSlot: b.nextLoseSlot ?? null,
                },
            });
        }
    }
    console.log(`✅ Divisi 1: FS 74 KG SENIOR (${drawnFs74.length} atlet, ${fs74Bouts.length} partai)`);
    console.log(`✅ Divisi 2: GR 77 KG SENIOR (${drawnGr77.length} atlet, ${gr77Bouts.length} partai)`);
    console.log('🎉 Seeding database uww_scoreboard selesai!');
}
main()
    .catch((e) => {
    console.error('❌ Gagal menjalankan seed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});
