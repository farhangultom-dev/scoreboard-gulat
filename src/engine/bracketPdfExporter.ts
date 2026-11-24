import type { jsPDF } from 'jspdf';
import {
  Athlete,
  CategoryDivision,
  StandingRow,
  TournamentBout,
} from '../types/tournament';
import { calculateNordicStandings } from './uwwClassification';
import {
  PDF_COL_GAP,
  PDF_CONNECTOR_WIDTH,
  PDF_CONTENT_BOTTOM_Y,
  PDF_CONTENT_WIDTH,
  PDF_FOOTER_Y,
  PDF_HEADER_HEIGHT,
  PDF_MARGIN_X,
  PDF_MARGIN_TOP,
  PDF_PAGE_WIDTH,
  PDF_PILL_HEIGHT,
  PDF_PILL_Y,
  PDF_ROW_BAR_HEIGHT,
  PdfBoutNodeLayout,
  buildBracketPdfFilename,
  computeEliminationPdfLayout,
  formatPdfTimestamp,
  formatUwwAthleteLabel,
  formatUwwDocumentTitle,
  formatUwwResultLine,
  getNonTechnicalLossBadge,
  getUwwRoundColumnLabel,
} from './bracketPdfLayout';

export interface DivisionBracketPdfParams {
  division: CategoryDivision;
  athletes: Athlete[];
  bouts: TournamentBout[];
  tournamentName?: string;
  isDraft?: boolean;
  generatedAt?: Date;
}

export interface AllBracketsPdfParams {
  divisions: DivisionBracketPdfParams[];
  tournamentName?: string;
  generatedAt?: Date;
}

interface PageMeta {
  timestamp: string;
  title: string;
  tournamentName: string;
  matName: string;
  isDraft: boolean;
}

// Warna resmi UWW Arena PDF
const COLOR_BLACK = [0, 0, 0] as const;
const COLOR_DARK_BAR = [51, 51, 51] as const;
const COLOR_UWW_GREEN = [60, 154, 69] as const;
const COLOR_RED_BADGE = [220, 38, 38] as const;
const COLOR_MUTED_TEXT = [65, 65, 65] as const;
const COLOR_LINE = [45, 45, 45] as const;
const COLOR_LIGHT_BORDER = [205, 205, 205] as const;
const COLOR_ROW_ALT = [245, 247, 250] as const;

function drawOfficialHeader(doc: jsPDF, meta: PageMeta) {
  const x = PDF_MARGIN_X;
  const y = PDF_MARGIN_TOP;
  const w = PDF_CONTENT_WIDTH;
  const h = PDF_HEADER_HEIGHT;

  doc.setDrawColor(...COLOR_BLACK);
  doc.setLineWidth(0.35);
  doc.rect(x, y, w, h);

  // Kiri: Timestamp
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_BLACK);
  doc.text(meta.timestamp, x + 2.2, y + 5.8);

  // Tengah: Judul Kelas (tebal besar)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const titleText = meta.isDraft ? `${meta.title} (DRAFT)` : meta.title;
  doc.text(titleText, x + w / 2, y + 6.4, { align: 'center' });

  // Kanan: Nama Turnamen
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const rightText = (meta.tournamentName || 'PORPROV X LAMPUNG 2026').slice(0, 40);
  doc.text(rightText, x + w - 2.2, y + 5.8, { align: 'right' });
}

function drawOfficialFooter(
  doc: jsPDF,
  meta: PageMeta,
  pageNumber: number,
  totalPages: number
) {
  const y = PDF_FOOTER_Y;
  doc.setDrawColor(...COLOR_BLACK);
  doc.setLineWidth(0.3);
  doc.line(PDF_MARGIN_X, y - 3.2, PDF_PAGE_WIDTH - PDF_MARGIN_X, y - 3.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_MUTED_TEXT);
  doc.text(`Matras: ${meta.matName || 'MAT A'}`, PDF_MARGIN_X, y);
  doc.text(
    `Halaman ${pageNumber} / ${totalPages}`,
    PDF_PAGE_WIDTH / 2,
    y,
    { align: 'center' }
  );
  doc.text(
    `${meta.tournamentName || 'PORPROV X LAMPUNG 2026'} • UWW Scoreboard`,
    PDF_PAGE_WIDTH - PDF_MARGIN_X,
    y,
    { align: 'right' }
  );
}

