import { useState, useEffect } from 'react';
import { MatchRecord } from '../../types/history';
import {
  loadMatchHistory,
  deleteMatchFromHistory,
  clearMatchHistory,
  generateHistoryCsv,
  downloadCsvFile,
  generateMatchSheetJson,
  downloadJsonFile,
} from '../../engine/historyEngine';
import {
  X,
  FileSpreadsheet,
  FileCode,
  Trash2,
  Trophy,
  History,
  Download,
  AlertTriangle,
} from 'lucide-react';

interface MatchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MatchHistoryModal({ isOpen, onClose }: MatchHistoryModalProps) {
  const [history, setHistory] = useState<MatchRecord[]>([]);

  useEffect(() => {
    if (isOpen) {
      setHistory(loadMatchHistory());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExportCsv = () => {
    if (history.length === 0) return;
    const csv = generateHistoryCsv(history);
    downloadCsvFile(csv, `uww_tournament_results_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleExportJson = () => {
    if (history.length === 0) return;
    const json = generateMatchSheetJson(history);
    downloadJsonFile(json, `uww_tournament_data_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleExportSingleJson = (rec: MatchRecord) => {
    const json = generateMatchSheetJson(rec);
    const filename = `${rec.metadata.boutNumber}_${rec.metadata.style}_${rec.metadata.weightClass}.json`.replace(
      /\s+/g,
      '_'
    );
    downloadJsonFile(json, filename);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Hapus rekaman pertandingan ini dari riwayat?')) {
      const updated = deleteMatchFromHistory(id);
      setHistory(updated);
    }
  };

  const handleClearAll = () => {
    if (
      window.confirm(
        'PERINGATAN: Apakah Anda yakin ingin mengosongkan SELURUH arsip pertandingan? Data yang dihapus tidak dapat dipulihkan.'
      )
    ) {
      clearMatchHistory();
      setHistory([]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-bold text-white">
              Arsip & Riwayat Pertandingan ({history.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-slate-800/80 bg-slate-900/50">
          <div className="text-xs text-slate-400">
            Total {history.length} partai tersimpan di penyimpanan offline.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={history.length === 0}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shadow-xs transition cursor-pointer"
              title="Download ringkasan semua partai format CSV (Excel/Sheets)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export CSV
            </button>

            <button
              type="button"
              disabled={history.length === 0}
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white shadow-xs transition cursor-pointer"
              title="Download data lengkap format JSON"
            >
              <FileCode className="w-3.5 h-3.5" />
              Export JSON
            </button>

            {history.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition cursor-pointer ml-2"
                title="Hapus semua arsip"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Semua
              </button>
            )}
          </div>
        </div>

        {/* Match Records List */}
        <div className="p-6 space-y-3 overflow-y-auto flex-1">
          {history.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <History className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-slate-400 font-medium text-sm">
                Belum ada arsip pertandingan tersimpan.
              </p>
              <p className="text-slate-500 text-xs">
                Hasil pertandingan akan otomatis tersimpan saat Anda mendeklarasikan pemenang atau menekan tombol "Save & Next Bout".
              </p>
            </div>
          ) : (
            history.map((rec) => {
              const redWon = rec.winner?.corner === 'RED';
              const blueWon = rec.winner?.corner === 'BLUE';

              return (
                <div
                  key={rec.id}
                  className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: Metadata */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-400 font-mono font-bold text-xs">
                        {rec.metadata.boutNumber}
                      </span>
                      <span className="text-xs font-semibold text-slate-300">
                        {rec.metadata.matName} • {rec.metadata.style} {rec.metadata.weightClass} (
                        {rec.metadata.ageCategory})
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500">
                      Disimpan: {new Date(rec.savedAt).toLocaleString('id-ID')} • {rec.totalEvents} events tercatat
                    </div>
                  </div>

                  {/* Center: Scores & Winner */}
                  <div className="flex items-center gap-6 justify-center">
                    {/* RED */}
                    <div className={`text-right ${redWon ? 'font-bold' : 'opacity-80'}`}>
                      <div className="text-sm font-bold text-red-300 flex items-center justify-end gap-1">
                        {redWon && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                        {rec.red.name || 'RED'} ({rec.red.countryOrTeam || '-'})
                      </div>
                      <div className="text-2xl font-black tabular-nums text-red-500">
                        {rec.red.score}
                      </div>
                    </div>

                    <div className="text-slate-600 font-bold text-lg">-</div>

                    {/* BLUE */}
                    <div className={`text-left ${blueWon ? 'font-bold' : 'opacity-80'}`}>
                      <div className="text-sm font-bold text-blue-300 flex items-center gap-1">
                        {rec.blue.name || 'BLUE'} ({rec.blue.countryOrTeam || '-'})
                        {blueWon && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <div className="text-2xl font-black tabular-nums text-blue-500">
                        {rec.blue.score}
                      </div>
                    </div>

                    {rec.winner && (
                      <span className="px-2.5 py-1 rounded-md bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider">
                        {rec.winner.type}
                      </span>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => handleExportSingleJson(rec)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                      title="Download Match Sheet JSON"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rec.id)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-200 transition cursor-pointer"
                      title="Hapus Rekaman"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
            <span>Penyimpanan offline lokal (100% aman tanpa koneksi internet).</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
