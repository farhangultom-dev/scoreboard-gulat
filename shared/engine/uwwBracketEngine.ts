import { Athlete, CategoryDivision, TournamentBout, BoutResult, BoutRound, DivisionFormat } from '../types/tournament';
import { calculateNordicStandings } from './uwwClassification';
import { validateManualDraw } from './uwwManualDraw';

/**
 * Mendeteksi format bagan resmi UWW berdasarkan jumlah peserta (N):
 * - N <= 2: SINGLE_BOUT
 * - N = 3..5: NORDIC (Round-Robin Penuh)
 * - N = 6..7: GROUP_CROSS (2-Pool Group + Cross Semifinal)
 * - N >= 8: ELIMINATION_REPECHAGE (Direct Elimination + Single Repechage)
 */
export function detectRecommendedFormat(athleteCount: number): DivisionFormat {
  if (athleteCount <= 2) {
    return 'SINGLE_BOUT';
  }
  if (athleteCount >= 3 && athleteCount <= 5) {
    return 'NORDIC';
  }
  if (athleteCount === 6 || athleteCount === 7) {
    return 'GROUP_CROSS';
  }
  return 'ELIMINATION_REPECHAGE';
}

/**
 * Menghasilkan seluruh struktur partai turnamen (TournamentBout[]) berdasarkan format divisi:
 * - SINGLE_BOUT (N=2)
 * - NORDIC (N=3..5)
 * - GROUP_CROSS (N=6..7)
 * - ELIMINATION_REPECHAGE (N=8..32)
 */
export function generateDivisionBouts(
  division: CategoryDivision,
  drawnAthletes: Athlete[]
): TournamentBout[] {
  const validation = validateManualDraw(drawnAthletes);
  if (!validation.isValid) {
    const reasons: string[] = [];
    if (validation.totalAthletes < 2) {
      reasons.push(
        `minimal diperlukan 2 atlet (ditemukan ${validation.totalAthletes})`
      );
    }
    if (validation.missingAthleteIds.length > 0) {
      reasons.push(
        `atlet belum memiliki nomor bola undian: [${validation.missingAthleteIds.join(', ')}]`
      );
    }
    if (validation.duplicateNumbers.length > 0) {
      reasons.push(
        `terdapat nomor bola duplikat: [${validation.duplicateNumbers.map((n) => `#${n}`).join(', ')}]`
      );
    }
    if (validation.outOfRangeAthleteIds.length > 0) {
      reasons.push(
        `nomor bola di luar rentang 1..${validation.totalAthletes} pada atlet: [${validation.outOfRangeAthleteIds.join(', ')}]`
      );
    }
    throw new Error(
      `Validasi undian manual tidak sah untuk divisi "${division.id}": ${reasons.join('; ')}.`
    );
  }

  const divId = division.id;
  const mat = division.assignedMat || 'MAT A';

  // Urutkan atlet secara ketat & deterministik berdasarkan nomor undian (1..N) tanpa pengacakan
  const sorted = [...drawnAthletes].sort(
    (a, b) => (a.drawNumber as number) - (b.drawNumber as number)
  );

  switch (division.format) {
    case 'SINGLE_BOUT':
      return generateSingleBout(divId, mat, sorted);
    case 'NORDIC':
      return generateNordicBouts(divId, mat, sorted);
    case 'GROUP_CROSS':
      return generateGroupCrossBouts(divId, mat, sorted);
    case 'ELIMINATION_REPECHAGE':
    default:
      return generateEliminationRepechageBouts(divId, mat, sorted);
  }
}

/**
 * 1. SINGLE BOUT (N = 2): 1 partai Gold Final langsung
 */