function drawRoundPill(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string
) {
  doc.setFillColor(...COLOR_BLACK);
  doc.roundedRect(x, y, width, height, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(255, 255, 255);
  doc.text(label, x + width / 2, y + height / 2 + 1.05, { align: 'center' });
}

/**
 * Menggambar 1 slot baris atlet (atas=RED / bawah=BLUE), termasuk arsir hijau bila menang,
 * badge merah INJ/FFT/DSQ + strikethrough bila kalah non-teknis.
 */
function drawAthleteSlotRow(
  doc: jsPDF,
  params: {
    x: number;
    lineY: number;
    slotWidth: number;
    athlete?: Athlete | null;
    fallbackLabel?: string;
    isWinner: boolean;
    lossBadge: 'INJ' | 'FFT' | 'DSQ' | null;
    fontSize: number;
  }
) {
  const { x, lineY, slotWidth, athlete, fallbackLabel, isWinner, lossBadge, fontSize } =
    params;

  const maxChars = Math.max(14, Math.floor(slotWidth / 1.48));
  const label = formatUwwAthleteLabel(athlete, fallbackLabel, maxChars);

  if (isWinner) {
    doc.setFillColor(...COLOR_UWW_GREEN);
    doc.rect(
      x,
      lineY - PDF_ROW_BAR_HEIGHT,
      slotWidth,
      PDF_ROW_BAR_HEIGHT,
      'F'
    );
  }

  // Garis dasar horizontal slot atlet
  doc.setDrawColor(...COLOR_LINE);
  doc.setLineWidth(0.28);
  doc.line(x, lineY, x + slotWidth, lineY);

  if (label) {
    doc.setFont('helvetica', isWinner ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    if (isWinner) {
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setTextColor(...COLOR_BLACK);
    }

    const textY = lineY - 1.25;
    doc.text(label, x + 1.1, textY, { maxWidth: slotWidth - 2 });

    // Garis coret & badge merah kecil jika kalah karena cedera/forfeit/DSQ
    if (lossBadge) {
      const textWidth = Math.min(slotWidth - 2.2, doc.getTextWidth(label));
      doc.setDrawColor(...COLOR_RED_BADGE);
      doc.setLineWidth(0.32);
      doc.line(x + 1.1, textY - 0.9, x + 1.1 + textWidth, textY - 0.9);

      const badgeW = 6.2;
      const badgeH = 2.6;
      doc.setFillColor(...COLOR_RED_BADGE);
      doc.roundedRect(x + 1.1, lineY + 0.5, badgeW, badgeH, 0.5, 0.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.2);
      doc.setTextColor(255, 255, 255);
      doc.text(lossBadge, x + 1.1 + badgeW / 2, lineY + 2.35, {
        align: 'center',
      });
    }
  }
}

/**
 * Menggambar satu node partai lengkap gaya UWW Arena:
 * - Slot Atas (RED) + Slot Bawah (BLUE)
 * - Batang vertikal gelap di kanan dengan nomor partai putih bold
 * - Baris skor & tipe kemenangan (CP-CP(TP-TP) by TYPE) di bawah garis pemenang/slot atas
 */
function drawUwwBoutNode(
  doc: jsPDF,
  node: PdfBoutNodeLayout,
  athleteMap: Map<string, Athlete>,
  fontSize = 6.3
) {
  const { bout, x, width, topY, bottomY, midY } = node;
  const connW = PDF_CONNECTOR_WIDTH;
  const slotWidth = Math.max(10, width - connW);

  const redAthlete = bout.redAthleteId ? athleteMap.get(bout.redAthleteId) : null;
  const blueAthlete = bout.blueAthleteId ? athleteMap.get(bout.blueAthleteId) : null;

  const isCompleted = bout.status === 'COMPLETED' && Boolean(bout.result);
  const redWon = isCompleted && bout.result?.winnerCorner === 'RED';
  const blueWon = isCompleted && bout.result?.winnerCorner === 'BLUE';
  const nonTechBadge = isCompleted
    ? getNonTechnicalLossBadge(bout.result?.victoryType)
    : null;

  drawAthleteSlotRow(doc, {
    x,
    lineY: topY,
    slotWidth,
    athlete: redAthlete,
    fallbackLabel: bout.redSourceLabel,
    isWinner: redWon,
    lossBadge: blueWon ? nonTechBadge : null,
    fontSize,
  });

  drawAthleteSlotRow(doc, {
    x,
    lineY: bottomY,
    slotWidth,
    athlete: blueAthlete,
    fallbackLabel: bout.blueSourceLabel,
    isWinner: blueWon,
    lossBadge: redWon ? nonTechBadge : null,
    fontSize,
  });

  // Batang vertikal konektor hitam gelap di sisi kanan
  const barX = x + slotWidth;
  const barTop = topY - (redWon ? PDF_ROW_BAR_HEIGHT : 0.25);
  const barHeight = Math.max(4, bottomY - barTop + 0.25);

  doc.setFillColor(...COLOR_DARK_BAR);
  doc.rect(barX, barTop, connW, barHeight, 'F');

  // Nomor partai putih bold di tengah batang konektor
  const boutLabel =
    bout.boutNumber !== null && bout.boutNumber !== undefined
      ? String(bout.boutNumber)
      : '';
  if (boutLabel) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(255, 255, 255);
    doc.text(boutLabel, barX + connW / 2, midY + 0.9, { align: 'center' });
  }

  // Baris skor hasil di bawah garis pemenang (atau bawah garis atas jika muat)
  if (isCompleted && bout.result) {
    const resultLine = formatUwwResultLine(bout.result);
    if (resultLine) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(5.4);
      doc.setTextColor(...COLOR_MUTED_TEXT);

      const textY = redWon ? topY + 2.6 : bottomY + 2.6;
      doc.text(resultLine, x + 1.1, textY, { maxWidth: slotWidth - 1.5 });
    }
  }
}

/**
 * Menggambar tabel klasemen UWW (digunakan pada format NORDIC dan GROUP_CROSS).
 */
