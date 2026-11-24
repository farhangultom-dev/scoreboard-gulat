"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBallSlotMetadata = getBallSlotMetadata;
exports.validateManualDraw = validateManualDraw;
exports.buildDraftBracketPreview = buildDraftBracketPreview;
const uwwBracketEngine_1 = require("./uwwBracketEngine");
const DRAFT_PLACEHOLDER_PREFIX = '__DRAFT_BALL_PLACEHOLDER__';
/**
 * Menghasilkan metadata posisi bagan resmi UWW untuk seluruh nomor bola fisik 1..N.
 * Mengikuti aturan pemetaan domain Bagian 0 pada PLAN-MANUAL-DRAW.md:
 * 1. SINGLE_BOUT (N = 2): #1 RED, #2 BLUE (MAIN)
 * 2. NORDIC (N = 3..5): Seluruh bola #1..#N berlabel NORDIC
 * 3. GROUP_CROSS (N = 6..7): #1..#ceil(N/2) -> POOL A, sisanya -> POOL B
 * 4. ELIMINATION_REPECHAGE (N >= 8):
 *    - B = 2^floor(log2(N)), Q = N - B
 *    - Jika Q = 0 (N = 8, 16, 32): Seluruh bola #1..#N berlabel MAIN
 *    - Jika Q > 0: Bola #1..#(B - Q) berlabel BYE, Bola #(B - Q + 1)..#N berlabel QUAL
 */
function getBallSlotMetadata(totalAthletes, format) {
    if (totalAthletes <= 0) {
        return [];
    }
    if (totalAthletes === 1) {
        return [
            {
                ballNumber: 1,
                zone: 'MAIN',
                zoneLabel: 'MAIN',
                slotDescription: 'Peserta Tunggal (Slot #1)',
            },
        ];
    }
    const effectiveFormat = format ?? (0, uwwBracketEngine_1.detectRecommendedFormat)(totalAthletes);
    // 1. SINGLE BOUT (N = 2)
    if (effectiveFormat === 'SINGLE_BOUT' || totalAthletes === 2) {
        return Array.from({ length: totalAthletes }, (_, idx) => {
            const ballNumber = idx + 1;
            const cornerLabel = ballNumber === 1 ? 'Sudut Merah / RED' : 'Sudut Biru / BLUE';
            return {
                ballNumber,
                zone: 'MAIN',
                zoneLabel: 'MAIN',
                slotDescription: `Final Langsung (${cornerLabel})`,
            };
        });
    }
    // 2. NORDIC / ROUND-ROBIN PENUH (N = 3..5)
    if (effectiveFormat === 'NORDIC' || (totalAthletes >= 3 && totalAthletes <= 5)) {
        return Array.from({ length: totalAthletes }, (_, idx) => {
            const ballNumber = idx + 1;
            return {
                ballNumber,
                zone: 'NORDIC',
                zoneLabel: 'NORDIC',
                slotDescription: `Nordic Round-Robin (Undian #${ballNumber})`,
            };
        });
    }
    // 3. 2-POOL GROUP + CROSS SEMIFINAL (N = 6..7)
    if (effectiveFormat === 'GROUP_CROSS' ||
        totalAthletes === 6 ||
        totalAthletes === 7) {
        const poolASize = Math.ceil(totalAthletes / 2);
        return Array.from({ length: totalAthletes }, (_, idx) => {
            const ballNumber = idx + 1;
            if (ballNumber <= poolASize) {
                return {
                    ballNumber,
                    zone: 'POOL_A',
                    zoneLabel: 'POOL A',
                    slotDescription: `Grup Pool A (Slot #${ballNumber})`,
                };
            }
            const poolBSlot = ballNumber - poolASize;
            return {
                ballNumber,
                zone: 'POOL_B',
                zoneLabel: 'POOL B',
                slotDescription: `Grup Pool B (Slot #${poolBSlot})`,
            };
        });
    }
    // 4. DIRECT ELIMINATION + SINGLE REPECHAGE (N >= 8)
    const b = Math.pow(2, Math.floor(Math.log2(totalAthletes)));
    const q = totalAthletes - b;
    const mainRoundLabel = b === 8
        ? 'Perempat Final'
        : b === 16
            ? 'Babak 16 Besar'
            : 'Babak 32 Besar';
    // Jika Q = 0 (N = 8, 16, 32): tidak ada BYE dan tidak ada Qualification
    if (q === 0) {
        return Array.from({ length: totalAthletes }, (_, idx) => {
            const ballNumber = idx + 1;
            const boutNum = Math.ceil(ballNumber / 2);
            const corner = ballNumber % 2 === 1 ? 'Merah' : 'Biru';
            return {
                ballNumber,
                zone: 'MAIN',
                zoneLabel: 'MAIN',
                slotDescription: `Langsung ke ${mainRoundLabel} #${boutNum} (${corner})`,
            };
        });
    }
    // Jika Q > 0: Bola #1..#(B - Q) mendapat BYE, sisanya #(B - Q + 1)..#N masuk Qualification
    const numByes = b - q; // Sama dengan 2*B - N
    return Array.from({ length: totalAthletes }, (_, idx) => {
        const ballNumber = idx + 1;
        if (ballNumber <= numByes) {
            return {
                ballNumber,
                zone: 'BYE',
                zoneLabel: 'BYE',
                slotDescription: `Langsung ke ${mainRoundLabel} (Slot #${ballNumber})`,
            };
        }
        const qualOffset = ballNumber - numByes - 1;
        const qualBoutNum = Math.floor(qualOffset / 2) + 1;
        const corner = qualOffset % 2 === 0 ? 'Merah' : 'Biru';
        return {
            ballNumber,
            zone: 'QUAL',
            zoneLabel: 'QUAL',
            slotDescription: `Kualifikasi #${qualBoutNum} (${corner})`,
        };
    });
}
/**
 * Memvalidasi kelengkapan dan keunikan nomor bola fisik (drawNumber) pada daftar atlet satu kelas:
 * - Menghitung assignedCount (atlet dengan drawNumber !== undefined && drawNumber !== null)
 * - Mendeteksi missingAthleteIds, duplicateNumbers, dan outOfRangeAthleteIds (< 1, > N, atau bukan integer)
 * - Mengembalikan daftar availableNumbers (1..N yang belum dipakai) secara terurut naik
 */