function generateSingleBout(
  divId: string,
  matName: string,
  athletes: Athlete[]
): TournamentBout[] {
  const redAth = athletes[0] || null;
  const blueAth = athletes[1] || null;

  return [
    {
      id: `${divId}_final`,
      divisionId: divId,
      boutNumber: null,
      matName,
      round: 'GOLD_FINAL',
      roundOrder: 60,
      bracketPosition: 1,
      redAthleteId: redAth ? redAth.id : null,
      blueAthleteId: blueAth ? blueAth.id : null,
      status: 'SCHEDULED',
    },
  ];
}

/**
 * 2. NORDIC SYSTEM (N = 3..5): Round-Robin Penuh menggunakan Circle Method (Berger)
 * - N = 3 -> 3 partai (3 ronde)
 * - N = 4 -> 6 partai (3 ronde)
 * - N = 5 -> 10 partai (5 ronde)
 */
function generateNordicBouts(
  divId: string,
  matName: string,
  athletes: Athlete[]
): TournamentBout[] {
  const n = athletes.length;
  const bouts: TournamentBout[] = [];

  // Circle Method: Jika N ganjil, tambahkan elemen dummy BYE (-1)
  const hasBye = n % 2 !== 0;
  const totalSlots = hasBye ? n + 1 : n;
  const totalRounds = totalSlots - 1;
  const matchesPerRound = totalSlots / 2;

  // Daftar id atlet (indeks 0..N-1), atau null untuk BYE
  const slots: (Athlete | null)[] = [...athletes];
  if (hasBye) {
    slots.push(null);
  }

  let boutCounter = 1;

  for (let r = 0; r < totalRounds; r++) {
    const roundNumber = r + 1;
    const roundName: BoutRound = `NORDIC_R${roundNumber}` as BoutRound;
    const roundOrder = 10 + r;

    for (let m = 0; m < matchesPerRound; m++) {
      const redIndex = (r + m) % (totalSlots - 1);
      let blueIndex = (totalSlots - 1 - m + r) % (totalSlots - 1);

      if (m === 0) {
        blueIndex = totalSlots - 1;
      }

      const redAth = slots[redIndex];
      const blueAth = slots[blueIndex];

      // Jika salah satu adalah BYE, jangan buat partai
      if (!redAth || !blueAth) continue;

      bouts.push({
        id: `${divId}_nordic_r${roundNumber}_b${boutCounter++}`,
        divisionId: divId,
        boutNumber: null,
        matName,
        round: roundName,
        roundOrder,
        bracketPosition: bouts.length + 1,
        redAthleteId: redAth.id,
        blueAthleteId: blueAth.id,
        status: 'SCHEDULED',
      });
    }
  }

  return bouts;
}

/**
 * 3. UWW 2-POOL GROUP + CROSS SEMIFINAL (N = 6..7)
 * - N = 6: Pool A (3 atlet: #1, #3, #5), Pool B (3 atlet: #2, #4, #6)
 * - N = 7: Pool A (4 atlet: #1, #3, #5, #7), Pool B (3 atlet: #2, #4, #6)
 * - Masing-masing pool memainkan Round-Robin
 * - Cross Semifinal: A1 vs B2, B1 vs A2
 * - Pemenang Semifinal ke Gold Final, yang kalah ke Bronze Final
 */
