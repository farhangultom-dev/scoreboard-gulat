import { describe, it, expect } from 'vitest';
import {
  buildBracketPdfFilename,
  computeEliminationPdfLayout,
  formatPdfTimestamp,
  formatUwwAthleteLabel,
  formatUwwDocumentTitle,
  formatUwwResultLine,
  getNonTechnicalLossBadge,
  PDF_CONTENT_BOTTOM_Y,
  PDF_TREE_START_Y,
} from './bracketPdfLayout';
import { generateDivisionBouts } from './uwwBracketEngine';
import { Athlete, BoutResult, CategoryDivision } from '../types/tournament';

function makeAthletes(count: number, weightClass = '57 KG'): Athlete[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `ath_${idx + 1}`,
    name: `Wrestler ${idx + 1}`,
    region: `REGION ${idx + 1}`,
    regionCode: `R${String(idx + 1).padStart(2, '0')}`,
    style: 'FS',
    ageCategory: 'SENIOR',
    weightClass,
    seed: idx < 4 ? idx + 1 : undefined,
    drawNumber: idx + 1,
  }));
}

function makeDivision(
  id: string,
  format: CategoryDivision['format'],
  weightClass = '57 KG'
): CategoryDivision {
  return {
    id,
    style: 'FS',
    ageCategory: 'SENIOR',
    weightClass,
    athleteIds: [],
    format,
    assignedMat: 'MAT A',
    isDrawLocked: true,
  };
}

