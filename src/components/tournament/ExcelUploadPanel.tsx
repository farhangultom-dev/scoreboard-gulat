import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  downloadAthleteTemplate,
  parseAthleteExcel,
} from '../../engine/excelImporter';
import { ExcelImportResult } from '../../types/tournament';
import { useTournamentStore } from '../../store/useTournamentStore';
import RegionFlag from '../common/RegionFlag';

interface ExcelUploadPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExcelUploadPanel({ isOpen, onClose }: ExcelUploadPanelProps) {
  const importAthletes = useTournamentStore((s) => s.importAthletes);

  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ExcelImportResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileProcess = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('Format file tidak didukung! Harap unggah file .xlsx, .xls, atau .csv');
      return;
    }
    setFileName(file.name);
    setIsParsing(true);
    try {
      const res = await parseAthleteExcel(file);
      setParseResult(res);
    } catch (err) {
      console.error('Gagal memproses file Excel:', err);
      alert('Gagal membaca file Excel. Pastikan file tidak rusak atau terenkripsi password.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleConfirmImport = async (mode: 'MERGE' | 'REPLACE') => {
    if (!parseResult || parseResult.validAthletes.length === 0) return;

    if (
      mode === 'REPLACE' &&
      !window.confirm(
        'Perhatian: Mode GANTI SEMUA akan menghapus seluruh data atlet dan kategori yang sudah ada sebelumnya. Lanjutkan?'
      )
    ) {
      return;
    }

    await importAthletes(parseResult.validAthletes, mode);
    onClose();
  };

  // Hitung jumlah kategori unik yang terdeteksi
  const uniqueCategories = parseResult
    ? new Set(
        parseResult.validAthletes.map(
          (a) => `${a.style}_${a.ageCategory}_${a.weightClass}`
        )
      ).size
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border-2 border-slate-700 rounded-3xl shadow-2xl text-white flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-wider">
                Bulk Import Atlet via Excel
              </h2>
              <p className="text-xs text-slate-400">
                Unggah data peserta turnamen resmi UWW (.xlsx / .csv)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadAthleteTemplate}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition border border-slate-600 cursor-pointer"
              title="Unduh Template Excel Resmi UWW"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span>Download Template</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Konten Utama */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Dropzone Upload */}
          {!parseResult && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-3 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 transition cursor-pointer ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-950/40 text-slate-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileProcess(e.target.files[0]);
                  }
                }}
              />
              <div className="p-4 rounded-full bg-slate-800 text-slate-300">
                <Upload className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-slate-200">
                  Tarik & lepas file Excel di sini, atau{' '}
                  <span className="text-emerald-400 underline">pilih dari komputer</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Format didukung: .xlsx, .xls, .csv (Template Resmi UWW)
                </p>
              </div>
              {isParsing && (
                <div className="mt-2 text-xs font-bold text-amber-400 animate-pulse">
                  Sedang membaca dan memvalidasi file Excel...
                </div>
              )}
            </div>
          )}

          {/* Hasil Validasi & Preview */}
          {parseResult && (
            <div className="space-y-4">
              {/* File Info Bar */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-xs">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-slate-200">{fileName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParseResult(null);
                    setFileName('');
                  }}
                  className="text-xs text-rose-400 hover:underline font-bold"
                >
                  Ganti File Lain
                </button>
              </div>

              {/* Status Metric Chips */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-lg font-black text-emerald-300">
                      {parseResult.validAthletes.length}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-semibold">
                      Atlet Valid
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-800/60 flex items-center gap-3">
                  <Layers className="w-6 h-6 text-sky-400 shrink-0" />
                  <div>
                    <div className="text-lg font-black text-sky-300">
                      {uniqueCategories}
                    </div>
                    <div className="text-[11px] text-sky-400 font-semibold">
                      Kategori/Kelas
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-center gap-3">
                  <XCircle className="w-6 h-6 text-rose-400 shrink-0" />
                  <div>
                    <div className="text-lg font-black text-rose-300">
                      {parseResult.errors.length}
                    </div>
                    <div className="text-[11px] text-rose-400 font-semibold">
                      Baris Error
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-lg font-black text-amber-300">
                      {parseResult.duplicateWarnings.length}
                    </div>
                    <div className="text-[11px] text-amber-400 font-semibold">
                      Peringatan Duplikat
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabel Error Jika Ada */}
              {parseResult.errors.length > 0 && (
                <div className="border border-rose-800/80 rounded-2xl bg-rose-950/30 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>Daftar Baris Error (Baris Ini Dilewati)</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-rose-900/50 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-rose-950/80 text-rose-300 sticky top-0 font-bold border-b border-rose-900">
                        <tr>
                          <th className="py-1.5 px-3 w-16">Baris</th>
                          <th className="py-1.5 px-3 w-32">Kolom</th>
                          <th className="py-1.5 px-3">Penyebab Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-900/40 text-rose-200">
                        {parseResult.errors.map((err, idx) => (
                          <tr key={idx} className="hover:bg-rose-900/20">
                            <td className="py-1.5 px-3 font-mono font-bold">
                              {err.row}
                            </td>
                            <td className="py-1.5 px-3 font-semibold text-rose-300">
                              {err.field}
                            </td>
                            <td className="py-1.5 px-3">{err.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Warning Duplikat Jika Ada */}
              {parseResult.duplicateWarnings.length > 0 && (
                <div className="border border-amber-800/80 rounded-2xl bg-amber-950/30 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Peringatan Validasi &amp; Duplikasi Kategori</span>
                  </div>
                  <ul className="text-xs text-amber-200/90 list-disc list-inside space-y-1 max-h-28 overflow-y-auto">
                    {parseResult.duplicateWarnings.map((warn, idx) => (
                      <li key={idx}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tabel Preview Atlet Valid */}
              <div className="border border-slate-800 rounded-2xl bg-slate-950/40 p-4 space-y-2">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Preview Atlet yang Akan Diimpor ({parseResult.validAthletes.length})
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-300 sticky top-0 font-bold border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Nama Atlet</th>
                        <th className="py-2 px-3">Daerah</th>
                        <th className="py-2 px-3">Logo</th>
                        <th className="py-2 px-3">Kode</th>
                        <th className="py-2 px-3">Style</th>
                        <th className="py-2 px-3">Usia</th>
                        <th className="py-2 px-3">Kelas</th>
                        <th className="py-2 px-3">Seed</th>
                        <th className="py-2 px-3 text-center">No. Bola</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {parseResult.validAthletes.slice(0, 50).map((ath, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="py-1.5 px-3 font-semibold text-white">
                            {ath.name}
                          </td>
                          <td className="py-1.5 px-3">{ath.region}</td>
                          <td className="py-1.5 px-3">
                            <RegionFlag
                              code={ath.regionCode}
                              regionName={ath.region}
                              size="sm"
                            />
                          </td>
                          <td className="py-1.5 px-3 font-mono text-sky-400 font-bold">
                            {ath.regionCode}
                          </td>
                          <td className="py-1.5 px-3 font-bold text-amber-400">
                            {ath.style}
                          </td>
                          <td className="py-1.5 px-3 text-slate-400">
                            {ath.ageCategory}
                          </td>
                          <td className="py-1.5 px-3 font-bold text-emerald-400">
                            {ath.weightClass}
                          </td>
                          <td className="py-1.5 px-3 font-mono">
                            {ath.seed ? `#${ath.seed}` : '-'}
                          </td>
                          <td className="py-1.5 px-3 text-center font-mono">
                            {ath.drawNumber ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-700/80 font-black">
                                #{ath.drawNumber}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parseResult.validAthletes.length > 50 && (
                    <div className="p-2 text-center text-xs text-slate-500 italic bg-slate-900/40">
                      Menampilkan 50 dari {parseResult.validAthletes.length} atlet...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
          >
            Batal
          </button>

          {parseResult && parseResult.validAthletes.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleConfirmImport('MERGE')}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-sky-950"
              >
                <span>Gabung (Merge)</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleConfirmImport('REPLACE')}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-rose-950"
              >
                <span>Ganti Semua (Replace)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
