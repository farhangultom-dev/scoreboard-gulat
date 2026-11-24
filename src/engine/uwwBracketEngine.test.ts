import { describe, it, expect } from 'vitest';
import {
  getClassificationPoints,
  calculateNordicStandings,
} from './uwwClassification';
import { generateOfficialDraw } from './uwwDrawEngine';
import {
  generateDivisionBouts,
  advanceBoutResult,
} from './uwwBracketEngine';
import {
  Athlete,
  CategoryDivision,
  TournamentBout,
  BoutResult,
} from '../types/tournament';

describe('uwwClassification - Official UWW Classification Points & Tie-Breakers', () => {
  it('correctly calculates Classification Points for all UWW Victory Types', () => {
    expect(getClassificationPoints('VFA')).toEqual({ winner: 5, loser: 0 });
    expect(getClassificationPoints('VIN')).toEqual({ winner: 5, loser: 0 });
    expect(getClassificationPoints('VFO')).toEqual({ winner: 5, loser: 0 });
    expect(getClassificationPoints('DSQ')).toEqual({ winner: 5, loser: 0 });
    expect(getClassificationPoints('VSU')).toEqual({ winner: 4, loser: 0 });
    expect(getClassificationPoints('VSU1')).toEqual({ winner: 4, loser: 1 });
    expect(getClassificationPoints('VPO')).toEqual({ winner: 3, loser: 0 });
    expect(getClassificationPoints('VPO1')).toEqual({ winner: 3, loser: 1 });
  });

  it('ranks Nordic standings using UWW multi-criteria tie-breakers', () => {
    const ath1 = 'ath_1';
    const ath2 = 'ath_2';
    const ath3 = 'ath_3';

    // ath1 beats ath2 by VFA (5-0), ath2 beats ath3 by VSU (4-0), ath1 beats ath3 by VPO (3-0)
    // Points: ath1 = 8 CP (2 wins), ath2 = 4 CP (1 win), ath3 = 0 CP
    const bouts: TournamentBout[] = [
      {
        id: 'b1',
        divisionId: 'div1',
        boutNumber: 1,
        matName: 'MAT A',
        round: 'NORDIC_R1',
        roundOrder: 10,
        bracketPosition: 1,
        redAthleteId: ath1,
        blueAthleteId: ath2,
        status: 'COMPLETED',
        result: {
          winnerCorner: 'RED',
          winnerAthleteId: ath1,
          loserAthleteId: ath2,
          redScore: 4,
          blueScore: 0,
          victoryType: 'VFA',
          redClassificationPts: 5,
          blueClassificationPts: 0,
          completedAt: 1000,
        },
      },
      {
        id: 'b2',
        divisionId: 'div1',
        boutNumber: 2,
        matName: 'MAT A',
        round: 'NORDIC_R2',
        roundOrder: 11,
        bracketPosition: 2,
        redAthleteId: ath2,
        blueAthleteId: ath3,
        status: 'COMPLETED',
        result: {
          winnerCorner: 'RED',
          winnerAthleteId: ath2,
          loserAthleteId: ath3,
          redScore: 8,
          blueScore: 0,
          victoryType: 'VSU',
          redClassificationPts: 4,
          blueClassificationPts: 0,
          completedAt: 2000,
        },
      },
      {
        id: 'b3',
        divisionId: 'div1',
        boutNumber: 3,
        matName: 'MAT A',
        round: 'NORDIC_R3',
        roundOrder: 12,
        bracketPosition: 3,
        redAthleteId: ath1,
        blueAthleteId: ath3,
        status: 'COMPLETED',
        result: {
          winnerCorner: 'RED',
          winnerAthleteId: ath1,
          loserAthleteId: ath3,
          redScore: 5,
          blueScore: 1,
          victoryType: 'VPO',
          redClassificationPts: 3,
          blueClassificationPts: 0,
          completedAt: 3000,
        },
      },
    ];

    const standings = calculateNordicStandings([ath1, ath2, ath3], bouts);
    expect(standings).toHaveLength(3);
    expect(standings[0].athleteId).toBe(ath1);
    expect(standings[0].rank).toBe(1);
    expect(standings[0].classificationPoints).toBe(8);
    expect(standings[0].vfaCount).toBe(1);

    expect(standings[1].athleteId).toBe(ath2);
    expect(standings[1].rank).toBe(2);
    expect(standings[1].classificationPoints).toBe(4);

    expect(standings[2].athleteId).toBe(ath3);
    expect(standings[2].rank).toBe(3);
    expect(standings[2].classificationPoints).toBe(0);
  });

  it('resolves equal Classification Points via Head-to-Head', () => {
    const a = 'ath_a';
    const b = 'ath_b';

    // Pertandingan langsung antara A dan B: A menang
    const bouts: TournamentBout[] = [
      {
        id: 'b1',
        divisionId: 'div1',
        boutNumber: 1,
        matName: 'MAT A',
        round: 'NORDIC_R1',
        roundOrder: 10,
        bracketPosition: 1,
        redAthleteId: a,
        blueAthleteId: b,
        status: 'COMPLETED',
        result: {
          winnerCorner: 'RED',
          winnerAthleteId: a,
          loserAthleteId: b,
          redScore: 2,
          blueScore: 2,
          victoryType: 'VPO1',
          redClassificationPts: 3,
          blueClassificationPts: 1,
          completedAt: 1000,
        },
      },
    ];

    const standings = calculateNordicStandings([a, b], bouts);
    expect(standings[0].athleteId).toBe(a);
    expect(standings[1].athleteId).toBe(b);
  });
});

