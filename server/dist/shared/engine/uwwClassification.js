"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClassificationPoints = getClassificationPoints;
exports.calculateNordicStandings = calculateNordicStandings;
/**
 * Menghitung UWW Official Classification Points untuk pemenang dan yang kalah
 * berdasarkan jenis kemenangan (VictoryType).
 *
 * Aturan Resmi UWW (0.3):
 * - VFA (Fall), VIN (Injury), VFO (Forfeit), DSQ (Disqualification) -> Pemenang: 5, Kalah: 0
 * - VSU (Technical Superiority, lawan 0 poin) -> Pemenang: 4, Kalah: 0
 * - VSU1 (Technical Superiority, lawan >= 1 poin) -> Pemenang: 4, Kalah: 1
 * - VPO (Points, lawan 0 poin) -> Pemenang: 3, Kalah: 0
 * - VPO1 (Points, lawan >= 1 poin) -> Pemenang: 3, Kalah: 1
 */
function getClassificationPoints(victoryType) {
    switch (victoryType) {
        case 'VFA':
        case 'VIN':
        case 'VFO':
        case 'DSQ':
            return { winner: 5, loser: 0 };
        case 'VSU':
            return { winner: 4, loser: 0 };
        case 'VSU1':
            return { winner: 4, loser: 1 };
        case 'VPO':
            return { winner: 3, loser: 0 };
        case 'VPO1':
            return { winner: 3, loser: 1 };
        default:
            return { winner: 0, loser: 0 };
    }
}
/**
 * Menghitung klasemen resmi UWW untuk format Nordic (Round-Robin) atau Pool Group
 * dengan 6 kriteria tie-breaker resmi UWW:
 * 1. Total Classification Points tertinggi.
 * 2. Head-to-Head (jika tepat 2 atlet memiliki poin klasifikasi yang sama).
 * 3. Jumlah kemenangan VFA (Fall) terbanyak.
 * 4. Jumlah kemenangan VSU / VSU1 terbanyak.
 * 5. Total Technical Points Scored terbanyak.
 * 6. Total Technical Points Conceded paling sedikit.
 */
function calculateNordicStandings(athleteIds, bouts) {
    // Inisialisasi map data statistik per atlet
    const statsMap = new Map();
    athleteIds.forEach((id) => {
        statsMap.set(id, {
            athleteId: id,
            rank: 1,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            classificationPoints: 0,
            vfaCount: 0,
            vsuCount: 0,
            technicalPointsFor: 0,
            technicalPointsAgainst: 0,
        });
    });
    // Agregasi hasil seluruh pertandingan yang telah selesai (COMPLETED)
    bouts.forEach((bout) => {
        if (bout.status !== 'COMPLETED' || !bout.result)
            return;
        const { redAthleteId, blueAthleteId, result } = bout;
        if (!redAthleteId || !blueAthleteId)
            return;
        const redStats = statsMap.get(redAthleteId);
        const blueStats = statsMap.get(blueAthleteId);
        if (redStats) {
            redStats.matchesPlayed += 1;
            redStats.classificationPoints += result.redClassificationPts;
            redStats.technicalPointsFor += result.redScore;
            redStats.technicalPointsAgainst += result.blueScore;
            if (result.winnerAthleteId === redAthleteId) {
                redStats.wins += 1;
                if (result.victoryType === 'VFA')
                    redStats.vfaCount += 1;
                if (result.victoryType === 'VSU' || result.victoryType === 'VSU1') {
                    redStats.vsuCount += 1;
                }
            }
            else {
                redStats.losses = (redStats.losses || 0) + 1;
            }
        }
        if (blueStats) {
            blueStats.matchesPlayed += 1;
            blueStats.classificationPoints += result.blueClassificationPts;
            blueStats.technicalPointsFor += result.blueScore;
            blueStats.technicalPointsAgainst += result.redScore;
            if (result.winnerAthleteId === blueAthleteId) {
                blueStats.wins += 1;
                if (result.victoryType === 'VFA')
                    blueStats.vfaCount += 1;
                if (result.victoryType === 'VSU' || result.victoryType === 'VSU1') {
                    blueStats.vsuCount += 1;
                }
            }
            else {
                blueStats.losses = (blueStats.losses || 0) + 1;
            }
        }
    });
    const standingList = Array.from(statsMap.values());
    // Helper untuk mencari pemenang Head-to-Head antara tepat dua atlet
    const getHeadToHeadWinner = (athA, athB) => {
        const directBout = bouts.find((b) => b.status === 'COMPLETED' &&
            b.result &&
            ((b.redAthleteId === athA && b.blueAthleteId === athB) ||
                (b.redAthleteId === athB && b.blueAthleteId === athA)));
        if (!directBout || !directBout.result)
            return null;
        return directBout.result.winnerAthleteId;
    };
    // Pengurutan tie-breaker bertingkat
    standingList.sort((a, b) => {
        // 1. Classification Points tertinggi
        if (b.classificationPoints !== a.classificationPoints) {
            return b.classificationPoints - a.classificationPoints;
        }
        // 2. Head-to-Head (jika tepat 2 atlet memiliki poin sama dalam grup kompetisi)
        const athletesWithSamePoints = standingList.filter((s) => s.classificationPoints === a.classificationPoints);
        if (athletesWithSamePoints.length === 2) {
            const h2hWinner = getHeadToHeadWinner(a.athleteId, b.athleteId);
            if (h2hWinner === a.athleteId)
                return -1;
            if (h2hWinner === b.athleteId)
                return 1;
        }
        // 3. Jumlah kemenangan VFA (Fall) terbanyak
        if (b.vfaCount !== a.vfaCount) {
            return b.vfaCount - a.vfaCount;
        }
        // 4. Jumlah kemenangan VSU / VSU1 terbanyak
        if (b.vsuCount !== a.vsuCount) {
            return b.vsuCount - a.vsuCount;
        }
        // 5. Total Technical Points Scored terbanyak
        if (b.technicalPointsFor !== a.technicalPointsFor) {
            return b.technicalPointsFor - a.technicalPointsFor;
        }
        // 6. Total Technical Points Conceded paling sedikit
        if (a.technicalPointsAgainst !== b.technicalPointsAgainst) {
            return a.technicalPointsAgainst - b.technicalPointsAgainst;
        }
        // Fallback stabil
        return a.athleteId.localeCompare(b.athleteId);
    });
    // Berikan peringkat 1..N
    return standingList.map((item, idx) => ({
        ...item,
        rank: idx + 1,
    }));
}
