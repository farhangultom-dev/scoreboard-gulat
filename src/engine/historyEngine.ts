import { MatchState } from '../types/match';
import { MatchRecord } from '../types/history';

export const HISTORY_STORAGE_KEY = 'uww_match_history_v1';

export function loadMatchHistory(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MatchRecord[];
  } catch (err) {
    console.error('Failed to load match history from localStorage:', err);
    return [];
  }
}

export function saveMatchToHistory(state: MatchState): MatchRecord {
  const history = loadMatchHistory();

  const record: MatchRecord = {
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    savedAt: Date.now(),
    metadata: { ...state.metadata },
    red: {
      name: state.red.name,
      countryOrTeam: state.red.countryOrTeam,
      score: state.red.score,
      cautions: state.red.cautions,
      passivityCount: state.red.passivityCount,
    },
    blue: {
      name: state.blue.name,
      countryOrTeam: state.blue.countryOrTeam,
      score: state.blue.score,
      cautions: state.blue.cautions,
      passivityCount: state.blue.passivityCount,
    },
    winner: state.winner ? { ...state.winner } : null,
    totalEvents: state.events.length,
    events: [...state.events],
  };

  const updatedHistory = [record, ...history];
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
  } catch (err) {
    console.error('Failed to save match record to localStorage:', err);
  }

  return record;
}

export function deleteMatchFromHistory(id: string): MatchRecord[] {
  const history = loadMatchHistory();
  const filtered = history.filter((rec) => rec.id !== id);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to update match history in localStorage:', err);
  }
  return filtered;
}

export function clearMatchHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear match history in localStorage:', err);
  }
}

/**
 * Format records ke format CSV standar RFC 4180 (kompatibel Excel & Google Sheets)
 */
export function generateHistoryCsv(records: MatchRecord[]): string {
  const escapeCsv = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const headers = [
    'Bout Number',
    'Mat',
    'Style',
    'Weight Class',
    'Age Category',
    'Red Name',
    'Red Team',
    'Red Score',
    'Blue Score',
    'Blue Team',
    'Blue Name',
    'Winner Corner',
    'Winner Name',
    'Victory Type',
    'Total Events',
    'Saved At',
  ];

  const rows = records.map((rec) => {
    const winnerName =
      rec.winner?.corner === 'RED'
        ? rec.red.name
        : rec.winner?.corner === 'BLUE'
        ? rec.blue.name
        : '-';

    return [
      escapeCsv(rec.metadata.boutNumber),
      escapeCsv(rec.metadata.matName),
      escapeCsv(rec.metadata.style),
      escapeCsv(rec.metadata.weightClass),
      escapeCsv(rec.metadata.ageCategory),
      escapeCsv(rec.red.name),
      escapeCsv(rec.red.countryOrTeam),
      escapeCsv(rec.red.score),
      escapeCsv(rec.blue.score),
      escapeCsv(rec.blue.countryOrTeam),
      escapeCsv(rec.blue.name),
      escapeCsv(rec.winner?.corner ?? '-'),
      escapeCsv(winnerName),
      escapeCsv(rec.winner?.type ?? '-'),
      escapeCsv(rec.totalEvents),
      escapeCsv(new Date(rec.savedAt).toISOString()),
    ].join(',');
  });

  return [headers.map((h) => `"${h}"`).join(','), ...rows].join('\r\n');
}

/**
 * Generate full detail JSON match sheet (termasuk kronologi events)
 */
export function generateMatchSheetJson(
  recordOrRecords: MatchRecord | MatchRecord[]
): string {
  return JSON.stringify(recordOrRecords, null, 2);
}

/**
 * Trigger file download di browser menggunakan Blob
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCsvFile(csvContent: string, filename = 'uww_match_results.csv'): void {
  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
}

export function downloadJsonFile(jsonContent: string, filename = 'uww_match_sheet.json'): void {
  downloadFile(jsonContent, filename, 'application/json;charset=utf-8;');
}