function generateGroupCrossBouts(
  divId: string,
  matName: string,
  athletes: Athlete[]
): TournamentBout[] {
  const bouts: TournamentBout[] = [];

  // Pisahkan Pool A (Bola #1 s.d. #ceil(N/2)) dan Pool B (Bola #(ceil(N/2)+1) s.d. #N)
  const poolASize = Math.ceil(athletes.length / 2);
  const poolA: Athlete[] = athletes.slice(0, poolASize);
  const poolB: Athlete[] = athletes.slice(poolASize);

  // 1. Round-Robin Pool A
  let counterA = 1;
  for (let i = 0; i < poolA.length; i++) {
    for (let j = i + 1; j < poolA.length; j++) {
      bouts.push({
        id: `${divId}_groupA_b${counterA++}`,
        divisionId: divId,
        boutNumber: null,
        matName,
        round: 'GROUP_A',
        roundOrder: 20,
        bracketPosition: bouts.length + 1,
        redAthleteId: poolA[i].id,
        blueAthleteId: poolA[j].id,
        status: 'SCHEDULED',
      });
    }
  }

  // 2. Round-Robin Pool B
  let counterB = 1;
  for (let i = 0; i < poolB.length; i++) {
    for (let j = i + 1; j < poolB.length; j++) {
      bouts.push({
        id: `${divId}_groupB_b${counterB++}`,
        divisionId: divId,
        matName,
        boutNumber: null,
        round: 'GROUP_B',
        roundOrder: 21,
        bracketPosition: bouts.length + 1,
        redAthleteId: poolB[i].id,
        blueAthleteId: poolB[j].id,
        status: 'SCHEDULED',
      });
    }
  }

  // 3. Finals & Cross Semifinals ID
  const sf1Id = `${divId}_sf1`;
  const sf2Id = `${divId}_sf2`;
  const goldId = `${divId}_gold`;
  const bronzeId = `${divId}_bronze`;

  // Cross Semifinal 1: A1 vs B2
  bouts.push({
    id: sf1Id,
    divisionId: divId,
    boutNumber: null,
    matName,
    round: 'SEMIFINAL',
    roundOrder: 40,
    bracketPosition: 1,
    redAthleteId: null,
    blueAthleteId: null,
    redSourceLabel: '1st Pool A',
    blueSourceLabel: '2nd Pool B',
    nextWinBoutId: goldId,
    nextWinSlot: 'RED',
    nextLoseBoutId: bronzeId,
    nextLoseSlot: 'RED',
    status: 'TBD',
  });

  // Cross Semifinal 2: B1 vs A2
  bouts.push({
    id: sf2Id,
    divisionId: divId,
    boutNumber: null,
    matName,
    round: 'SEMIFINAL',
    roundOrder: 40,
    bracketPosition: 2,
    redAthleteId: null,
    blueAthleteId: null,
    redSourceLabel: '1st Pool B',
    blueSourceLabel: '2nd Pool A',
    nextWinBoutId: goldId,
    nextWinSlot: 'BLUE',
    nextLoseBoutId: bronzeId,
    nextLoseSlot: 'BLUE',
    status: 'TBD',
  });

  // Bronze Final (Loser SF 1 vs Loser SF 2)
  bouts.push({
    id: bronzeId,
    divisionId: divId,
    boutNumber: null,
    matName,
    round: 'BRONZE_1',
    roundOrder: 55,
    bracketPosition: 1,
    redAthleteId: null,
    blueAthleteId: null,
    redSourceLabel: 'Loser SF 1',
    blueSourceLabel: 'Loser SF 2',
    status: 'TBD',
  });

  // Gold Final (Winner SF 1 vs Winner SF 2)
  bouts.push({
    id: goldId,
    divisionId: divId,
    boutNumber: null,
    matName,
    round: 'GOLD_FINAL',
    roundOrder: 60,
    bracketPosition: 1,
    redAthleteId: null,
    blueAthleteId: null,
    redSourceLabel: 'Winner SF 1',
    blueSourceLabel: 'Winner SF 2',
    status: 'TBD',
  });

  return bouts;
}

/**
 * 4. DIRECT ELIMINATION WITH SINGLE REPECHAGE (N >= 8 s.d. 32)
 * - B = pangkat 2 terbesar <= N (misal N = 11, B = 8)
 * - Jumlah Qualification = N - B
 * - Jumlah BYE = 2*B - N
 * - Sesuai konvensi UWW: nomor undian awal mendapat BYE di separuh atas (top half)
 * - Nomor undian akhir bertanding di Qualification di separuh bawah (bottom half)
 */
