import { describe, it, expect } from 'vitest';
import {
  getBallSlotMetadata,
  validateManualDraw,
  buildDraftBracketPreview,
} from './uwwManualDraw';
import { generateDivisionBouts } from './uwwBracketEngine';
import {
  Athlete,
  CategoryDivision,
  DivisionFormat,
} from '../types/tournament';

function createTestAthletes(
  count: number,
  drawNumbers?: Array<number | undefined>
): Athlete[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `ath_${idx + 1}`,
    name: `Pegulat #${idx + 1}`,
    region: `KONTINGEN ${idx + 1}`,
    regionCode: `K${idx + 1}`,
    style: 'FS',
    ageCategory: 'SENIOR',
    weightClass: '74 KG',
    drawNumber: drawNumbers ? drawNumbers[idx] : idx + 1,
  }));
}

function createTestDivision(format: DivisionFormat): CategoryDivision {
  return {
    id: `div_${format}`,
    style: 'FS',
    ageCategory: 'SENIOR',
    weightClass: '74 KG',
    athleteIds: [],
    format,
    assignedMat: 'MAT A',
    isDrawLocked: false,
  };
}

describe('uwwManualDraw - Step 1: Validator Manual Draw & Helper Pemetaan Slot Bola', () => {
  it('1. getBallSlotMetadata memetakan N=2 (SINGLE_BOUT) dan N=4 (NORDIC) dengan benar', () => {
    const metaN2 = getBallSlotMetadata(2, 'SINGLE_BOUT');
    expect(metaN2).toHaveLength(2);
    expect(metaN2[0].ballNumber).toBe(1);
    expect(metaN2[0].zone).toBe('MAIN');
    expect(metaN2[0].slotDescription).toContain('Merah');
    expect(metaN2[1].ballNumber).toBe(2);
    expect(metaN2[1].zone).toBe('MAIN');
    expect(metaN2[1].slotDescription).toContain('Biru');

    const metaN4 = getBallSlotMetadata(4, 'NORDIC');
    expect(metaN4).toHaveLength(4);
    expect(metaN4.every((m) => m.zone === 'NORDIC' && m.zoneLabel === 'NORDIC')).toBe(
      true
    );
    expect(metaN4.map((m) => m.ballNumber)).toEqual([1, 2, 3, 4]);
  });

  it('2. getBallSlotMetadata memetakan N=6 dan N=7 (GROUP_CROSS) ke POOL A (#1..#ceil(N/2)) dan POOL B (#(ceil(N/2)+1)..#N)', () => {
    // N = 6: #1-#3 Pool A, #4-#6 Pool B
    const metaN6 = getBallSlotMetadata(6, 'GROUP_CROSS');
    expect(metaN6).toHaveLength(6);
    expect(metaN6.slice(0, 3).map((m) => m.zone)).toEqual([
      'POOL_A',
      'POOL_A',
      'POOL_A',
    ]);
    expect(metaN6.slice(0, 3).map((m) => m.zoneLabel)).toEqual([
      'POOL A',
      'POOL A',
      'POOL A',
    ]);
    expect(metaN6.slice(3).map((m) => m.zone)).toEqual([
      'POOL_B',
      'POOL_B',
      'POOL_B',
    ]);
    expect(metaN6.slice(3).map((m) => m.zoneLabel)).toEqual([
      'POOL B',
      'POOL B',
      'POOL B',
    ]);

    // N = 7: #1-#4 Pool A, #5-#7 Pool B
    const metaN7 = getBallSlotMetadata(7, 'GROUP_CROSS');
    expect(metaN7).toHaveLength(7);
    expect(metaN7.slice(0, 4).every((m) => m.zone === 'POOL_A')).toBe(true);
    expect(metaN7.slice(4).every((m) => m.zone === 'POOL_B')).toBe(true);
  });

  it('3. getBallSlotMetadata untuk N=11 menghasilkan tepat 5 label BYE (#1–#5) dan 6 label QUAL (#6–#11)', () => {
    const metaN11 = getBallSlotMetadata(11, 'ELIMINATION_REPECHAGE');
    expect(metaN11).toHaveLength(11);

    const byes = metaN11.filter((m) => m.zone === 'BYE');
    const quals = metaN11.filter((m) => m.zone === 'QUAL');

    expect(byes).toHaveLength(5);
    expect(byes.map((m) => m.ballNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(byes.every((m) => m.zoneLabel === 'BYE')).toBe(true);

    expect(quals).toHaveLength(6);
    expect(quals.map((m) => m.ballNumber)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(quals.every((m) => m.zoneLabel === 'QUAL')).toBe(true);
    expect(quals[0].slotDescription).toContain('Kualifikasi #1 (Merah)');
    expect(quals[1].slotDescription).toContain('Kualifikasi #1 (Biru)');
    expect(quals[4].slotDescription).toContain('Kualifikasi #3 (Merah)');
    expect(quals[5].slotDescription).toContain('Kualifikasi #3 (Biru)');
  });

  it('4. getBallSlotMetadata untuk N=10 menghasilkan tepat 6 label BYE (#1–#6) dan 4 label QUAL (#7–#10)', () => {
    const metaN10 = getBallSlotMetadata(10, 'ELIMINATION_REPECHAGE');
    expect(metaN10).toHaveLength(10);

    const byes = metaN10.filter((m) => m.zone === 'BYE');
    const quals = metaN10.filter((m) => m.zone === 'QUAL');

    expect(byes).toHaveLength(6);
    expect(byes.map((m) => m.ballNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(quals).toHaveLength(4);
    expect(quals.map((m) => m.ballNumber)).toEqual([7, 8, 9, 10]);
  });

  it('5. getBallSlotMetadata untuk N=8 dan N=16 tidak menghasilkan label BYE maupun QUAL (seluruhnya MAIN)', () => {
    const metaN8 = getBallSlotMetadata(8, 'ELIMINATION_REPECHAGE');
    expect(metaN8).toHaveLength(8);
    expect(metaN8.some((m) => m.zone === 'BYE' || m.zone === 'QUAL')).toBe(false);
    expect(metaN8.every((m) => m.zone === 'MAIN' && m.zoneLabel === 'MAIN')).toBe(
      true
    );

    const metaN16 = getBallSlotMetadata(16, 'ELIMINATION_REPECHAGE');
    expect(metaN16).toHaveLength(16);
    expect(metaN16.some((m) => m.zone === 'BYE' || m.zone === 'QUAL')).toBe(false);
    expect(metaN16.every((m) => m.zone === 'MAIN' && m.zoneLabel === 'MAIN')).toBe(
      true
    );
  });

  it('6. validateManualDraw mengesahkan undian lengkap 1..N dan menangkap nomor kosong (missing)', () => {
    const completeAthletes = createTestAthletes(5, [3, 1, 5, 2, 4]);
    const validRes = validateManualDraw(completeAthletes);
    expect(validRes.isValid).toBe(true);
    expect(validRes.totalAthletes).toBe(5);
    expect(validRes.assignedCount).toBe(5);
    expect(validRes.missingAthleteIds).toEqual([]);
    expect(validRes.duplicateNumbers).toEqual([]);
    expect(validRes.outOfRangeAthleteIds).toEqual([]);
    expect(validRes.availableNumbers).toEqual([]);

    const missingAthletes = createTestAthletes(5, [1, undefined, 3, undefined, 5]);
    const missingRes = validateManualDraw(missingAthletes);
    expect(missingRes.isValid).toBe(false);
    expect(missingRes.assignedCount).toBe(3);
    expect(missingRes.missingAthleteIds).toEqual(['ath_2', 'ath_4']);
    expect(missingRes.availableNumbers).toEqual([2, 4]);
  });

  it('7. validateManualDraw menangkap nomor bola ganda (duplikat) dan menampilkan sisa bola tersedia', () => {
    const dupAthletes = createTestAthletes(6, [1, 4, 2, 4, 6, 2]);
    const dupRes = validateManualDraw(dupAthletes);

    expect(dupRes.isValid).toBe(false);
    expect(dupRes.assignedCount).toBe(6);
    expect(dupRes.duplicateNumbers).toEqual([2, 4]);
    expect(dupRes.availableNumbers).toEqual([3, 5]);
  });

  it('8. validateManualDraw menangkap nomor di luar rentang (0, negatif, N+1, atau pecahan)', () => {
    const outAthletes = createTestAthletes(4, [0, 2, 5, -1]);
    const outRes = validateManualDraw(outAthletes);

    expect(outRes.isValid).toBe(false);
    expect(outRes.outOfRangeAthleteIds).toEqual(['ath_1', 'ath_3', 'ath_4']);
    expect(outRes.availableNumbers).toEqual([1, 3, 4]);
  });

  it('9. generateDivisionBouts melempar error deskriptif bila drawNumber tidak valid dan 100% deterministik bila valid', () => {
    const div = createTestDivision('ELIMINATION_REPECHAGE');

    // Harus gagal bila ada nomor bola kosong atau duplikat
    const invalidAthletes = createTestAthletes(8, [1, 2, 2, 4, 5, 6, 7, undefined]);
    expect(() => generateDivisionBouts(div, invalidAthletes)).toThrow(
      /Validasi undian manual tidak sah/i
    );

    // Harus 100% deterministik walaupun urutan array input diacak, selama drawNumber tiap atlet sama
    const baseAthletes = createTestAthletes(11, [11, 2, 9, 4, 7, 6, 5, 8, 3, 10, 1]);
    const reversedInput = [...baseAthletes].reverse();

    const run1 = generateDivisionBouts(div, baseAthletes);
    const run2 = generateDivisionBouts(div, reversedInput);
    const run3 = generateDivisionBouts(div, baseAthletes);

    expect(run1).toEqual(run2);
    expect(run1).toEqual(run3);

    // Pastikan pasangan Kualifikasi #1 adalah pemilik bola #6 (ath_6) vs bola #7 (ath_5)
    const qual1 = run1.find(
      (b) => b.round === 'QUALIFICATION' && b.bracketPosition === 1
    );
    expect(qual1?.redAthleteId).toBe('ath_6'); // drawNumber 6
    expect(qual1?.blueAthleteId).toBe('ath_5'); // drawNumber 7
  });

  it('10. buildDraftBracketPreview merender pratinjau bagan dengan "Menunggu Bola #X" untuk slot yang belum terisi', () => {
    const div = createTestDivision('ELIMINATION_REPECHAGE');
    // Hanya bola #1 (ath_1) dan bola #6 (ath_6) yang sudah ditarik dari 11 atlet
    const partialAthletes = createTestAthletes(11, [
      1,
      undefined,
      undefined,
      undefined,
      undefined,
      6,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    const draftBouts = buildDraftBracketPreview(div, partialAthletes);
    expect(draftBouts.length).toBeGreaterThan(0);

    // QF #1 mempertemukan Bola #1 (ath_1) vs Bola #2 (belum terisi -> "Menunggu Bola #2")
    const qf1 = draftBouts.find(
      (b) => b.round === 'QUARTERFINAL' && b.bracketPosition === 1
    );
    expect(qf1?.redAthleteId).toBe('ath_1');
    expect(qf1?.blueAthleteId).toBeNull();
    expect(qf1?.blueSourceLabel).toBe('Menunggu Bola #2');
    expect(qf1?.status).toBe('TBD');

    // Qual #1 mempertemukan Bola #6 (ath_6) vs Bola #7 (belum terisi -> "Menunggu Bola #7")
    const qual1 = draftBouts.find(
      (b) => b.round === 'QUALIFICATION' && b.bracketPosition === 1
    );
    expect(qual1?.redAthleteId).toBe('ath_6');
    expect(qual1?.blueAthleteId).toBeNull();
    expect(qual1?.blueSourceLabel).toBe('Menunggu Bola #7');
    expect(qual1?.status).toBe('TBD');
  });
});
