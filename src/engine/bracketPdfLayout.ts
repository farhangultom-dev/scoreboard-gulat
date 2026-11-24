import { AgeCategory, VictoryType } from '../types/match';
import {
  Athlete,
  BoutResult,
  BoutRound,
  CategoryDivision,
  TournamentBout,
} from '../types/tournament';

// ============================================================================
// Konstanta Dimensi Halaman A4 Portrait (dalam milimeter)
// ============================================================================
export const PDF_PAGE_WIDTH = 210;
export const PDF_PAGE_HEIGHT = 297;
export const PDF_MARGIN_X = 8;
export const PDF_MARGIN_TOP = 8;
export const PDF_MARGIN_BOTTOM = 10;
export const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN_X * 2; // 194 mm
export const PDF_HEADER_HEIGHT = 9.5;
export const PDF_PILL_Y = PDF_MARGIN_TOP + PDF_HEADER_HEIGHT + 1.5; // 19 mm
export const PDF_PILL_HEIGHT = 6;
export const PDF_TREE_START_Y = PDF_PILL_Y + PDF_PILL_HEIGHT + 5; // 30 mm
export const PDF_FOOTER_Y = PDF_PAGE_HEIGHT - PDF_MARGIN_BOTTOM; // 287 mm
export const PDF_CONTENT_BOTTOM_Y = PDF_FOOTER_Y - 4; // 283 mm

export const PDF_CONNECTOR_WIDTH = 5.2;
export const PDF_COL_GAP = 1.4;
export const PDF_ROW_BAR_HEIGHT = 4.4;

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MAIN_ROUND_SEQUENCE: BoutRound[] = [
  'QUALIFICATION',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTERFINAL',
  'SEMIFINAL',
  'GOLD_FINAL',
];

/**
 * Mengonversi AgeCategory ke format label resmi UWW Arena (misal: SENIOR -> "Seniors").
 */
export function formatUwwAgeCategory(ageCategory: AgeCategory | string): string {
  const upper = (ageCategory || 'SENIOR').toUpperCase();
  if (upper === 'SENIOR') return 'Seniors';
  return upper;
}

/**
 * Mengonversi WeightClass ke format huruf kecil "kg" seperti referensi UWW (misal: "57 KG" -> "57 kg").
 */
export function formatUwwWeightLabel(weightClass: string): string {
  const cleaned = (weightClass || '').trim();
  const digits = cleaned.replace(/\s*kg$/i, '').trim();
  return digits ? `${digits} kg` : cleaned;
}

/**
 * Judul dokumen di tengah header (contoh: "Seniors - FS - 57 kg").
 */
export function formatUwwDocumentTitle(
  division: Pick<CategoryDivision, 'ageCategory' | 'style' | 'weightClass'>
): string {
  return `${formatUwwAgeCategory(division.ageCategory)} - ${division.style} - ${formatUwwWeightLabel(
    division.weightClass
  )}`;
}

/**
 * Format timestamp UWW Arena (contoh: "2026 Nov 22 16:45:00").
 */