function generateEliminationRepechageBouts(
  divId: string,
  matName: string,
  athletes: Athlete[]
): TournamentBout[] {
  const n = athletes.length;
  const bouts: TournamentBout[] = [];

  // Cari B (pangkat 2 terbesar <= N)
  let b = 8;
  if (n >= 16 && n < 32) b = 16;
  if (n >= 32) b = 32;

  const numQualBouts = n - b;
  const numByes = 2 * b - n;

  // Atlet BYE (nomor undian awal 1 s.d. numByes)
  const byeAthletes = athletes.slice(0, numByes);

  // Atlet yang bertanding di Qualification (nomor undian setelah BYE)
  const qualAthletes = athletes.slice(numByes);

  // Inisialisasi partai Qualification jika ada
  const qualBouts: TournamentBout[] = [];
  for (let i = 0; i < numQualBouts; i++) {
    const red = qualAthletes[i * 2] || null;
    const blue = qualAthletes[i * 2 + 1] || null;
    const qualId = `${divId}_qual_${i + 1}`;

    qualBouts.push({
      id: qualId,
      divisionId: divId,
      boutNumber: null,
      matName,
      round: 'QUALIFICATION',
      roundOrder: 10,
      bracketPosition: i + 1,
      bracketSide: i < numQualBouts / 2 ? 'TOP' : 'BOTTOM',
      redAthleteId: red ? red.id : null,
      blueAthleteId: blue ? blue.id : null,
      status: 'SCHEDULED',
    });
  }
  bouts.push(...qualBouts);

  // Babak Utama B (Quarterfinals jika B = 8, Round of 16 jika B = 16, Round of 32 jika B = 32)
  const mainRoundName: BoutRound =
    b === 8 ? 'QUARTERFINAL' : b === 16 ? 'ROUND_OF_16' : 'ROUND_OF_32';
  const mainRoundOrder = b === 8 ? 30 : b === 16 ? 20 : 15;
  const numMainBouts = b / 2; // Misal B=8 -> 4 QF, B=16 -> 8 R16, B=32 -> 16 R32

  const mainBouts: TournamentBout[] = [];

  // Susun slot untuk Babak Utama B (total slots = b)
  // BYE athletes menempati slot awal, sisa slot diisi pemenang Qualification
  const mainSlots: {
    athleteId: string | null;
    qualBoutId?: string;
  }[] = [];

  // Masukkan BYE athletes
  byeAthletes.forEach((ath) => {
    mainSlots.push({ athleteId: ath.id });
  });

  // Masukkan slot dari pemenang Qualification
  qualBouts.forEach((qBout) => {
    mainSlots.push({ athleteId: null, qualBoutId: qBout.id });
  });

  // Buat partai-partai Babak Utama
  for (let i = 0; i < numMainBouts; i++) {
    const mainId = `${divId}_main_${i + 1}`;
    const side: 'TOP' | 'BOTTOM' = i < numMainBouts / 2 ? 'TOP' : 'BOTTOM';

    const slot1 = mainSlots[i * 2];
    const slot2 = mainSlots[i * 2 + 1];

    const bout: TournamentBout = {
      id: mainId,
      divisionId: divId,
      boutNumber: null,
      matName,
      round: mainRoundName,
      roundOrder: mainRoundOrder,
      bracketPosition: i + 1,
      bracketSide: side,
      redAthleteId: slot1 ? slot1.athleteId : null,
      blueAthleteId: slot2 ? slot2.athleteId : null,
      redSourceLabel: slot1?.qualBoutId ? `Winner Qual` : undefined,
      blueSourceLabel: slot2?.qualBoutId ? `Winner Qual` : undefined,
      status: slot1?.athleteId && slot2?.athleteId ? 'SCHEDULED' : 'TBD',
    };

    // Sambungkan pemenang Qualification ke slot Babak Utama
    if (slot1?.qualBoutId) {
      const q = qualBouts.find((qb) => qb.id === slot1.qualBoutId);
      if (q) {
        q.nextWinBoutId = mainId;
        q.nextWinSlot = 'RED';
      }
    }
    if (slot2?.qualBoutId) {
      const q = qualBouts.find((qb) => qb.id === slot2.qualBoutId);
      if (q) {
        q.nextWinBoutId = mainId;
        q.nextWinSlot = 'BLUE';
      }
    }

    mainBouts.push(bout);
  }
  bouts.push(...mainBouts);

  // Bangun babak antara menuju Quarterfinal jika B >= 16
  let qfInputBouts: TournamentBout[] = mainBouts;
  if (b === 32) {
    const r16Bouts: TournamentBout[] = [];
    for (let i = 0; i < 8; i++) {
      const r16Id = `${divId}_r16_${i + 1}`;
      const side: 'TOP' | 'BOTTOM' = i < 4 ? 'TOP' : 'BOTTOM';

      const r16Bout: TournamentBout = {
        id: r16Id,
        divisionId: divId,
        boutNumber: null,
        matName,
        round: 'ROUND_OF_16',
        roundOrder: 20,
        bracketPosition: i + 1,
        bracketSide: side,
        redAthleteId: null,
        blueAthleteId: null,
        status: 'TBD',
      };

      const r32_1 = mainBouts[i * 2];
      const r32_2 = mainBouts[i * 2 + 1];
      r32_1.nextWinBoutId = r16Id;
      r32_1.nextWinSlot = 'RED';
      r32_2.nextWinBoutId = r16Id;
      r32_2.nextWinSlot = 'BLUE';

      r16Bouts.push(r16Bout);
    }
    bouts.push(...r16Bouts);
    qfInputBouts = r16Bouts;
  }

  let qfBouts: TournamentBout[] = [];
  if (b >= 16) {
    for (let i = 0; i < 4; i++) {
      const qfId = `${divId}_qf_${i + 1}`;
      const side: 'TOP' | 'BOTTOM' = i < 2 ? 'TOP' : 'BOTTOM';

      const qfBout: TournamentBout = {
        id: qfId,
        divisionId: divId,
        boutNumber: null,
        matName,
        round: 'QUARTERFINAL',
        roundOrder: 30,
        bracketPosition: i + 1,
        bracketSide: side,
        redAthleteId: null,
        blueAthleteId: null,
        status: 'TBD',
      };

      // Sambungkan R16 ke QF
      const r16_1 = qfInputBouts[i * 2];
      const r16_2 = qfInputBouts[i * 2 + 1];
      r16_1.nextWinBoutId = qfId;
      r16_1.nextWinSlot = 'RED';
      r16_2.nextWinBoutId = qfId;
      r16_2.nextWinSlot = 'BLUE';

      qfBouts.push(qfBout);
    }
    bouts.push(...qfBouts);
  } else {
    qfBouts = mainBouts;
  }

  // Semifinals (2 partai: TOP & BOTTOM)
  const sfTopId = `${divId}_sf_top`;
  const sfBottomId = `${divId}_sf_bottom`;

  const sfTop: TournamentBout = {
    id: sfTopId,
    divisionId: divId,
    boutNumber: null,
    matName,
    round: 'SEMIFINAL',
    roundOrder: 40,
    bracketPosition: 1,
    bracketSide: 'TOP',
    redAthleteId: null,
    blueAthleteId: null,
    status: 'TBD',
  };

  const sfBottom: TournamentBout = {
    id: sfBottomId,
    divisionId: divId,
    boutNumber: null,
    matName,
    round: 'SEMIFINAL',
    roundOrder: 40,
    bracketPosition: 2,
    bracketSide: 'BOTTOM',
    redAthleteId: null,
    blueAthleteId: null,
    status: 'TBD',
  };

  // Sambungkan QF ke Semifinals
  qfBouts[0].nextWinBoutId = sfTopId;
  qfBouts[0].nextWinSlot = 'RED';
  qfBouts[1].nextWinBoutId = sfTopId;
  qfBouts[1].nextWinSlot = 'BLUE';

  qfBouts[2].nextWinBoutId = sfBottomId;
  qfBouts[2].nextWinSlot = 'RED';
  qfBouts[3].nextWinBoutId = sfBottomId;
  qfBouts[3].nextWinSlot = 'BLUE';

  bouts.push(sfTop, sfBottom);

  // Gold Final
  const goldId = `${divId}_gold`;
  const goldFinal: TournamentBout = {
    id: goldId,
    divisionId: divId,
    boutNumber: null,
    matName,
    round: 'GOLD_FINAL',
    roundOrder: 60,
    bracketPosition: 1,
    redAthleteId: null,
    blueAthleteId: null,
    redSourceLabel: 'Winner SF Top',
    blueSourceLabel: 'Winner SF Bottom',
    status: 'TBD',
  };
  sfTop.nextWinBoutId = goldId;
  sfTop.nextWinSlot = 'RED';
  sfBottom.nextWinBoutId = goldId;
  sfBottom.nextWinSlot = 'BLUE';
  bouts.push(goldFinal);

  // Bronze Finals (Bronze 1 untuk TOP, Bronze 2 untuk BOTTOM)
  const bronze1Id = `${divId}_bronze_1`;
  const bronze2Id = `${divId}_bronze_2`;

  const bronze1: TournamentBout = {
    id: bronze1Id,
    divisionId: divId,
    boutNumber: null,
    matName,
    round: 'BRONZE_1',
    roundOrder: 55,
    bracketPosition: 1,
    bracketSide: 'TOP',
    redAthleteId: null,
    blueAthleteId: null,
    status: 'TBD',
  };

  const bronze2: TournamentBout = {
    id: bronze2Id,
    divisionId: divId,
    boutNumber: null,
    matName,
    round: 'BRONZE_2',
    roundOrder: 55,
    bracketPosition: 2,
    bracketSide: 'BOTTOM',
    redAthleteId: null,
    blueAthleteId: null,
    status: 'TBD',
  };
  bouts.push(bronze1, bronze2);

  // Repechage (dibuat jika finalis berpotensi menghadapi >= 2 lawan sebelum Semifinal:
  // mis. Qual + QF pada B=8, atau R16 + QF pada N=16, atau Qual + R16 + QF pada N>=17)
  const basePriorRounds = b === 8 ? 1 : b === 16 ? 2 : 3;
  const maxPriorRounds = basePriorRounds + (numQualBouts > 0 ? 1 : 0);
  const numRepPerSide = Math.max(0, maxPriorRounds - 1);

  if (numRepPerSide > 0) {
    const buildRepechageChain = (
      side: 'TOP' | 'BOTTOM',
      roundName: 'REPECHAGE_1' | 'REPECHAGE_2',
      finalRepId: string,
      targetBronzeId: string
    ) => {
      for (let j = 0; j < numRepPerSide; j++) {
        const isLastRep = j === numRepPerSide - 1;
        const boutId = isLastRep ? finalRepId : `${finalRepId}_r${j + 1}`;
        const nextBoutId = isLastRep
          ? targetBronzeId
          : j + 1 === numRepPerSide - 1
          ? finalRepId
          : `${finalRepId}_r${j + 2}`;

        bouts.push({
          id: boutId,
          divisionId: divId,
          boutNumber: null,
          matName,
          round: roundName,
          roundOrder: 50,
          bracketPosition: j + 1,
          bracketSide: side,
          redAthleteId: null,
          blueAthleteId: null,
          nextWinBoutId: nextBoutId,
          nextWinSlot: 'RED',
          status: 'TBD',
        });
      }
    };

    buildRepechageChain('TOP', 'REPECHAGE_1', `${divId}_repechage_1`, bronze1Id);
    buildRepechageChain('BOTTOM', 'REPECHAGE_2', `${divId}_repechage_2`, bronze2Id);
  }

  return bouts;
}