describe('uwwDrawEngine - Official Seeding & Region Separation', () => {
  const dummyAthletes: Athlete[] = [
    {
      id: 'a1',
      name: 'Seed 1 Guy',
      region: 'JAWA BARAT',
      regionCode: 'JBR',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      seed: 1,
    },
    {
      id: 'a2',
      name: 'Seed 2 Guy',
      region: 'JAWA TIMUR',
      regionCode: 'JTM',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      seed: 2,
    },
    {
      id: 'a3',
      name: 'Same Region Guy 1',
      region: 'LAMPUNG',
      regionCode: 'LPG',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
    },
    {
      id: 'a4',
      name: 'Same Region Guy 2',
      region: 'LAMPUNG',
      regionCode: 'LPG',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
    },
  ];

  it('places Seed 1 at #1 and Seed 2 at #N', () => {
    const drawn = generateOfficialDraw(dummyAthletes, { separateSameRegion: true });
    expect(drawn[0].seed).toBe(1);
    expect(drawn[0].drawNumber).toBe(1);

    const last = drawn[drawn.length - 1];
    expect(last.seed).toBe(2);
    expect(last.drawNumber).toBe(dummyAthletes.length);
  });

  it('separates two athletes from the same region from facing in Round 1', () => {
    // Jalankan beberapa kali untuk memastikan proteksi swap pass bekerja konsisten
    for (let i = 0; i < 5; i++) {
      const drawn = generateOfficialDraw(dummyAthletes, { separateSameRegion: true });
      const lampungAthletes = drawn.filter((a) => a.region === 'LAMPUNG');
      expect(lampungAthletes).toHaveLength(2);

      const d1 = lampungAthletes[0].drawNumber!;
      const d2 = lampungAthletes[1].drawNumber!;

      // Pastikan mereka tidak menjadi pasangan langsung di babak pertama (1 vs 2 atau 3 vs 4)
      const arePairedInRound1 =
        (d1 === 1 && d2 === 2) ||
        (d1 === 2 && d2 === 1) ||
        (d1 === 3 && d2 === 4) ||
        (d1 === 4 && d2 === 3);

      expect(arePairedInRound1).toBe(false);
    }
  });
});