export function formatPdfTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mmm = MONTHS_SHORT[date.getMonth()] || 'Jan';
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy} ${mmm} ${dd} ${hh}:${mm}:${ss}`;
}

/**
 * Nama kolom babak untuk bar pil hitam UWW Arena.
 */
export function getUwwRoundColumnLabel(round: BoutRound): string {
  switch (round) {
    case 'QUALIFICATION':
      return 'Qualif.';
    case 'ROUND_OF_32':
      return '1/16 Final';
    case 'ROUND_OF_16':
      return '1/8 Final';
    case 'QUARTERFINAL':
      return '1/4 Final';
    case 'SEMIFINAL':
      return '1/2 Final';
    case 'GOLD_FINAL':
      return 'Final 1-2';
    case 'REPECHAGE_1':
    case 'REPECHAGE_2':
      return 'Repechage';
    case 'BRONZE_1':
    case 'BRONZE_2':
      return 'Final 3-5';
    case 'GROUP_A':
      return 'Pool A';
    case 'GROUP_B':
      return 'Pool B';
    case 'NORDIC_R1':
      return 'Round 1';
    case 'NORDIC_R2':
      return 'Round 2';
    case 'NORDIC_R3':
      return 'Round 3';
    case 'NORDIC_R4':
      return 'Round 4';
    case 'NORDIC_R5':
      return 'Round 5';
    default:
      return String(round);
  }
}

/**
 * Format label atlet gaya UWW Arena: "<REGION> <NAME> (<TS seed | drawNumber>)".
 * Contoh: "LPG UMAR NUGRAHA (TS 1)" atau "JBR BUDI SANTOSO (12)".
 */
export function formatUwwAthleteLabel(
  athlete?: Athlete | null,
  fallbackLabel?: string,
  maxChars = 28
): string {
  if (!athlete) {
    return fallbackLabel ? fallbackLabel.slice(0, maxChars) : '';
  }

  const suffix = athlete.seed
    ? `(TS ${athlete.seed})`
    : athlete.drawNumber !== undefined && athlete.drawNumber !== null
    ? `(${athlete.drawNumber})`
    : '';

  const region = (athlete.regionCode || '').trim().toUpperCase();
  const rawName = (athlete.name || '').trim().toUpperCase();

  const prefix = region ? `${region} ` : '';
  const suffixWithSpace = suffix ? ` ${suffix}` : '';
  const availableForName = Math.max(
    6,
    maxChars - prefix.length - suffixWithSpace.length
  );

  const displayName =
    rawName.length > availableForName
      ? `${rawName.slice(0, availableForName - 1)}.`
      : rawName;

  return `${prefix}${displayName}${suffixWithSpace}`.trim();
}

/**
 * Format baris skor & tipe kemenangan UWW:
 * "<CP_Win>-<CP_Lose>(<TP_Win>-<TP_Lose>) by <VictoryType>"
 * Contoh: "3-1(8-1) by VPO1", "4-0(10-0) by VSU", "5-0(10-2) by VFA".
 */
export function formatUwwResultLine(result?: BoutResult | null): string {
  if (!result) return '';
  const isRedWinner = result.winnerCorner === 'RED';
  const winCp = isRedWinner
    ? result.redClassificationPts
    : result.blueClassificationPts;
  const loseCp = isRedWinner
    ? result.blueClassificationPts
    : result.redClassificationPts;
  const winTp = isRedWinner ? result.redScore : result.blueScore;
  const loseTp = isRedWinner ? result.blueScore : result.redScore;

  return `${winCp}-${loseCp}(${winTp}-${loseTp}) by ${result.victoryType}`;
}

/**
 * Mengembalikan badge merah kecil ala UWW untuk kekalahan non-teknis (INJ / FFT / DSQ).
 */
export function getNonTechnicalLossBadge(
  victoryType?: VictoryType | null
): 'INJ' | 'FFT' | 'DSQ' | null {
  switch (victoryType) {
    case 'VIN':
      return 'INJ';
    case 'VFO':
      return 'FFT';
    case 'DSQ':
      return 'DSQ';
    default:
      return null;
  }
}

/**
 * Menghasilkan nama file PDF aman dan terstandar untuk satu kelas.
 * Contoh: "Bracket_FS_SENIOR_57KG.pdf"
 */
export function buildBracketPdfFilename(
  division: Pick<CategoryDivision, 'style' | 'ageCategory' | 'weightClass'>,
  isDraft = false
): string {
  const sanitize = (str: string) =>
    str
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const weightToken = sanitize(division.weightClass).replace(/_KG$/, 'KG');
  const draftSuffix = isDraft ? '_DRAFT' : '';
  return `Bracket_${sanitize(division.style)}_${sanitize(
    division.ageCategory
  )}_${weightToken}${draftSuffix}.pdf`;
}

// ============================================================================
// Pure Layout Engine untuk Bagan Eliminasi & Repechage UWW Arena
// ============================================================================

export interface PdfColumnSpec {
  round: BoutRound;
  label: string;
  x: number;
  width: number;
}

export interface PdfBoutNodeLayout {
  bout: TournamentBout;
  page: 1 | 2;
  columnIndex: number;
  x: number;
  width: number;
  topY: number;
  bottomY: number;
  midY: number;
  /** Menandai bila batang konektor diteruskan ke/dari halaman lain (misal Final 1-2 pada B=32) */
  bridgesAcrossPages?: boolean;
}

export interface PdfRepechagePathLayout {
  side: 'TOP' | 'BOTTOM';
  columns: Array<{ label: string; x: number; width: number }>;
  nodes: PdfBoutNodeLayout[];
  startY: number;
  height: number;
}

export interface EliminationPdfLayout {
  pageCount: 1 | 2;
  columns: PdfColumnSpec[];
  mainNodes: PdfBoutNodeLayout[];
  repechagePage: 1 | 2;
  repechagePaths: PdfRepechagePathLayout[];
  mainMaxYPage1: number;
}

/**
 * Menghitung posisi deterministik seluruh partai pada format ELIMINATION_REPECHAGE
 * (serta kompatibel untuk SINGLE_BOUT) dalam koordinat milimeter A4 Portrait.
 */
export function computeEliminationPdfLayout(
  bouts: TournamentBout[]
): EliminationPdfLayout {
  const mainBoutsOnly = bouts.filter((b) =>
    MAIN_ROUND_SEQUENCE.includes(b.round)
  );

  // Tentukan kolom babak utama yang hadir
  const presentRounds = MAIN_ROUND_SEQUENCE.filter((rnd) =>
    mainBoutsOnly.some((b) => b.round === rnd)
  );

  const columns: PdfColumnSpec[] = [];
  const colCount = Math.max(1, presentRounds.length);
  const totalGaps = Math.max(0, colCount - 1) * PDF_COL_GAP;
  const colWidth = (PDF_CONTENT_WIDTH - totalGaps) / colCount;

  presentRounds.forEach((rnd, idx) => {
    columns.push({
      round: rnd,
      label: getUwwRoundColumnLabel(rnd),
      x: PDF_MARGIN_X + idx * (colWidth + PDF_COL_GAP),
      width: colWidth,
    });
  });

  const colIndexByRound = new Map<BoutRound, number>();
  presentRounds.forEach((rnd, idx) => colIndexByRound.set(rnd, idx));

  // Babak dasar = kolom pertama selain QUALIFICATION
  const hasQual = presentRounds.includes('QUALIFICATION');
  const baseRound = presentRounds.find((r) => r !== 'QUALIFICATION') || presentRounds[0];
  const baseBouts = mainBoutsOnly
    .filter((b) => b.round === baseRound)
    .sort((a, b) => a.bracketPosition - b.bracketPosition);

  const isSplitTwoPages = baseBouts.length > 8; // B = 32 (16 partai R32 -> 8 per halaman)

  const mainNodes: PdfBoutNodeLayout[] = [];
  const nodeByBoutId = new Map<string, PdfBoutNodeLayout>();

  // Helper membangun setengah atau seluruh tree baseBouts pada 1 halaman
  const layoutBaseSlice = (
    sliceBouts: TournamentBout[],
    page: 1 | 2,
    availableHeight: number
  ) => {
    const count = Math.max(1, sliceBouts.length);
    const pitch = availableHeight / count;
    const baseGap = Math.min(20, Math.max(9.5, pitch * 0.56));
    const baseColIdx = colIndexByRound.get(baseRound) ?? 0;
    const baseCol = columns[baseColIdx];

    sliceBouts.forEach((bout, idx) => {
      const bandTop = PDF_TREE_START_Y + idx * pitch;
      const topY = bandTop + (pitch - baseGap) * 0.35;
      const bottomY = topY + baseGap;
      const midY = (topY + bottomY) / 2;

      const node: PdfBoutNodeLayout = {
        bout,
        page,
        columnIndex: baseColIdx,
        x: baseCol.x,
        width: baseCol.width,
        topY,
        bottomY,
        midY,
      };
      mainNodes.push(node);
      nodeByBoutId.set(bout.id, node);
    });

    // Jika ada babak QUALIFICATION, posisikan setiap partai Qual tepat sejajar dengan slot targetnya
    if (hasQual) {
      const qualColIdx = colIndexByRound.get('QUALIFICATION') ?? 0;
      const qualCol = columns[qualColIdx];
      const qualHalfGap = Math.min(4.4, Math.max(2.9, baseGap * 0.28));

      const qualBouts = mainBoutsOnly
        .filter((b) => b.round === 'QUALIFICATION')
        .sort((a, b) => a.bracketPosition - b.bracketPosition);

      qualBouts.forEach((qBout) => {
        const targetNode = qBout.nextWinBoutId
          ? nodeByBoutId.get(qBout.nextWinBoutId)
          : undefined;
        if (!targetNode || targetNode.page !== page) return;

        const anchorY =
          qBout.nextWinSlot === 'BLUE' ? targetNode.bottomY : targetNode.topY;
        const qTopY = Math.max(PDF_TREE_START_Y - 1, anchorY - qualHalfGap);
        const qBottomY = anchorY + qualHalfGap;

        const qNode: PdfBoutNodeLayout = {
          bout: qBout,
          page,
          columnIndex: qualColIdx,
          x: qualCol.x,
          width: qualCol.width,
          topY: qTopY,
          bottomY: qBottomY,
          midY: anchorY,
        };
        mainNodes.push(qNode);
        nodeByBoutId.set(qBout.id, qNode);
      });
    }
  };

  if (isSplitTwoPages) {
    // B = 32: Paruh Atas (8 partai R32) di Hal. 1, Paruh Bawah (8 partai R32) di Hal. 2
    const half = Math.ceil(baseBouts.length / 2);
    layoutBaseSlice(baseBouts.slice(0, half), 1, 240);
    layoutBaseSlice(baseBouts.slice(half), 2, 138);
  } else {
    // B = 8 atau B = 16: seluruh baseBouts di Halaman 1
    const baseHeight =
      baseBouts.length <= 1
        ? 44
        : baseBouts.length <= 4
        ? 140
        : hasQual
        ? 176
        : 162;
    layoutBaseSlice(baseBouts, 1, baseHeight);
  }

  // Bangun kolom babak berikutnya (setelah baseRound)
  const baseColIdx = colIndexByRound.get(baseRound) ?? 0;
  for (let c = baseColIdx + 1; c < presentRounds.length; c++) {
    const rnd = presentRounds[c];
    const col = columns[c];
    const roundBouts = mainBoutsOnly
      .filter((b) => b.round === rnd)
      .sort((a, b) => a.bracketPosition - b.bracketPosition);

    roundBouts.forEach((bout) => {
      const feeders = mainNodes
        .filter((n) => n.bout.nextWinBoutId === bout.id)
        .sort((a, b) => {
          const slotOrderA = a.bout.nextWinSlot === 'RED' ? 0 : 1;
          const slotOrderB = b.bout.nextWinSlot === 'RED' ? 0 : 1;
          return slotOrderA - slotOrderB;
        });

      const redFeeder = feeders.find((f) => f.bout.nextWinSlot === 'RED') || feeders[0];
      const blueFeeder = feeders.find((f) => f.bout.nextWinSlot === 'BLUE') || feeders[1];

      if (redFeeder && blueFeeder && redFeeder.page === blueFeeder.page) {
        const topY = redFeeder.midY;
        const bottomY = blueFeeder.midY;
        const node: PdfBoutNodeLayout = {
          bout,
          page: redFeeder.page,
          columnIndex: c,
          x: col.x,
          width: col.width,
          topY,
          bottomY,
          midY: (topY + bottomY) / 2,
        };
        mainNodes.push(node);
        nodeByBoutId.set(bout.id, node);
      } else if (redFeeder && blueFeeder && redFeeder.page !== blueFeeder.page) {
        // Khusus GOLD_FINAL pada B = 32: muncul di Hal. 1 (merentang penuh dari SF Top ke bawah)
        const topY = redFeeder.midY;
        const bottomY = PDF_CONTENT_BOTTOM_Y - 8;
        const node: PdfBoutNodeLayout = {
          bout,
          page: 1,
          columnIndex: c,
          x: col.x,
          width: col.width,
          topY,
          bottomY,
          midY: (topY + bottomY) / 2,
          bridgesAcrossPages: true,
        };
        mainNodes.push(node);
        nodeByBoutId.set(bout.id, node);
      } else {
        const fallbackTop = PDF_TREE_START_Y + 12;
        const fallbackBottom = fallbackTop + 26;
        const node: PdfBoutNodeLayout = {
          bout,
          page: 1,
          columnIndex: c,
          x: col.x,
          width: col.width,
          topY: fallbackTop,
          bottomY: fallbackBottom,
          midY: (fallbackTop + fallbackBottom) / 2,
        };
        mainNodes.push(node);
        nodeByBoutId.set(bout.id, node);
      }
    });
  }

  // Hitung batas bawah halaman 1
  const page1Nodes = mainNodes.filter((n) => n.page === 1);
  const mainMaxYPage1 = page1Nodes.reduce(
    (max, n) => Math.max(max, n.bottomY + 6),
    PDF_TREE_START_Y + 20
  );

  // Bangun blok Repechage & Final 3-5
  const topReps = bouts
    .filter((b) => b.round === 'REPECHAGE_1')
    .sort((a, b) => a.bracketPosition - b.bracketPosition);
  const bottomReps = bouts
    .filter((b) => b.round === 'REPECHAGE_2')
    .sort((a, b) => a.bracketPosition - b.bracketPosition);
  const bronze1 = bouts.find((b) => b.round === 'BRONZE_1');
  const bronze2 = bouts.find((b) => b.round === 'BRONZE_2');

  const hasRepechageOrBronze =
    topReps.length > 0 || bottomReps.length > 0 || Boolean(bronze1) || Boolean(bronze2);

  const repechagePaths: PdfRepechagePathLayout[] = [];
  let repechagePage: 1 | 2 = 1;

  if (hasRepechageOrBronze) {
    const singlePathHeight = 36;
    const pathGap = 6;
    const totalRepHeight = singlePathHeight * 2 + pathGap;

    if (isSplitTwoPages) {
      repechagePage = 2;
    } else if (mainMaxYPage1 + 8 + totalRepHeight > PDF_CONTENT_BOTTOM_Y) {
      repechagePage = 2;
    } else {
      repechagePage = 1;
    }

    const page2MainMaxY = mainNodes
      .filter((n) => n.page === 2)
      .reduce((max, n) => Math.max(max, n.bottomY + 8), PDF_TREE_START_Y);

    const firstPathStartY =
      repechagePage === 1
        ? mainMaxYPage1 + 6
        : isSplitTwoPages
        ? page2MainMaxY + 6
        : PDF_PILL_Y;

    const buildRepPath = (
      side: 'TOP' | 'BOTTOM',
      reps: TournamentBout[],
      bronze: TournamentBout | undefined,
      startY: number
    ): PdfRepechagePathLayout | null => {
      const chain: Array<{ label: string; bout: TournamentBout }> = [];
      reps.forEach((rb) => chain.push({ label: 'Repechage', bout: rb }));
      if (bronze) chain.push({ label: 'Final 3-5', bout: bronze });
      if (chain.length === 0) return null;

      const repColWidth = Math.min(52, (PDF_CONTENT_WIDTH * 0.78 - (chain.length - 1) * PDF_COL_GAP) / chain.length);
      const pathColumns = chain.map((item, idx) => ({
        label: item.label,
        x: PDF_MARGIN_X + idx * (repColWidth + PDF_COL_GAP),
        width: repColWidth,
      }));

      const nodes: PdfBoutNodeLayout[] = [];
      const pillBottom = startY + PDF_PILL_HEIGHT;

      chain.forEach((item, idx) => {
        const col = pathColumns[idx];
        const stepOffset = idx * 4.5;
        const topY = pillBottom + 5 + stepOffset;
        const bottomY = topY + (idx === chain.length - 1 ? 15 : 10.5);
        nodes.push({
          bout: item.bout,
          page: repechagePage,
          columnIndex: idx,
          x: col.x,
          width: col.width,
          topY,
          bottomY,
          midY: (topY + bottomY) / 2,
        });
      });

      return {
        side,
        columns: pathColumns,
        nodes,
        startY,
        height: singlePathHeight,
      };
    };

    const topPath = buildRepPath('TOP', topReps, bronze1, firstPathStartY);
    if (topPath) repechagePaths.push(topPath);

    const secondPathStartY = firstPathStartY + singlePathHeight + pathGap;
    const bottomPath = buildRepPath('BOTTOM', bottomReps, bronze2, secondPathStartY);
    if (bottomPath) repechagePaths.push(bottomPath);
  }

  const pageCount: 1 | 2 = isSplitTwoPages || repechagePage === 2 ? 2 : 1;

  return {
    pageCount,
    columns,
    mainNodes,
    repechagePage,
    repechagePaths,
    mainMaxYPage1,
  };
}