describe('bracketPdfLayout - UWW Official Arena PDF Formatting & Tree Layout', () => {
  it('formats UWW document title, timestamp, and safe PDF filename', () => {
    const div = makeDivision('div_57', 'ELIMINATION_REPECHAGE', '57 KG');
    expect(formatUwwDocumentTitle(div)).toBe('Seniors - FS - 57 kg');
    expect(buildBracketPdfFilename(div)).toBe('Bracket_FS_SENIOR_57KG.pdf');
    expect(buildBracketPdfFilename(div, true)).toBe('Bracket_FS_SENIOR_57KG_DRAFT.pdf');

    const dt = new Date(2026, 10, 6, 16, 56, 43); // 2026 Nov 06 16:56:43
    expect(formatPdfTimestamp(dt)).toBe('2026 Nov 06 16:56:43');
  });

  it('formats athlete label with TS seed or drawNumber and truncates long names safely', () => {
    const seeded: Athlete = {
      id: 'a1',
      name: 'Han C.',
      region: 'Lampung',
      regionCode: 'PRK',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '57 KG',
      seed: 1,
      drawNumber: 1,
    };
    expect(formatUwwAthleteLabel(seeded)).toBe('PRK HAN C. (TS 1)');

    const unseeded: Athlete = {
      ...seeded,
      id: 'a2',
      name: 'Karachov A.',
      regionCode: 'KGZ',
      seed: undefined,
      drawNumber: 13,
    };
    expect(formatUwwAthleteLabel(unseeded)).toBe('KGZ KARACHOV A. (13)');

    const longName: Athlete = {
      ...unseeded,
      name: 'MUHAMMAD ABDURRAHMAN AL FARUQ',
    };
    const formattedLong = formatUwwAthleteLabel(longName, undefined, 22);
    expect(formattedLong.length).toBeLessThanOrEqual(22);
    expect(formattedLong.endsWith('(13)')).toBe(true);
  });

  it('formats UWW result lines and detects INJ / FFT / DSQ loss badges', () => {
    const baseResult: BoutResult = {
      winnerCorner: 'RED',
      winnerAthleteId: 'a1',
      loserAthleteId: 'a2',
      redScore: 10,
      blueScore: 2,
      victoryType: 'VFA',
      redClassificationPts: 5,
      blueClassificationPts: 0,
      completedAt: Date.now(),
    };

    expect(formatUwwResultLine(baseResult)).toBe('5-0(10-2) by VFA');
    expect(getNonTechnicalLossBadge('VFA')).toBeNull();
    expect(getNonTechnicalLossBadge('VIN')).toBe('INJ');
    expect(getNonTechnicalLossBadge('VFO')).toBe('FFT');
    expect(getNonTechnicalLossBadge('DSQ')).toBe('DSQ');

    const blueWin: BoutResult = {
      winnerCorner: 'BLUE',
      winnerAthleteId: 'a2',
      loserAthleteId: 'a1',
      redScore: 1,
      blueScore: 8,
      victoryType: 'VPO1',
      redClassificationPts: 1,
      blueClassificationPts: 3,
      completedAt: Date.now(),
    };
    expect(formatUwwResultLine(blueWin)).toBe('3-1(8-1) by VPO1');
  });

  it('computes single-page non-overlapping elimination layout for N = 8 and N = 16', () => {
    for (const n of [8, 16]) {
      const div = makeDivision(`div_${n}`, 'ELIMINATION_REPECHAGE');
      const bouts = generateDivisionBouts(div, makeAthletes(n));
      const layout = computeEliminationPdfLayout(bouts);

      expect(layout.pageCount).toBe(1);
      expect(layout.repechagePage).toBe(1);
      expect(layout.columns.map((c) => c.label)).toEqual(
        n === 8
          ? ['1/4 Final', '1/2 Final', 'Final 1-2']
          : ['1/8 Final', '1/4 Final', '1/2 Final', 'Final 1-2']
      );

      // Pastikan seluruh node dalam batas kertas A4 dan tidak tumpang tindih pada kolom yang sama
      layout.mainNodes.forEach((node) => {
        expect(node.topY).toBeGreaterThanOrEqual(PDF_TREE_START_Y - 2);
        expect(node.bottomY).toBeLessThanOrEqual(PDF_CONTENT_BOTTOM_Y);
        expect(node.bottomY).toBeGreaterThan(node.topY);
      });

      const byCol = new Map<number, typeof layout.mainNodes>();
      layout.mainNodes.forEach((node) => {
        const list = byCol.get(node.columnIndex) || [];
        list.push(node);
        byCol.set(node.columnIndex, list);
      });
      byCol.forEach((list) => {
        const sorted = [...list].sort((a, b) => a.topY - b.topY);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].topY).toBeGreaterThan(sorted[i - 1].bottomY);
        }
      });

      // Kedua jalur perunggu/repechage (TOP & BOTTOM) harus tersedia
      expect(layout.repechagePaths).toHaveLength(2);
    }
  });

  it('aligns Qualif. bouts and chains 2-round Repechage for N = 18 cleanly', () => {
    const div = makeDivision('div_18', 'ELIMINATION_REPECHAGE');
    const bouts = generateDivisionBouts(div, makeAthletes(18));
    const layout = computeEliminationPdfLayout(bouts);

    expect(layout.columns.map((c) => c.label)).toEqual([
      'Qualif.',
      '1/8 Final',
      '1/4 Final',
      '1/2 Final',
      'Final 1-2',
    ]);

    const qualNodes = layout.mainNodes.filter((n) => n.bout.round === 'QUALIFICATION');
    expect(qualNodes).toHaveLength(2);

    // Setiap Qualif harus sejajar dengan slot target di 1/8 Final
    qualNodes.forEach((qn) => {
      const target = layout.mainNodes.find((n) => n.bout.id === qn.bout.nextWinBoutId);
      expect(target).toBeDefined();
      const expectedAnchor =
        qn.bout.nextWinSlot === 'BLUE' ? target!.bottomY : target!.topY;
      expect(Math.abs(qn.midY - expectedAnchor)).toBeLessThan(0.01);
    });

    // Jalur Repechage memiliki 2 kolom Repechage + 1 kolom Final 3-5 = 3 node per sisi
    expect(layout.repechagePaths).toHaveLength(2);
    expect(layout.repechagePaths[0].columns.map((c) => c.label)).toEqual([
      'Repechage',
      'Repechage',
      'Final 3-5',
    ]);
  });

  it('splits B = 32 (N = 32) cleanly into 2 A4 pages with 1/16 Final through Final 1-2', () => {
    const div = makeDivision('div_32', 'ELIMINATION_REPECHAGE');
    const bouts = generateDivisionBouts(div, makeAthletes(32));
    const layout = computeEliminationPdfLayout(bouts);

    expect(layout.pageCount).toBe(2);
    expect(layout.repechagePage).toBe(2);
    expect(layout.columns.map((c) => c.label)).toEqual([
      '1/16 Final',
      '1/8 Final',
      '1/4 Final',
      '1/2 Final',
      'Final 1-2',
    ]);

    const page1R32 = layout.mainNodes.filter(
      (n) => n.page === 1 && n.bout.round === 'ROUND_OF_32'
    );
    const page2R32 = layout.mainNodes.filter(
      (n) => n.page === 2 && n.bout.round === 'ROUND_OF_32'
    );
    expect(page1R32).toHaveLength(8);
    expect(page2R32).toHaveLength(8);
  });
});