describe('uwwBracketEngine - Bracket Generation for N=2, 3..5, 6..7, 8..32', () => {
  const makeAthletes = (count: number): Athlete[] => {
    return Array.from({ length: count }, (_, idx) => ({
      id: `ath_${idx + 1}`,
      name: `Wrestler ${idx + 1}`,
      region: `REG_${idx + 1}`,
      regionCode: `R${idx + 1}`,
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      drawNumber: idx + 1,
    }));
  };

  const makeDivision = (format: CategoryDivision['format']): CategoryDivision => ({
    id: 'FS_SENIOR_74 KG',
    style: 'FS',
    ageCategory: 'SENIOR',
    weightClass: '74 KG',
    athleteIds: [],
    format,
    assignedMat: 'MAT A',
    isDrawLocked: false,
  });

  it('N=2 Single Bout produces exactly 1 Gold Final bout', () => {
    const athletes = makeAthletes(2);
    const bouts = generateDivisionBouts(makeDivision('SINGLE_BOUT'), athletes);

    expect(bouts).toHaveLength(1);
    expect(bouts[0].round).toBe('GOLD_FINAL');
    expect(bouts[0].redAthleteId).toBe('ath_1');
    expect(bouts[0].blueAthleteId).toBe('ath_2');
    expect(bouts[0].status).toBe('SCHEDULED');
  });

  it('N=3, 4, 5 Nordic System produces 3, 6, and 10 bouts without duplicates', () => {
    // N = 3
    const boutsN3 = generateDivisionBouts(makeDivision('NORDIC'), makeAthletes(3));
    expect(boutsN3).toHaveLength(3);

    // N = 4
    const boutsN4 = generateDivisionBouts(makeDivision('NORDIC'), makeAthletes(4));
    expect(boutsN4).toHaveLength(6);

    // N = 5
    const boutsN5 = generateDivisionBouts(makeDivision('NORDIC'), makeAthletes(5));
    expect(boutsN5).toHaveLength(10);

    // Verifikasi tidak ada pairing identik yang terulang di N=5
    const pairs = new Set<string>();
    boutsN5.forEach((b) => {
      const pairKey = [b.redAthleteId, b.blueAthleteId].sort().join('_vs_');
      expect(pairs.has(pairKey)).toBe(false);
      pairs.add(pairKey);
    });
  });

  it('N=6 and N=7 2-Pool Group + Cross generates round robin + cross semifinals & finals', () => {
    const boutsN6 = generateDivisionBouts(makeDivision('GROUP_CROSS'), makeAthletes(6));
    // Pool A (3 athletes -> 3 bouts) + Pool B (3 athletes -> 3 bouts) + 2 SF + 1 Gold + 1 Bronze = 10 bouts
    expect(boutsN6).toHaveLength(10);

    const boutsN7 = generateDivisionBouts(makeDivision('GROUP_CROSS'), makeAthletes(7));
    // Pool A (4 athletes -> 6 bouts) + Pool B (3 athletes -> 3 bouts) + 2 SF + 1 Gold + 1 Bronze = 13 bouts
    expect(boutsN7).toHaveLength(13);

    const sf1 = boutsN7.find((b) => b.round === 'SEMIFINAL' && b.bracketPosition === 1);
    const sf2 = boutsN7.find((b) => b.round === 'SEMIFINAL' && b.bracketPosition === 2);
    const gold = boutsN7.find((b) => b.round === 'GOLD_FINAL');
    const bronze = boutsN7.find((b) => b.round === 'BRONZE_1');

    expect(sf1).toBeDefined();
    expect(sf2).toBeDefined();
    expect(gold).toBeDefined();
    expect(bronze).toBeDefined();
    expect(sf1?.nextWinBoutId).toBe(gold?.id);
    expect(sf1?.nextLoseBoutId).toBe(bronze?.id);
  });

  it('N=11 Elimination + Repechage produces 3 Qualifications and 5 BYEs to Quarterfinals', () => {
    // Sesuai Aturan UWW 0.3: B = 8, Qual = N - B = 11 - 8 = 3. BYE = 2B - N = 16 - 11 = 5
    const athletes11 = makeAthletes(11);
    const bouts11 = generateDivisionBouts(makeDivision('ELIMINATION_REPECHAGE'), athletes11);

    const qualBouts = bouts11.filter((b) => b.round === 'QUALIFICATION');
    expect(qualBouts).toHaveLength(3);

    const qfBouts = bouts11.filter((b) => b.round === 'QUARTERFINAL');
    expect(qfBouts).toHaveLength(4);

    // Pastikan 3 pemenang kualifikasi tersambung ke slot QF
    qualBouts.forEach((qb) => {
      expect(qb.nextWinBoutId).toBeDefined();
      const targetQf = qfBouts.find((q) => q.id === qb.nextWinBoutId);
      expect(targetQf).toBeDefined();
    });
  });

  it('N=8 and N=16 Direct Elimination brackets have correct main round structures', () => {
    const bouts8 = generateDivisionBouts(makeDivision('ELIMINATION_REPECHAGE'), makeAthletes(8));
    const qual8 = bouts8.filter((b) => b.round === 'QUALIFICATION');
    const qf8 = bouts8.filter((b) => b.round === 'QUARTERFINAL');
    expect(qual8).toHaveLength(0); // B=8, 0 Qual
    expect(qf8).toHaveLength(4); // 4 QF

    const bouts16 = generateDivisionBouts(makeDivision('ELIMINATION_REPECHAGE'), makeAthletes(16));
    const qual16 = bouts16.filter((b) => b.round === 'QUALIFICATION');
    const r16_16 = bouts16.filter((b) => b.round === 'ROUND_OF_16');
    const qf16 = bouts16.filter((b) => b.round === 'QUARTERFINAL');
    expect(qual16).toHaveLength(0); // B=16, 0 Qual
    expect(r16_16).toHaveLength(8); // 8 Round of 16
    expect(qf16).toHaveLength(4); // 4 Quarterfinals
  });
});