function validateManualDraw(athletes) {
    const totalAthletes = athletes.length;
    let assignedCount = 0;
    const missingAthleteIds = [];
    const outOfRangeAthleteIds = [];
    const validNumberCounts = new Map();
    for (const ath of athletes) {
        const num = ath.drawNumber;
        if (num === undefined || num === null) {
            missingAthleteIds.push(ath.id);
            continue;
        }
        assignedCount++;
        if (typeof num !== 'number' ||
            !Number.isInteger(num) ||
            num < 1 ||
            num > totalAthletes) {
            outOfRangeAthleteIds.push(ath.id);
            continue;
        }
        validNumberCounts.set(num, (validNumberCounts.get(num) ?? 0) + 1);
    }
    const duplicateNumbers = [];
    for (const [num, count] of validNumberCounts.entries()) {
        if (count > 1) {
            duplicateNumbers.push(num);
        }
    }
    duplicateNumbers.sort((a, b) => a - b);
    const availableNumbers = [];
    for (let i = 1; i <= totalAthletes; i++) {
        if (!validNumberCounts.has(i)) {
            availableNumbers.push(i);
        }
    }
    const isValid = totalAthletes >= 2 &&
        assignedCount === totalAthletes &&
        missingAthleteIds.length === 0 &&
        duplicateNumbers.length === 0 &&
        outOfRangeAthleteIds.length === 0;
    return {
        isValid,
        totalAthletes,
        assignedCount,
        missingAthleteIds,
        duplicateNumbers,
        outOfRangeAthleteIds,
        availableNumbers,
    };
}
/**
 * Membangun pratinjau bagan langsung (Live Draft Bracket Preview) meskipun sebagian nomor bola
 * fisik masih belum diisi atau sedang mengalami konflik duplikat.
 * Slot nomor bola #X yang belum memiliki pemilik sah akan dirender dengan label "Menunggu Bola #X".
 */
function buildDraftBracketPreview(division, athletes) {
    const totalAthletes = athletes.length;
    if (totalAthletes < 2) {
        return [];
    }
    const validation = validateManualDraw(athletes);
    const duplicateSet = new Set(validation.duplicateNumbers);
    // Petakan nomor bola yang sudah valid & unik ke atlet pemiliknya
    const athleteByBall = new Map();
    for (const ath of athletes) {
        const num = ath.drawNumber;
        if (typeof num === 'number' &&
            Number.isInteger(num) &&
            num >= 1 &&
            num <= totalAthletes &&
            !duplicateSet.has(num)) {
            athleteByBall.set(num, ath);
        }
    }
    // Susun daftar N atlet draft (atlet asli atau placeholder untuk slot kosong)
    const draftAthletes = [];
    for (let ball = 1; ball <= totalAthletes; ball++) {
        const assigned = athleteByBall.get(ball);
        if (assigned) {
            draftAthletes.push({
                ...assigned,
                drawNumber: ball,
            });
        }
        else {
            draftAthletes.push({
                id: `${DRAFT_PLACEHOLDER_PREFIX}${ball}`,
                name: `Menunggu Bola #${ball}`,
                region: 'MENUNGGU UNDIAN',
                regionCode: `#${ball}`,
                style: division.style,
                ageCategory: division.ageCategory,
                weightClass: division.weightClass,
                drawNumber: ball,
            });
        }
    }
    const rawBouts = (0, uwwBracketEngine_1.generateDivisionBouts)(division, draftAthletes);
    // Ubah referensi placeholder menjadi slot kosong berlabel "Menunggu Bola #X"
    return rawBouts.map((bout) => {
        let redAthleteId = bout.redAthleteId;
        let blueAthleteId = bout.blueAthleteId;
        let redSourceLabel = bout.redSourceLabel;
        let blueSourceLabel = bout.blueSourceLabel;
        if (redAthleteId && redAthleteId.startsWith(DRAFT_PLACEHOLDER_PREFIX)) {
            const ballNum = redAthleteId.replace(DRAFT_PLACEHOLDER_PREFIX, '');
            redAthleteId = null;
            redSourceLabel = `Menunggu Bola #${ballNum}`;
        }
        if (blueAthleteId && blueAthleteId.startsWith(DRAFT_PLACEHOLDER_PREFIX)) {
            const ballNum = blueAthleteId.replace(DRAFT_PLACEHOLDER_PREFIX, '');
            blueAthleteId = null;
            blueSourceLabel = `Menunggu Bola #${ballNum}`;
        }
        const status = redAthleteId && blueAthleteId ? 'SCHEDULED' : 'TBD';
        return {
            ...bout,
            redAthleteId,
            blueAthleteId,
            redSourceLabel,
            blueSourceLabel,
            status,
        };
    });
}