/**
 * Memajukan hasil pertandingan (advanceBoutResult) secara cascading:
 * 1. Mengunci hasil partai (COMPLETED, result).
 * 2. Memindahkan pemenang ke nextWinBoutId dan yang kalah ke nextLoseBoutId.
 * 3. Menghubungkan otomatis Cross Semifinal pada Group Cross begitu pool selesai.
 * 4. Menghubungkan otomatis Single Repechage & Bronze Finals begitu Semifinal selesai.
 */
export function advanceBoutResult(
  allBouts: TournamentBout[],
  completedBoutId: string,
  result: BoutResult
): TournamentBout[] {
  // Salin seluruh partai untuk immutability
  const bouts = allBouts.map((b) => ({ ...b }));
  const targetBout = bouts.find((b) => b.id === completedBoutId);
  if (!targetBout) return bouts;

  // 1. Kunci hasil pada target bout
  targetBout.status = 'COMPLETED';
  targetBout.result = result;

  // 2. Majukan pemenang (Winner) jika ada nextWinBoutId
  if (targetBout.nextWinBoutId) {
    const nextBout = bouts.find((b) => b.id === targetBout.nextWinBoutId);
    if (nextBout) {
      if (targetBout.nextWinSlot === 'RED') {
        nextBout.redAthleteId = result.winnerAthleteId;
      } else if (targetBout.nextWinSlot === 'BLUE') {
        nextBout.blueAthleteId = result.winnerAthleteId;
      }
      if (nextBout.redAthleteId && nextBout.blueAthleteId) {
        nextBout.status = 'SCHEDULED';
      }
    }
  }

  // 3. Majukan yang kalah (Loser) jika ada nextLoseBoutId
  if (targetBout.nextLoseBoutId) {
    const loseBout = bouts.find((b) => b.id === targetBout.nextLoseBoutId);
    if (loseBout) {
      if (targetBout.nextLoseSlot === 'RED') {
        loseBout.redAthleteId = result.loserAthleteId;
      } else if (targetBout.nextLoseSlot === 'BLUE') {
        loseBout.blueAthleteId = result.loserAthleteId;
      }
      if (loseBout.redAthleteId && loseBout.blueAthleteId) {
        loseBout.status = 'SCHEDULED';
      }
    }
  }

  // 4. Logika Khusus GROUP_CROSS: Cek kelengkapan Pool A & Pool B
  const groupABouts = bouts.filter((b) => b.round === 'GROUP_A');
  const groupBBouts = bouts.filter((b) => b.round === 'GROUP_B');

  if (
    groupABouts.length > 0 &&
    groupBBouts.length > 0 &&
    groupABouts.every((b) => b.status === 'COMPLETED') &&
    groupBBouts.every((b) => b.status === 'COMPLETED')
  ) {
    // Kumpulkan seluruh atlet di Pool A & B
    const poolAAthletes = Array.from(
      new Set(
        groupABouts.flatMap((b) => [b.redAthleteId, b.blueAthleteId]).filter(Boolean)
      )
    ) as string[];

    const poolBAthletes = Array.from(
      new Set(
        groupBBouts.flatMap((b) => [b.redAthleteId, b.blueAthleteId]).filter(Boolean)
      )
    ) as string[];

    const standingsA = calculateNordicStandings(poolAAthletes, groupABouts);
    const standingsB = calculateNordicStandings(poolBAthletes, groupBBouts);

    if (standingsA.length >= 2 && standingsB.length >= 2) {
      const a1 = standingsA[0].athleteId;
      const a2 = standingsA[1].athleteId;
      const b1 = standingsB[0].athleteId;
      const b2 = standingsB[1].athleteId;

      const sf1 = bouts.find((b) => b.round === 'SEMIFINAL' && b.bracketPosition === 1);
      const sf2 = bouts.find((b) => b.round === 'SEMIFINAL' && b.bracketPosition === 2);

      if (sf1 && sf1.status === 'TBD') {
        sf1.redAthleteId = a1;
        sf1.blueAthleteId = b2;
        sf1.status = 'SCHEDULED';
      }

      if (sf2 && sf2.status === 'TBD') {
        sf2.redAthleteId = b1;
        sf2.blueAthleteId = a2;
        sf2.status = 'SCHEDULED';
      }
    }
  }

  // 5. Logika Khusus ELIMINATION_REPECHAGE: Begitu Semifinal Selesai, Susun Jalur Repechage
  if (targetBout.round === 'SEMIFINAL') {
    const side = targetBout.bracketSide; // 'TOP' atau 'BOTTOM'
    const finalistId = result.winnerAthleteId;
    const sfLoserId = result.loserAthleteId;

    // Telusuri seluruh lawan yang kalah dari Finalis ini dari babak terawal
    const defeatedByFinalist: string[] = [];

    // Urutan kronologis babak sebelum semifinal: QUALIFICATION, ROUND_OF_32, ROUND_OF_16, QUARTERFINAL
    const priorRounds: BoutRound[] = [
      'QUALIFICATION',
      'ROUND_OF_32',
      'ROUND_OF_16',
      'QUARTERFINAL',
    ];

    priorRounds.forEach((rnd) => {
      const match = bouts.find(
        (b) =>
          b.round === rnd &&
          b.status === 'COMPLETED' &&
          b.result &&
          b.result.winnerAthleteId === finalistId
      );
      if (match && match.result) {
        defeatedByFinalist.push(match.result.loserAthleteId);
      }
    });

    const bronzeBout = bouts.find(
      (b) =>
        (side === 'TOP' ? b.round === 'BRONZE_1' : b.round === 'BRONZE_2') ||
        (b.bracketSide === side && (b.round === 'BRONZE_1' || b.round === 'BRONZE_2'))
    );

    const repBouts = bouts
      .filter(
        (b) =>
          b.round === (side === 'TOP' ? 'REPECHAGE_1' : 'REPECHAGE_2')
      )
      .sort((a, b) => a.bracketPosition - b.bracketPosition);

    if (defeatedByFinalist.length === 1) {
      // Hanya 1 lawan terdahulu (misal lawan di QF) -> langsung tanding melawan SF Loser untuk Perunggu
      if (bronzeBout) {
        bronzeBout.redAthleteId = defeatedByFinalist[0];
        bronzeBout.blueAthleteId = sfLoserId;
        bronzeBout.status = 'SCHEDULED';
      }
    } else if (defeatedByFinalist.length >= 2) {
      // Susun rantai Repechage sesuai jumlah lawan yang dikalahkan Finalis (2, 3, dst.)
      if (repBouts.length > 0) {
        const neededRepCount = defeatedByFinalist.length - 1;
        const startIdx = Math.max(0, repBouts.length - neededRepCount);
        const firstRep = repBouts[startIdx];

        if (firstRep) {
          firstRep.redAthleteId = defeatedByFinalist[0];
          firstRep.blueAthleteId = defeatedByFinalist[1];
          firstRep.status = 'SCHEDULED';
        }

        for (let k = 2; k < defeatedByFinalist.length; k++) {
          const downstreamRep = repBouts[startIdx + (k - 1)];
          if (downstreamRep) {
            downstreamRep.blueAthleteId = defeatedByFinalist[k];
          }
        }
      } else if (bronzeBout) {
        // Fallback aman jika tidak ada slot repechage sama sekali
        bronzeBout.redAthleteId = defeatedByFinalist[defeatedByFinalist.length - 1];
      }

      if (bronzeBout) {
        // Loser Semifinal menunggu pemenang rangkaian Repechage di slot RED
        bronzeBout.blueAthleteId = sfLoserId;
      }
    } else {
      // Jika tidak ada babak sebelum semifinal, semifinalis yang kalah langsung ke Bronze
      if (bronzeBout) {
        bronzeBout.blueAthleteId = sfLoserId;
      }
    }
  }

  return bouts;
}