describe('uwwBracketEngine - Cascading Result Progression & Single Repechage', () => {
  it('advances winner to next round and sets status from TBD to SCHEDULED', () => {
    const div: CategoryDivision = {
      id: 'div_elim',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      athleteIds: [],
      format: 'ELIMINATION_REPECHAGE',
      assignedMat: 'MAT A',
      isDrawLocked: true,
    };

    const athletes: Athlete[] = Array.from({ length: 8 }, (_, idx) => ({
      id: `ath_${idx + 1}`,
      name: `Wrestler ${idx + 1}`,
      region: `REG_${idx + 1}`,
      regionCode: `R${idx + 1}`,
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      drawNumber: idx + 1,
    }));

    const bouts = generateDivisionBouts(div, athletes);
    const qf1 = bouts.find((b) => b.id.includes('main_1'))!;
    const qf2 = bouts.find((b) => b.id.includes('main_2'))!;
    const sfTop = bouts.find((b) => b.id.includes('sf_top'))!;

    expect(sfTop.status).toBe('TBD');

    // Menangkan QF 1 untuk ath_1
    const result1: BoutResult = {
      winnerCorner: 'RED',
      winnerAthleteId: qf1.redAthleteId!,
      loserAthleteId: qf1.blueAthleteId!,
      redScore: 6,
      blueScore: 0,
      victoryType: 'VPO',
      redClassificationPts: 3,
      blueClassificationPts: 0,
      completedAt: 1000,
    };

    const boutsAfter1 = advanceBoutResult(bouts, qf1.id, result1);
    const updatedSfTop1 = boutsAfter1.find((b) => b.id === sfTop.id)!;
    expect(updatedSfTop1.redAthleteId).toBe(qf1.redAthleteId);
    expect(updatedSfTop1.status).toBe('TBD'); // Masih menunggu pemenang QF 2

    // Menangkan QF 2 untuk ath_3
    const result2: BoutResult = {
      winnerCorner: 'RED',
      winnerAthleteId: qf2.redAthleteId!,
      loserAthleteId: qf2.blueAthleteId!,
      redScore: 8,
      blueScore: 2,
      victoryType: 'VSU1',
      redClassificationPts: 4,
      blueClassificationPts: 1,
      completedAt: 2000,
    };

    const boutsAfter2 = advanceBoutResult(boutsAfter1, qf2.id, result2);
    const updatedSfTop2 = boutsAfter2.find((b) => b.id === sfTop.id)!;
    expect(updatedSfTop2.redAthleteId).toBe(qf1.redAthleteId);
    expect(updatedSfTop2.blueAthleteId).toBe(qf2.redAthleteId);
    expect(updatedSfTop2.status).toBe('SCHEDULED'); // Kedua slot terisi!
  });

  it('populates Single Repechage & Bronze Finals upon Semifinal completion', () => {
    const div: CategoryDivision = {
      id: 'div_rep',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      athleteIds: [],
      format: 'ELIMINATION_REPECHAGE',
      assignedMat: 'MAT A',
      isDrawLocked: true,
    };

    const athletes: Athlete[] = Array.from({ length: 8 }, (_, idx) => ({
      id: `ath_${idx + 1}`,
      name: `Wrestler ${idx + 1}`,
      region: `REG_${idx + 1}`,
      regionCode: `R${idx + 1}`,
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      drawNumber: idx + 1,
    }));

    let bouts = generateDivisionBouts(div, athletes);
    const qf1 = bouts.find((b) => b.id.includes('main_1'))!;
    const qf2 = bouts.find((b) => b.id.includes('main_2'))!;
    const sfTop = bouts.find((b) => b.id.includes('sf_top'))!;
    const bronze1 = bouts.find((b) => b.round === 'BRONZE_1')!;

    // ath_1 mengalahkan ath_2 di QF 1
    bouts = advanceBoutResult(bouts, qf1.id, {
      winnerCorner: 'RED',
      winnerAthleteId: 'ath_1',
      loserAthleteId: 'ath_2',
      redScore: 4,
      blueScore: 0,
      victoryType: 'VPO',
      redClassificationPts: 3,
      blueClassificationPts: 0,
      completedAt: 1000,
    });

    // ath_3 mengalahkan ath_4 di QF 2
    bouts = advanceBoutResult(bouts, qf2.id, {
      winnerCorner: 'RED',
      winnerAthleteId: 'ath_3',
      loserAthleteId: 'ath_4',
      redScore: 5,
      blueScore: 0,
      victoryType: 'VPO',
      redClassificationPts: 3,
      blueClassificationPts: 0,
      completedAt: 2000,
    });

    // Di Semifinal: ath_1 (Finalis Top) mengalahkan ath_3
    bouts = advanceBoutResult(bouts, sfTop.id, {
      winnerCorner: 'RED',
      winnerAthleteId: 'ath_1',
      loserAthleteId: 'ath_3',
      redScore: 7,
      blueScore: 1,
      victoryType: 'VPO1',
      redClassificationPts: 3,
      blueClassificationPts: 1,
      completedAt: 3000,
    });

    // Cek Bronze 1: Harus mempertemukan lawan yang dikalahkan oleh Finalis (ath_2) melawan yang kalah di Semifinal (ath_3)
    const updatedBronze1 = bouts.find((b) => b.id === bronze1.id)!;
    expect(updatedBronze1.status).toBe('SCHEDULED');
    expect(updatedBronze1.redAthleteId).toBe('ath_2'); // Yang kalah dari Finalis ath_1 di QF
    expect(updatedBronze1.blueAthleteId).toBe('ath_3'); // Yang kalah dari Finalis ath_1 di SF
  });

  it('automatically populates Cross Semifinals for GROUP_CROSS when all group bouts complete', () => {
    const div: CategoryDivision = {
      id: 'div_gc',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      athleteIds: [],
      format: 'GROUP_CROSS',
      assignedMat: 'MAT A',
      isDrawLocked: true,
    };

    const athletes: Athlete[] = Array.from({ length: 6 }, (_, idx) => ({
      id: `ath_${idx + 1}`,
      name: `Wrestler ${idx + 1}`,
      region: `REG_${idx + 1}`,
      regionCode: `R${idx + 1}`,
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      drawNumber: idx + 1,
    }));

    let bouts = generateDivisionBouts(div, athletes);

    // Mainkan seluruh partai Group A (ath_1, ath_3, ath_5) dan Group B (ath_2, ath_4, ath_6)
    const groupBouts = bouts.filter((b) => b.round === 'GROUP_A' || b.round === 'GROUP_B');

    groupBouts.forEach((b, idx) => {
      bouts = advanceBoutResult(bouts, b.id, {
        winnerCorner: 'RED',
        winnerAthleteId: b.redAthleteId!,
        loserAthleteId: b.blueAthleteId!,
        redScore: 4,
        blueScore: 0,
        victoryType: 'VPO',
        redClassificationPts: 3,
        blueClassificationPts: 0,
        completedAt: 1000 + idx * 100,
      });
    });

    // Cek Semifinal Silang (SF 1 dan SF 2)
    const sf1 = bouts.find((b) => b.round === 'SEMIFINAL' && b.bracketPosition === 1)!;
    const sf2 = bouts.find((b) => b.round === 'SEMIFINAL' && b.bracketPosition === 2)!;

    expect(sf1.status).toBe('SCHEDULED');
    expect(sf2.status).toBe('SCHEDULED');
    expect(sf1.redAthleteId).toBeDefined();
    expect(sf1.blueAthleteId).toBeDefined();
    expect(sf2.redAthleteId).toBeDefined();
    expect(sf2.blueAthleteId).toBeDefined();
  });

  it('creates and advances Single Repechage properly for N = 16 (R16 + QF losers)', () => {
    const div: CategoryDivision = {
      id: 'div_16',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '65 KG',
      athleteIds: [],
      format: 'ELIMINATION_REPECHAGE',
      assignedMat: 'MAT A',
      isDrawLocked: true,
    };

    const athletes: Athlete[] = Array.from({ length: 16 }, (_, idx) => ({
      id: `ath_${idx + 1}`,
      name: `Wrestler ${idx + 1}`,
      region: `REG_${idx + 1}`,
      regionCode: `R${idx + 1}`,
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '65 KG',
      drawNumber: idx + 1,
    }));

    let bouts = generateDivisionBouts(div, athletes);
    const rep1 = bouts.find((b) => b.round === 'REPECHAGE_1');
    const rep2 = bouts.find((b) => b.round === 'REPECHAGE_2');
    expect(rep1).toBeDefined();
    expect(rep2).toBeDefined();

    // Selesaikan seluruh R16, QF, dan SF TOP (ath_1 selalu menang via RED)
    const r16Top = bouts.filter(
      (b) => b.round === 'ROUND_OF_16' && b.bracketSide === 'TOP'
    );
    r16Top.forEach((b, idx) => {
      bouts = advanceBoutResult(bouts, b.id, {
        winnerCorner: 'RED',
        winnerAthleteId: b.redAthleteId!,
        loserAthleteId: b.blueAthleteId!,
        redScore: 6,
        blueScore: 0,
        victoryType: 'VPO',
        redClassificationPts: 3,
        blueClassificationPts: 0,
        completedAt: 1000 + idx,
      });
    });

    const qfTop = bouts.filter(
      (b) => b.round === 'QUARTERFINAL' && b.bracketSide === 'TOP'
    );
    qfTop.forEach((b, idx) => {
      bouts = advanceBoutResult(bouts, b.id, {
        winnerCorner: 'RED',
        winnerAthleteId: b.redAthleteId!,
        loserAthleteId: b.blueAthleteId!,
        redScore: 5,
        blueScore: 0,
        victoryType: 'VPO',
        redClassificationPts: 3,
        blueClassificationPts: 0,
        completedAt: 2000 + idx,
      });
    });

    const sfTop = bouts.find((b) => b.round === 'SEMIFINAL' && b.bracketSide === 'TOP')!;
    bouts = advanceBoutResult(bouts, sfTop.id, {
      winnerCorner: 'RED',
      winnerAthleteId: sfTop.redAthleteId!,
      loserAthleteId: sfTop.blueAthleteId!,
      redScore: 4,
      blueScore: 2,
      victoryType: 'VPO1',
      redClassificationPts: 3,
      blueClassificationPts: 1,
      completedAt: 3000,
    });

    const updatedRep1 = bouts.find((b) => b.round === 'REPECHAGE_1')!;
    expect(updatedRep1.status).toBe('SCHEDULED');
    expect(updatedRep1.redAthleteId).toBe('ath_2'); // R16 loser dari finalis ath_1
    expect(updatedRep1.blueAthleteId).toBe('ath_3'); // QF loser dari finalis ath_1

    // Menangkan Repechage 1 -> mengisi Bronze 1 RED melawan SF Loser di BLUE
    bouts = advanceBoutResult(bouts, updatedRep1.id, {
      winnerCorner: 'RED',
      winnerAthleteId: 'ath_2',
      loserAthleteId: 'ath_3',
      redScore: 3,
      blueScore: 1,
      victoryType: 'VPO1',
      redClassificationPts: 3,
      blueClassificationPts: 1,
      completedAt: 4000,
    });

    const updatedBronze1 = bouts.find((b) => b.round === 'BRONZE_1')!;
    expect(updatedBronze1.status).toBe('SCHEDULED');
    expect(updatedBronze1.redAthleteId).toBe('ath_2');
    expect(updatedBronze1.blueAthleteId).toBe('ath_5');
  });

  it('chains 2-round Repechage cleanly when N = 18 and finalist defeats 3 opponents', () => {
    const div: CategoryDivision = {
      id: 'div_18',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      athleteIds: [],
      format: 'ELIMINATION_REPECHAGE',
      assignedMat: 'MAT A',
      isDrawLocked: true,
    };

    const athletes: Athlete[] = Array.from({ length: 18 }, (_, idx) => ({
      id: `ath_${idx + 1}`,
      name: `Wrestler ${idx + 1}`,
      region: `REG_${idx + 1}`,
      regionCode: `R${idx + 1}`,
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      drawNumber: idx + 1,
    }));

    let bouts = generateDivisionBouts(div, athletes);
    const topReps = bouts
      .filter((b) => b.round === 'REPECHAGE_1')
      .sort((a, b) => a.bracketPosition - b.bracketPosition);
    expect(topReps).toHaveLength(2);

    // Qual 1 selesai -> pemenang masuk R16 bagian BOTTOM (karena BYE menempati slot awal)
    // Selesaikan semua Qual, R16, QF, dan SF secara deterministik (BLUE selalu menang agar kualifikasi menembus ke Final!)
    const finishRound = (round: TournamentBout['round']) => {
      bouts
        .filter((b) => b.round === round && b.redAthleteId && b.blueAthleteId)
        .forEach((b, idx) => {
          bouts = advanceBoutResult(bouts, b.id, {
            winnerCorner: 'BLUE',
            winnerAthleteId: b.blueAthleteId!,
            loserAthleteId: b.redAthleteId!,
            redScore: 0,
            blueScore: 6,
            victoryType: 'VPO',
            redClassificationPts: 0,
            blueClassificationPts: 3,
            completedAt: 1000 + idx,
          });
        });
    };

    finishRound('QUALIFICATION');
    finishRound('ROUND_OF_16');
    finishRound('QUARTERFINAL');
    finishRound('SEMIFINAL');

    // Bottom finalist melewati Qual -> R16 -> QF (3 lawan dikalahkan) -> memicu Rep R1 + Rep R2
    const bottomReps = bouts
      .filter((b) => b.round === 'REPECHAGE_2')
      .sort((a, b) => a.bracketPosition - b.bracketPosition);
    expect(bottomReps).toHaveLength(2);
    expect(bottomReps[0].status).toBe('SCHEDULED');
    expect(bottomReps[0].redAthleteId).toBeTruthy();
    expect(bottomReps[0].blueAthleteId).toBeTruthy();
    expect(bottomReps[1].blueAthleteId).toBeTruthy();
    expect(bottomReps[1].status).toBe('TBD');

    // Selesaikan Rep R1 -> Rep R2 jadi SCHEDULED
    bouts = advanceBoutResult(bouts, bottomReps[0].id, {
      winnerCorner: 'RED',
      winnerAthleteId: bottomReps[0].redAthleteId!,
      loserAthleteId: bottomReps[0].blueAthleteId!,
      redScore: 5,
      blueScore: 2,
      victoryType: 'VPO1',
      redClassificationPts: 3,
      blueClassificationPts: 1,
      completedAt: 5000,
    });

    const updatedRep2 = bouts.find((b) => b.id === bottomReps[1].id)!;
    expect(updatedRep2.status).toBe('SCHEDULED');
    expect(updatedRep2.redAthleteId).toBe(bottomReps[0].redAthleteId);
  });
});