function drawStandingsTablePdf(
  doc: jsPDF,
  params: {
    x: number;
    y: number;
    width: number;
    title: string;
    standings: StandingRow[];
    athleteMap: Map<string, Athlete>;
  }
): number {
  const { x, y, width, title, standings, athleteMap } = params;

  // Judul bar hitam
  drawRoundPill(doc, x, y, width, 5.8, title);

  const tableY = y + 7.2;
  const cols = [
    { label: 'Rank', w: width * 0.08, align: 'center' as const },
    { label: 'Pegulat', w: width * 0.34, align: 'left' as const },
    { label: 'Daerah', w: width * 0.14, align: 'center' as const },
    { label: 'M', w: width * 0.06, align: 'center' as const },
    { label: 'W', w: width * 0.06, align: 'center' as const },
    { label: 'CP', w: width * 0.08, align: 'center' as const },
    { label: 'VFA', w: width * 0.06, align: 'center' as const },
    { label: 'VSU', w: width * 0.06, align: 'center' as const },
    { label: 'TP+', w: width * 0.06, align: 'center' as const },
    { label: 'TP-', w: width * 0.06, align: 'center' as const },
  ];

  // Header baris tabel
  const headerH = 5.4;
  doc.setFillColor(...COLOR_DARK_BAR);
  doc.rect(x, tableY, width, headerH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(255, 255, 255);

  let curX = x;
  cols.forEach((c) => {
    const tx = c.align === 'center' ? curX + c.w / 2 : curX + 1.5;
    doc.text(c.label, tx, tableY + 3.7, { align: c.align });
    curX += c.w;
  });

  // Baris data atlet
  const rowH = 5.6;
  let curY = tableY + headerH;

  standings.forEach((st, idx) => {
    const ath = athleteMap.get(st.athleteId);
    if (idx % 2 === 1) {
      doc.setFillColor(...COLOR_ROW_ALT);
      doc.rect(x, curY, width, rowH, 'F');
    }

    doc.setDrawColor(...COLOR_LIGHT_BORDER);
    doc.setLineWidth(0.2);
    doc.rect(x, curY, width, rowH);

    const cells = [
      String(st.rank),
      (ath?.name || st.athleteId).toUpperCase(),
      (ath?.regionCode || '-').toUpperCase(),
      String(st.matchesPlayed),
      String(st.wins),
      String(st.classificationPoints),
      String(st.vfaCount),
      String(st.vsuCount),
      String(st.technicalPointsFor),
      String(st.technicalPointsAgainst),
    ];

    let cellX = x;
    cells.forEach((val, colIdx) => {
      const col = cols[colIdx];
      doc.setFont('helvetica', colIdx === 0 || colIdx === 5 ? 'bold' : 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(...COLOR_BLACK);
      const tx = col.align === 'center' ? cellX + col.w / 2 : cellX + 1.5;
      doc.text(val, tx, curY + 3.8, {
        align: col.align,
        maxWidth: col.w - 2.2,
      });
      cellX += col.w;
    });

    curY += rowH;
  });

  return curY;
}

/**
 * Menggambar daftar hasil pertandingan tabel ringkas (untuk NORDIC & fase grup GROUP_CROSS).
 */
function drawBoutsListTablePdf(
  doc: jsPDF,
  params: {
    x: number;
    y: number;
    width: number;
    title: string;
    bouts: TournamentBout[];
    athleteMap: Map<string, Athlete>;
  }
): number {
  const { x, y, width, title, bouts, athleteMap } = params;

  drawRoundPill(doc, x, y, width, 5.8, title);

  const tableY = y + 7.2;
  const cols = [
    { label: 'No.', w: width * 0.08, align: 'center' as const },
    { label: 'Babak', w: width * 0.14, align: 'center' as const },
    { label: 'Sudut Merah (RED)', w: width * 0.28, align: 'left' as const },
    { label: 'Sudut Biru (BLUE)', w: width * 0.28, align: 'left' as const },
    { label: 'Hasil (UWW)', w: width * 0.22, align: 'center' as const },
  ];

  const headerH = 5.4;
  doc.setFillColor(...COLOR_DARK_BAR);
  doc.rect(x, tableY, width, headerH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(255, 255, 255);
  let curX = x;
  cols.forEach((c) => {
    const tx = c.align === 'center' ? curX + c.w / 2 : curX + 1.5;
    doc.text(c.label, tx, tableY + 3.7, { align: c.align });
    curX += c.w;
  });

  const rowH = 5.8;
  let curY = tableY + headerH;

  bouts.forEach((b, idx) => {
    const redAth = b.redAthleteId ? athleteMap.get(b.redAthleteId) : null;
    const blueAth = b.blueAthleteId ? athleteMap.get(b.blueAthleteId) : null;
    const isCompleted = b.status === 'COMPLETED' && Boolean(b.result);
    const redWon = isCompleted && b.result?.winnerCorner === 'RED';
    const blueWon = isCompleted && b.result?.winnerCorner === 'BLUE';

    if (idx % 2 === 1) {
      doc.setFillColor(...COLOR_ROW_ALT);
      doc.rect(x, curY, width, rowH, 'F');
    }

    // Highlight hijau pada kolom pemenang
    const redColX = x + cols[0].w + cols[1].w;
    const blueColX = redColX + cols[2].w;
    if (redWon) {
      doc.setFillColor(...COLOR_UWW_GREEN);
      doc.rect(redColX, curY, cols[2].w, rowH, 'F');
    } else if (blueWon) {
      doc.setFillColor(...COLOR_UWW_GREEN);
      doc.rect(blueColX, curY, cols[3].w, rowH, 'F');
    }

    doc.setDrawColor(...COLOR_LIGHT_BORDER);
    doc.setLineWidth(0.2);
    doc.rect(x, curY, width, rowH);

    const rowValues = [
      b.boutNumber !== null && b.boutNumber !== undefined ? String(b.boutNumber) : '-',
      getUwwRoundColumnLabel(b.round),
      formatUwwAthleteLabel(redAth, b.redSourceLabel || 'TBD', 30),
      formatUwwAthleteLabel(blueAth, b.blueSourceLabel || 'TBD', 30),
      isCompleted && b.result ? formatUwwResultLine(b.result) : b.status,
    ];

    let cellX = x;
    rowValues.forEach((val, colIdx) => {
      const col = cols[colIdx];
      const highlightWhite = (colIdx === 2 && redWon) || (colIdx === 3 && blueWon);
      doc.setFont(
        'helvetica',
        highlightWhite || colIdx === 0 ? 'bold' : 'normal'
      );
      doc.setFontSize(6.4);
      if (highlightWhite) {
        doc.setTextColor(255, 255, 255);
      } else {
        doc.setTextColor(...COLOR_BLACK);
      }
      const tx = col.align === 'center' ? cellX + col.w / 2 : cellX + 1.5;
      doc.text(val, tx, curY + 3.9, {
        align: col.align,
        maxWidth: col.w - 2.2,
      });
      cellX += col.w;
    });

    curY += rowH;
  });

  return curY;
}

/**
 * Merender 1 divisi ke dalam dokumen jsPDF (bisa 1 atau 2 halaman).
 * Mengembalikan jumlah halaman yang dipakai oleh divisi ini.
 */
export function renderDivisionBracketToPdf(
  doc: jsPDF,
  params: DivisionBracketPdfParams
): number {
  const { division, athletes, bouts, tournamentName, isDraft = false, generatedAt } =
    params;

  const athleteMap = new Map<string, Athlete>();
  athletes.forEach((a) => athleteMap.set(a.id, a));

  const meta: PageMeta = {
    timestamp: formatPdfTimestamp(generatedAt),
    title: formatUwwDocumentTitle(division),
    tournamentName: tournamentName || 'PORPROV X LAMPUNG 2026',
    matName: division.assignedMat || 'MAT A',
    isDraft,
  };

  // ------------------------------------------------------------------
  // 1. FORMAT NORDIC (Round-Robin)
  // ------------------------------------------------------------------
  if (division.format === 'NORDIC') {
    const standings = calculateNordicStandings(
      athletes.map((a) => a.id),
      bouts
    );
    const sortedBouts = [...bouts].sort((a, b) => {
      if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
      return a.bracketPosition - b.bracketPosition;
    });

    drawOfficialHeader(doc, meta);
    const afterTableY = drawStandingsTablePdf(doc, {
      x: PDF_MARGIN_X,
      y: PDF_PILL_Y,
      width: PDF_CONTENT_WIDTH,
      title: 'Klasemen Resmi UWW (Nordic Round-Robin)',
      standings,
      athleteMap,
    });

    drawBoutsListTablePdf(doc, {
      x: PDF_MARGIN_X,
      y: afterTableY + 6,
      width: PDF_CONTENT_WIDTH,
      title: 'Daftar & Hasil Pertandingan per Ronde',
      bouts: sortedBouts,
      athleteMap,
    });

    drawOfficialFooter(doc, meta, 1, 1);
    return 1;
  }

  // ------------------------------------------------------------------
  // 2. FORMAT GROUP_CROSS (Pool A & Pool B + Cross Semifinal & Finals)
  // ------------------------------------------------------------------
  if (division.format === 'GROUP_CROSS') {
    const groupABouts = bouts
      .filter((b) => b.round === 'GROUP_A')
      .sort((a, b) => a.bracketPosition - b.bracketPosition);
    const groupBBouts = bouts
      .filter((b) => b.round === 'GROUP_B')
      .sort((a, b) => a.bracketPosition - b.bracketPosition);

    const sortedAthletes = [...athletes].sort(
      (a, b) => (a.drawNumber ?? 999) - (b.drawNumber ?? 999)
    );
    const half = Math.ceil(sortedAthletes.length / 2);

    const poolAIds =
      groupABouts.length > 0
        ? Array.from(
            new Set(
              groupABouts
                .flatMap((b) => [b.redAthleteId, b.blueAthleteId])
                .filter((id): id is string => Boolean(id))
            )
          )
        : sortedAthletes.slice(0, half).map((a) => a.id);

    const poolBIds =
      groupBBouts.length > 0
        ? Array.from(
            new Set(
              groupBBouts
                .flatMap((b) => [b.redAthleteId, b.blueAthleteId])
                .filter((id): id is string => Boolean(id))
            )
          )
        : sortedAthletes.slice(half).map((a) => a.id);

    const standingsA = calculateNordicStandings(poolAIds, groupABouts);
    const standingsB = calculateNordicStandings(poolBIds, groupBBouts);

    drawOfficialHeader(doc, meta);

    const halfW = (PDF_CONTENT_WIDTH - 4) / 2;
    const endAY = drawStandingsTablePdf(doc, {
      x: PDF_MARGIN_X,
      y: PDF_PILL_Y,
      width: halfW,
      title: 'Pool A (Group A)',
      standings: standingsA,
      athleteMap,
    });
    const endBY = drawStandingsTablePdf(doc, {
      x: PDF_MARGIN_X + halfW + 4,
      y: PDF_PILL_Y,
      width: halfW,
      title: 'Pool B (Group B)',
      standings: standingsB,
      athleteMap,
    });

    const afterPoolsY = Math.max(endAY, endBY) + 5;
    const afterGroupBoutsY = drawBoutsListTablePdf(doc, {
      x: PDF_MARGIN_X,
      y: afterPoolsY,
      width: PDF_CONTENT_WIDTH,
      title: 'Pertandingan Fase Grup (Pool A & Pool B)',
      bouts: [...groupABouts, ...groupBBouts],
      athleteMap,
    });

    // Diagram Pohon Cross Semifinal -> Final 1-2 & Final 3-5
    const sfBouts = bouts
      .filter((b) => b.round === 'SEMIFINAL')
      .sort((a, b) => a.bracketPosition - b.bracketPosition);
    const goldFinal = bouts.find((b) => b.round === 'GOLD_FINAL');
    const bronzeFinal = bouts.find(
      (b) => b.round === 'BRONZE_1' || b.round === 'BRONZE_2'
    );

    const knockoutStartY = afterGroupBoutsY + 7;
    const needPage2 = knockoutStartY + 56 > PDF_CONTENT_BOTTOM_Y;
    let totalPages = 1;
    let treeY = knockoutStartY;

    if (needPage2) {
      drawOfficialFooter(doc, meta, 1, 2);
      doc.addPage();
      drawOfficialHeader(doc, meta);
      totalPages = 2;
      treeY = PDF_PILL_Y;
    }

    const koColW = (PDF_CONTENT_WIDTH - PDF_COL_GAP * 2) / 3;
    const sfX = PDF_MARGIN_X;
    const goldX = PDF_MARGIN_X + koColW + PDF_COL_GAP;
    const bronzeX = PDF_MARGIN_X + (koColW + PDF_COL_GAP) * 2;

    drawRoundPill(doc, sfX, treeY, koColW, PDF_PILL_HEIGHT, '1/2 Final');
    drawRoundPill(doc, goldX, treeY, koColW, PDF_PILL_HEIGHT, 'Final 1-2');
    if (bronzeFinal) {
      drawRoundPill(doc, bronzeX, treeY, koColW, PDF_PILL_HEIGHT, 'Final 3-5');
    }

    const sfTopY = treeY + PDF_PILL_HEIGHT + 7;
    const sfGap = 13;
    const sfMid1 = sfTopY + sfGap / 2;
    const sfTop2 = sfTopY + sfGap + 12;
    const sfMid2 = sfTop2 + sfGap / 2;

    if (sfBouts[0]) {
      drawUwwBoutNode(
        doc,
        {
          bout: sfBouts[0],
          page: totalPages as 1 | 2,
          columnIndex: 0,
          x: sfX,
          width: koColW,
          topY: sfTopY,
          bottomY: sfTopY + sfGap,
          midY: sfMid1,
        },
        athleteMap,
        6.8
      );
    }

    if (sfBouts[1]) {
      drawUwwBoutNode(
        doc,
        {
          bout: sfBouts[1],
          page: totalPages as 1 | 2,
          columnIndex: 0,
          x: sfX,
          width: koColW,
          topY: sfTop2,
          bottomY: sfTop2 + sfGap,
          midY: sfMid2,
        },
        athleteMap,
        6.8
      );
    }

    if (goldFinal) {
      drawUwwBoutNode(
        doc,
        {
          bout: goldFinal,
          page: totalPages as 1 | 2,
          columnIndex: 1,
          x: goldX,
          width: koColW,
          topY: sfMid1,
          bottomY: sfMid2,
          midY: (sfMid1 + sfMid2) / 2,
        },
        athleteMap,
        6.8
      );
    }

    if (bronzeFinal) {
      drawUwwBoutNode(
        doc,
        {
          bout: bronzeFinal,
          page: totalPages as 1 | 2,
          columnIndex: 2,
          x: bronzeX,
          width: koColW,
          topY: sfMid1,
          bottomY: sfMid2,
          midY: (sfMid1 + sfMid2) / 2,
        },
        athleteMap,
        6.8
      );
    }

    drawOfficialFooter(doc, meta, totalPages, totalPages);
    return totalPages;
  }

  // ------------------------------------------------------------------
  // 3. FORMAT ELIMINATION_REPECHAGE & SINGLE_BOUT (Tree Gaya UWW Arena)
  // ------------------------------------------------------------------
  const layout = computeEliminationPdfLayout(bouts);
  const totalPages = layout.pageCount;

  // Halaman 1
  drawOfficialHeader(doc, meta);
  layout.columns.forEach((col) => {
    drawRoundPill(doc, col.x, PDF_PILL_Y, col.width, PDF_PILL_HEIGHT, col.label);
  });

  const baseFontSize =
    layout.columns.length >= 6 ? 5.6 : layout.columns.length === 5 ? 6.1 : 6.8;

  layout.mainNodes
    .filter((n) => n.page === 1)
    .forEach((node) => {
      drawUwwBoutNode(doc, node, athleteMap, baseFontSize);
    });

  // Render Repechage & Final 3-5 di Hal. 1 jika muat
  if (layout.repechagePage === 1 && layout.repechagePaths.length > 0) {
    layout.repechagePaths.forEach((path) => {
      path.columns.forEach((col) => {
        drawRoundPill(doc, col.x, path.startY, col.width, PDF_PILL_HEIGHT, col.label);
      });
      path.nodes.forEach((node) => {
        drawUwwBoutNode(doc, node, athleteMap, 6.2);
      });
    });
  }

  drawOfficialFooter(doc, meta, 1, totalPages);

  // Halaman 2 (jika B=32 atau Repechage pindah ke Hal. 2)
  if (totalPages === 2) {
    doc.addPage();
    drawOfficialHeader(doc, meta);

    const page2MainNodes = layout.mainNodes.filter((n) => n.page === 2);
    if (page2MainNodes.length > 0) {
      layout.columns.forEach((col) => {
        drawRoundPill(doc, col.x, PDF_PILL_Y, col.width, PDF_PILL_HEIGHT, col.label);
      });
      page2MainNodes.forEach((node) => {
        drawUwwBoutNode(doc, node, athleteMap, baseFontSize);
      });
    }

    if (layout.repechagePage === 2 && layout.repechagePaths.length > 0) {
      layout.repechagePaths.forEach((path) => {
        path.columns.forEach((col) => {
          drawRoundPill(
            doc,
            col.x,
            path.startY,
            col.width,
            PDF_PILL_HEIGHT,
            col.label
          );
        });
        path.nodes.forEach((node) => {
          drawUwwBoutNode(doc, node, athleteMap, 6.4);
        });
      });
    }

    drawOfficialFooter(doc, meta, 2, totalPages);
  }

  return totalPages;
}

/**
 * Mengunduh file PDF bagan resmi untuk 1 kelas (lazy-load jsPDF).
 */
export async function downloadDivisionBracketPdf(
  params: DivisionBracketPdfParams
): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  renderDivisionBracketToPdf(doc, params);

  const filename = buildBracketPdfFilename(params.division, params.isDraft);
  doc.save(filename);
  return filename;
}

/**
 * Helper internal: menyusun 1 dokumen jsPDF gabungan berisi seluruh divisi secara berurutan.
 */
async function buildAllBracketsDoc(
  params: AllBracketsPdfParams
): Promise<jsPDF | null> {
  if (params.divisions.length === 0) return null;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  params.divisions.forEach((divParams, idx) => {
    if (idx > 0) {
      doc.addPage();
    }
    renderDivisionBracketToPdf(doc, {
      ...divParams,
      tournamentName: divParams.tournamentName || params.tournamentName,
      generatedAt: params.generatedAt,
    });
  });

  return doc;
}

/**
 * Mengunduh seluruh kelas ke dalam 1 dokumen PDF gabungan.
 */
export async function downloadAllBracketsPdf(
  params: AllBracketsPdfParams
): Promise<string | null> {
  const doc = await buildAllBracketsDoc(params);
  if (!doc) return null;

  const safeTournament = (params.tournamentName || 'PORPROV_LAMPUNG_2026')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const filename = `All_Brackets_${safeTournament}.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * Mencetak seluruh kelas sekaligus dalam 1 dokumen PDF gabungan bergaya UWW Arena.
 */
export async function printAllBracketsPdf(
  params: AllBracketsPdfParams
): Promise<boolean> {
  const doc = await buildAllBracketsDoc(params);
  if (!doc) return false;
  triggerPdfPrint(doc);
  return true;
}

/**
 * Membuka dialog Print native browser untuk dokumen jsPDF yang sudah dirender
 * menggunakan iframe tersembunyi (fallback otomatis ke tab baru bila diblokir).
 */
function triggerPdfPrint(doc: jsPDF): void {
  doc.autoPrint();
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = blobUrl;

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      URL.revokeObjectURL(blobUrl);
    }, 60_000);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
    } catch {
      window.open(blobUrl, '_blank');
      cleanup();
    }
  };

  document.body.appendChild(iframe);
}

/**
 * Mencetak bagan resmi 1 kelas (format identik 1:1 dengan Download PDF UWW Arena).
 */
export async function printDivisionBracketPdf(
  params: DivisionBracketPdfParams
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  renderDivisionBracketToPdf(doc, params);
  triggerPdfPrint(doc);
}

export interface DivisionRosterPdfParams {
  division: CategoryDivision;
  athletes: Athlete[];
  tournamentName?: string;
  generatedAt?: Date;
}

/**
 * Mencetak Daftar Peserta resmi 1 kelas (Official Entry / Weigh-In List) gaya UWW Arena.
 */
export async function printDivisionRosterPdf(
  params: DivisionRosterPdfParams
): Promise<void> {
  const { division, athletes, tournamentName, generatedAt } = params;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const sorted = [...athletes].sort((a, b) => {
    const drawA = a.drawNumber ?? 9999;
    const drawB = b.drawNumber ?? 9999;
    if (drawA !== drawB) return drawA - drawB;
    return a.name.localeCompare(b.name);
  });

  const meta: PageMeta = {
    timestamp: formatPdfTimestamp(generatedAt),
    title: formatUwwDocumentTitle(division),
    tournamentName: tournamentName || 'PORPROV X LAMPUNG 2026',
    matName: division.assignedMat || 'MAT A',
    isDraft: false,
  };

  const rowsPerPage = 36;
  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));

  const cols = [
    { label: 'No.', w: PDF_CONTENT_WIDTH * 0.07, align: 'center' as const },
    { label: 'No. Undian', w: PDF_CONTENT_WIDTH * 0.12, align: 'center' as const },
    { label: 'Seed', w: PDF_CONTENT_WIDTH * 0.09, align: 'center' as const },
    { label: 'Nama Pegulat', w: PDF_CONTENT_WIDTH * 0.36, align: 'left' as const },
    { label: 'Kode', w: PDF_CONTENT_WIDTH * 0.11, align: 'center' as const },
    { label: 'Daerah / Kontingen', w: PDF_CONTENT_WIDTH * 0.25, align: 'left' as const },
  ];

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) doc.addPage();
    drawOfficialHeader(doc, meta);
    drawRoundPill(
      doc,
      PDF_MARGIN_X,
      PDF_PILL_Y,
      PDF_CONTENT_WIDTH,
      5.8,
      `Daftar Peserta Resmi (Official Entry List) — Total ${sorted.length} Atlet`
    );

    const tableY = PDF_PILL_Y + 7.2;
    const headerH = 5.6;
    doc.setFillColor(...COLOR_DARK_BAR);
    doc.rect(PDF_MARGIN_X, tableY, PDF_CONTENT_WIDTH, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);

    let curX = PDF_MARGIN_X;
    cols.forEach((c) => {
      const tx = c.align === 'center' ? curX + c.w / 2 : curX + 1.8;
      doc.text(c.label, tx, tableY + 3.8, { align: c.align });
      curX += c.w;
    });

    const rowH = 6.2;
    let curY = tableY + headerH;
    const slice = sorted.slice(p * rowsPerPage, (p + 1) * rowsPerPage);

    slice.forEach((ath, idx) => {
      const globalIdx = p * rowsPerPage + idx + 1;
      if (idx % 2 === 1) {
        doc.setFillColor(...COLOR_ROW_ALT);
        doc.rect(PDF_MARGIN_X, curY, PDF_CONTENT_WIDTH, rowH, 'F');
      }
      doc.setDrawColor(...COLOR_LIGHT_BORDER);
      doc.setLineWidth(0.2);
      doc.rect(PDF_MARGIN_X, curY, PDF_CONTENT_WIDTH, rowH);

      const vals = [
        String(globalIdx),
        ath.drawNumber != null ? `#${ath.drawNumber}` : '-',
        ath.seed ? `TS ${ath.seed}` : '-',
        ath.name.toUpperCase(),
        (ath.regionCode || '-').toUpperCase(),
        (ath.region || '-').toUpperCase(),
      ];

      let cx = PDF_MARGIN_X;
      vals.forEach((v, cIdx) => {
        const col = cols[cIdx];
        doc.setFont('helvetica', cIdx === 1 || cIdx === 3 || cIdx === 4 ? 'bold' : 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_BLACK);
        const tx = col.align === 'center' ? cx + col.w / 2 : cx + 1.8;
        doc.text(v, tx, curY + 4.2, { align: col.align, maxWidth: col.w - 2.5 });
        cx += col.w;
      });

      curY += rowH;
    });

    drawOfficialFooter(doc, meta, p + 1, totalPages);
  }

  triggerPdfPrint(doc);
}

