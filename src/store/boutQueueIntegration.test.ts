import { describe, it, expect, beforeEach } from 'vitest';
import { useTournamentStore } from './useTournamentStore';
import { useMatchStore } from './useMatchStore';
import { Athlete, CategoryDivision } from '../types/tournament';
import { BoutResult } from '../types/tournament';

describe('Phase 10: Seamless Bout Queue & Scoreboard Integration', () => {
  beforeEach(async () => {
    await useTournamentStore.getState().resetTournament();
    useMatchStore.getState().resetMatch();
  });

  it('generates master order of bouts chronologically by roundOrder with sequential mat numbers', async () => {
    // Setup 2 divisi: FS 74 KG (4 atlet -> 6 bouts Nordic) dan GR 67 KG (2 atlet -> 1 bout Final)
    const ath1: Athlete = {
      id: 'a1',
      name: 'Budi',
      region: 'JABAR',
      regionCode: 'JBR',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      drawNumber: 1,
    };
    const ath2: Athlete = {
      id: 'a2',
      name: 'Rahmat',
      region: 'JATIM',
      regionCode: 'JTM',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      drawNumber: 2,
    };
    const ath3: Athlete = {
      id: 'a3',
      name: 'Eko',
      region: 'LAMPUNG',
      regionCode: 'LPG',
      style: 'GR',
      ageCategory: 'SENIOR',
      weightClass: '67 KG',
      drawNumber: 1,
    };
    const ath4: Athlete = {
      id: 'a4',
      name: 'Dimas',
      region: 'PAPUA',
      regionCode: 'PPA',
      style: 'GR',
      ageCategory: 'SENIOR',
      weightClass: '67 KG',
      drawNumber: 2,
    };

    const div1: CategoryDivision = {
      id: 'FS_SENIOR_74 KG',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      athleteIds: ['a1', 'a2'],
      format: 'SINGLE_BOUT',
      assignedMat: 'MAT A',
      isDrawLocked: false,
    };

    const div2: CategoryDivision = {
      id: 'GR_SENIOR_67 KG',
      style: 'GR',
      ageCategory: 'SENIOR',
      weightClass: '67 KG',
      athleteIds: ['a3', 'a4'],
      format: 'SINGLE_BOUT',
      assignedMat: 'MAT A',
      isDrawLocked: false,
    };

    useTournamentStore.setState({
      athletes: { a1: ath1, a2: ath2, a3: ath3, a4: ath4 },
      divisions: { [div1.id]: div1, [div2.id]: div2 },
    });

    // Kunci undian kedua divisi
    await useTournamentStore.getState().lockAndGenerateBracket(div1.id);
    await useTournamentStore.getState().lockAndGenerateBracket(div2.id);

    // Generate Master Order
    await useTournamentStore.getState().generateMasterOrderOfBouts();

    const updatedStore = useTournamentStore.getState();
    expect(updatedStore.orderOfBouts.length).toBe(2);

    const bout1 = updatedStore.bouts[updatedStore.orderOfBouts[0]];
    const bout2 = updatedStore.bouts[updatedStore.orderOfBouts[1]];

    expect(bout1.boutNumber).toBe(1);
    expect(bout2.boutNumber).toBe(2);
    expect(bout1.matName).toBe('MAT A');
    expect(bout2.matName).toBe('MAT A');
  });

  it('loads a queued bout into useMatchStore with 1-click and marks status IN_PROGRESS & next ON_DECK', async () => {
    const ath1: Athlete = {
      id: 'a1',
      name: 'Andi Saputra',
      region: 'SUMATERA UTARA',
      regionCode: 'SMU',
      style: 'FS',
      ageCategory: 'U17',
      weightClass: '55 KG',
      drawNumber: 1,
    };
    const ath2: Athlete = {
      id: 'a2',
      name: 'Ilham Jaya',
      region: 'KALIMANTAN TIMUR',
      regionCode: 'KTM',
      style: 'FS',
      ageCategory: 'U17',
      weightClass: '55 KG',
      drawNumber: 2,
    };
    const ath3: Athlete = {
      id: 'a3',
      name: 'Bout2 Red',
      region: 'BALI',
      regionCode: 'BAL',
      style: 'FS',
      ageCategory: 'U17',
      weightClass: '55 KG',
      drawNumber: 3,
    };
    const ath4: Athlete = {
      id: 'a4',
      name: 'Bout2 Blue',
      region: 'DKI',
      regionCode: 'DKI',
      style: 'FS',
      ageCategory: 'U17',
      weightClass: '55 KG',
      drawNumber: 4,
    };

    const div: CategoryDivision = {
      id: 'FS_U17_55 KG',
      style: 'FS',
      ageCategory: 'U17',
      weightClass: '55 KG',
      athleteIds: ['a1', 'a2', 'a3', 'a4'],
      format: 'NORDIC',
      assignedMat: 'MAT A',
      isDrawLocked: true,
    };

    useTournamentStore.setState({
      athletes: { a1: ath1, a2: ath2, a3: ath3, a4: ath4 },
      divisions: { [div.id]: div },
    });

    await useTournamentStore.getState().lockAndGenerateBracket(div.id);
    await useTournamentStore.getState().generateMasterOrderOfBouts();

    const order = useTournamentStore.getState().orderOfBouts;
    expect(order.length).toBeGreaterThanOrEqual(2);

    const firstBoutId = order[0];
    const secondBoutId = order[1];

    // Load bout pertama ke matras
    useTournamentStore.getState().loadBoutToMatch(firstBoutId);

    // Cek status di tournament store
    const tStore = useTournamentStore.getState();
    expect(tStore.bouts[firstBoutId].status).toBe('IN_PROGRESS');
    expect(tStore.bouts[secondBoutId].status).toBe('ON_DECK');

    const firstBout = tStore.bouts[firstBoutId];
    const expectedRedAth = tStore.athletes[firstBout.redAthleteId!];
    const expectedBlueAth = tStore.athletes[firstBout.blueAthleteId!];

    // Cek bahwa state di useMatchStore otomatis terisi dengan presisi tanpa input manual
    const match = useMatchStore.getState().match;
    expect(match.activeBoutId).toBe(firstBoutId);
    expect(match.metadata.matName).toBe('MAT A');
    expect(match.metadata.style).toBe('FS');
    expect(match.metadata.ageCategory).toBe('U17');
    expect(match.metadata.weightClass).toBe('55 KG');
    expect(match.red.name).toBe(expectedRedAth.name);
    expect(match.red.countryOrTeam).toBe(expectedRedAth.regionCode);
    expect(match.blue.name).toBe(expectedBlueAth.name);
    expect(match.blue.countryOrTeam).toBe(expectedBlueAth.regionCode);

    // U17 match clock harus 2:00 (120_000 ms)
    expect(match.mainClock.remainingMs).toBe(120_000);
    expect(match.phase).toBe('PRE_MATCH');
    expect(match.red.score).toBe(0);
    expect(match.blue.score).toBe(0);

    // Cek nextBoutPreview terisi
    expect(match.nextBoutPreview).toBeDefined();
    expect(match.nextBoutPreview?.boutNumber).toBe(2);
  });

  it('completes bout via completeBout and updates bracket cascadingly', async () => {
    const div: CategoryDivision = {
      id: 'FS_SENIOR_74 KG',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      athleteIds: ['a1', 'a2'],
      format: 'SINGLE_BOUT',
      assignedMat: 'MAT A',
      isDrawLocked: false,
    };

    const ath1: Athlete = {
      id: 'a1',
      name: 'Champion',
      region: 'JABAR',
      regionCode: 'JBR',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      drawNumber: 1,
    };
    const ath2: Athlete = {
      id: 'a2',
      name: 'RunnerUp',
      region: 'JATIM',
      regionCode: 'JTM',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      drawNumber: 2,
    };

    useTournamentStore.setState({
      athletes: { a1: ath1, a2: ath2 },
      divisions: { [div.id]: div },
    });

    await useTournamentStore.getState().lockAndGenerateBracket(div.id);
    const boutId = Object.keys(useTournamentStore.getState().bouts)[0];

    const result: BoutResult = {
      winnerCorner: 'RED',
      winnerAthleteId: 'a1',
      loserAthleteId: 'a2',
      redScore: 10,
      blueScore: 0,
      victoryType: 'VSU',
      redClassificationPts: 4,
      blueClassificationPts: 0,
      completedAt: Date.now(),
    };

    await useTournamentStore.getState().completeBout(boutId, result);

    const completed = useTournamentStore.getState().bouts[boutId];
    expect(completed.status).toBe('COMPLETED');
    expect(completed.result?.winnerAthleteId).toBe('a1');
    expect(completed.result?.victoryType).toBe('VSU');
  });

  it('auto-populates a valid numbered boutNumber (not BOUT or BOUT 0) even when loaded before generateMasterOrderOfBouts', async () => {
    const div: CategoryDivision = {
      id: 'FS_SENIOR_86 KG',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '86 KG',
      athleteIds: ['a1', 'a2'],
      format: 'SINGLE_BOUT',
      assignedMat: 'MAT A',
      isDrawLocked: false,
    };
    const ath1: Athlete = {
      id: 'a1',
      name: 'Umar Nugraha',
      region: 'Lampung Barat',
      regionCode: 'LBR',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '86 KG',
      drawNumber: 1,
    };
    const ath2: Athlete = {
      id: 'a2',
      name: 'Vino Mahendra',
      region: 'Lampung Selatan',
      regionCode: 'LSL',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '86 KG',
      drawNumber: 2,
    };

    useTournamentStore.setState({
      athletes: { a1: ath1, a2: ath2 },
      divisions: { [div.id]: div },
    });

    await useTournamentStore.getState().lockAndGenerateBracket(div.id);
    const boutId = Object.keys(useTournamentStore.getState().bouts)[0];

    // Load langsung tanpa memanggil generateMasterOrderOfBouts terlebih dahulu
    useTournamentStore.getState().loadBoutToMatch(boutId);

    const match = useMatchStore.getState().match;
    expect(match.metadata.boutNumber).toBe('BOUT 1');
  });

  it('saveAndLoadNextBout completes active tournament bout, preserves bout queue, and loads next bout automatically', async () => {
    const athletes: Record<string, Athlete> = {
      a1: {
        id: 'a1',
        name: 'Pegulat 1',
        region: 'LAMPUNG BARAT',
        regionCode: 'LBR',
        style: 'FS',
        ageCategory: 'SENIOR',
        weightClass: '74 KG',
        drawNumber: 1,
      },
      a2: {
        id: 'a2',
        name: 'Pegulat 2',
        region: 'LAMPUNG SELATAN',
        regionCode: 'LSL',
        style: 'FS',
        ageCategory: 'SENIOR',
        weightClass: '74 KG',
        drawNumber: 2,
      },
      a3: {
        id: 'a3',
        name: 'Pegulat 3',
        region: 'PRINGSEWU',
        regionCode: 'PRW',
        style: 'FS',
        ageCategory: 'SENIOR',
        weightClass: '74 KG',
        drawNumber: 3,
      },
      a4: {
        id: 'a4',
        name: 'Pegulat 4',
        region: 'METRO',
        regionCode: 'MTR',
        style: 'FS',
        ageCategory: 'SENIOR',
        weightClass: '74 KG',
        drawNumber: 4,
      },
    };

    const div: CategoryDivision = {
      id: 'FS_SENIOR_74 KG',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      athleteIds: ['a1', 'a2', 'a3', 'a4'],
      format: 'NORDIC',
      assignedMat: 'MAT A',
      isDrawLocked: false,
    };

    useTournamentStore.setState({
      athletes,
      divisions: { [div.id]: div },
    });

    await useTournamentStore.getState().lockAndGenerateBracket(div.id);
    await useTournamentStore.getState().generateMasterOrderOfBouts();

    const order = useTournamentStore.getState().orderOfBouts;
    expect(order.length).toBe(6);

    // Load partai 1 & beri skor
    useTournamentStore.getState().loadBoutToMatch(order[0]);
    useMatchStore.getState().addPoints('RED', 4);

    // Klik Save & Next Bout
    const res = await useTournamentStore.getState().saveAndLoadNextBout();
    expect(res.loadedNext).toBe(true);
    expect(res.nextBoutId).toBe(order[1]);

    // Daftar partai tetap utuh dan Bout 1 tercatat COMPLETED
    const tStore = useTournamentStore.getState();
    expect(Object.keys(tStore.bouts).length).toBe(6);
    expect(tStore.bouts[order[0]].status).toBe('COMPLETED');
    expect(tStore.bouts[order[0]].result?.redScore).toBe(4);
    expect(tStore.bouts[order[1]].status).toBe('IN_PROGRESS');
    expect(tStore.bouts[order[2]].status).toBe('ON_DECK');

    // Controller & TV otomatis bergeser ke Bout 2
    const nextMatch = useMatchStore.getState().match;
    expect(nextMatch.activeBoutId).toBe(order[1]);
    expect(nextMatch.metadata.boutNumber).toBe('BOUT 2');
    expect(nextMatch.red.score).toBe(0);
    expect(nextMatch.blue.score).toBe(0);
    expect(nextMatch.phase).toBe('PRE_MATCH');
    expect(nextMatch.red.name.length).toBeGreaterThan(0);
    expect(nextMatch.blue.name.length).toBeGreaterThan(0);
  });
});