export interface BoutQueuePdfParams {
  bouts: TournamentBout[];
  athletes: Record<string, Athlete>;
  divisions: Record<string, CategoryDivision>;
  tournamentName?: string;
  generatedAt?: Date;
}

/**
 * Mencetak Daftar Antrean Partai (Order of Bouts) resmi gaya UWW Arena.
 */
export async function printBoutQueuePdf(params: BoutQueuePdfParams): Promise<void> {
  const { bouts, athletes, divisions, tournamentName, generatedAt } = params;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const sortedBouts = [...bouts].sort((a, b) => {
    const matCmp = (a.matName || 'MAT A').localeCompare(b.matName || 'MAT A');
    if (matCmp !== 0) return matCmp;
    const numA = a.boutNumber ?? 999999;
    const numB = b.boutNumber ?? 999999;
    if (numA !== numB) return numA - numB;
    if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
    return a.bracketPosition - b.bracketPosition;
  });

  const meta: PageMeta = {
    timestamp: formatPdfTimestamp(generatedAt),
    title: 'Order of Bouts — Daftar Partai',
    tournamentName: tournamentName || 'PORPROV X LAMPUNG 2026',
    matName: 'SEMUA MATRAS',
    isDraft: false,
  };

  const rowsPerPage = 36;
  const totalPages = Math.max(1, Math.ceil(sortedBouts.length / rowsPerPage));

  const cols = [
    { label: 'No.', w: PDF_CONTENT_WIDTH * 0.06, align: 'center' as const },
    { label: 'Mat', w: PDF_CONTENT_WIDTH * 0.08, align: 'center' as const },
    { label: 'Kelas', w: PDF_CONTENT_WIDTH * 0.14, align: 'center' as const },
    { label: 'Babak', w: PDF_CONTENT_WIDTH * 0.11, align: 'center' as const },
    { label: 'Sudut Merah (RED)', w: PDF_CONTENT_WIDTH * 0.22, align: 'left' as const },
    { label: 'Sudut Biru (BLUE)', w: PDF_CONTENT_WIDTH * 0.22, align: 'left' as const },
    { label: 'Status / Hasil', w: PDF_CONTENT_WIDTH * 0.17, align: 'center' as const },
  ];

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) doc.addPage();
    drawOfficialHeader(doc, meta);
    drawRoundPill(
      doc,
      PDF_MARGIN_X,
      PDF_PILL_Y,
      PDF_CONTENT_WIDTH,
      5.8,
      `Daftar Antrean Pertandingan (Order of Bouts) — Total ${sortedBouts.length} Partai`
    );

    const tableY = PDF_PILL_Y + 7.2;
    const headerH = 5.6;
    doc.setFillColor(...COLOR_DARK_BAR);
    doc.rect(PDF_MARGIN_X, tableY, PDF_CONTENT_WIDTH, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(255, 255, 255);

    let curX = PDF_MARGIN_X;
    cols.forEach((c) => {
      const tx = c.align === 'center' ? curX + c.w / 2 : curX + 1.4;
      doc.text(c.label, tx, tableY + 3.8, { align: c.align });
      curX += c.w;
    });

    const rowH = 6.2;
    let curY = tableY + headerH;
    const slice = sortedBouts.slice(p * rowsPerPage, (p + 1) * rowsPerPage);

    slice.forEach((b, idx) => {
      const div = divisions[b.divisionId];
      const divLabel = div ? `${div.style} ${div.weightClass}` : '-';
      const redAth = b.redAthleteId ? athletes[b.redAthleteId] : null;
      const blueAth = b.blueAthleteId ? athletes[b.blueAthleteId] : null;
      const isCompleted = b.status === 'COMPLETED' && Boolean(b.result);
      const redWon = isCompleted && b.result?.winnerCorner === 'RED';
      const blueWon = isCompleted && b.result?.winnerCorner === 'BLUE';

      if (idx % 2 === 1) {
        doc.setFillColor(...COLOR_ROW_ALT);
        doc.rect(PDF_MARGIN_X, curY, PDF_CONTENT_WIDTH, rowH, 'F');
      }

      const redColX =
        PDF_MARGIN_X + cols[0].w + cols[1].w + cols[2].w + cols[3].w;
      const blueColX = redColX + cols[4].w;
      if (redWon) {
        doc.setFillColor(...COLOR_UWW_GREEN);
        doc.rect(redColX, curY, cols[4].w, rowH, 'F');
      } else if (blueWon) {
        doc.setFillColor(...COLOR_UWW_GREEN);
        doc.rect(blueColX, curY, cols[5].w, rowH, 'F');
      }

      doc.setDrawColor(...COLOR_LIGHT_BORDER);
      doc.setLineWidth(0.2);
      doc.rect(PDF_MARGIN_X, curY, PDF_CONTENT_WIDTH, rowH);

      const vals = [
        b.boutNumber != null ? String(b.boutNumber) : '-',
        (b.matName || 'MAT A').replace(/^MAT\s+/i, 'M'),
        divLabel,
        getUwwRoundColumnLabel(b.round),
        formatUwwAthleteLabel(redAth, b.redSourceLabel || 'TBD', 24),
        formatUwwAthleteLabel(blueAth, b.blueSourceLabel || 'TBD', 24),
        isCompleted && b.result ? formatUwwResultLine(b.result) : b.status,
      ];

      let cx = PDF_MARGIN_X;
      vals.forEach((v, cIdx) => {
        const col = cols[cIdx];
        const isWhite = (cIdx === 4 && redWon) || (cIdx === 5 && blueWon);
        doc.setFont('helvetica', isWhite || cIdx === 0 ? 'bold' : 'normal');
        doc.setFontSize(6.2);
        if (isWhite) {
          doc.setTextColor(255, 255, 255);
        } else {
          doc.setTextColor(...COLOR_BLACK);
        }
        const tx = col.align === 'center' ? cx + col.w / 2 : cx + 1.4;
        doc.text(v, tx, curY + 4.1, { align: col.align, maxWidth: col.w - 2.2 });
        cx += col.w;
      });

      curY += rowH;
    });

    drawOfficialFooter(doc, meta, p + 1, totalPages);
  }

  triggerPdfPrint(doc);
}
