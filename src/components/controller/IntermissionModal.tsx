import { useState, useEffect } from 'react';
import { Coffee, Play, Pause, X, Clock } from 'lucide-react';
import { useMatchStore } from '../../store/useMatchStore';
import { parseClockToMs } from '../../engine/timerEngine';

interface IntermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_MINUTES = [10, 15, 30, 45, 60];

const PRESET_TITLES = [
  'ISTIRAHAT PERTANDINGAN',
  'ISTIRAHAT SHOLAT & MAKAN (ISOMA)',
  'PERSIAPAN BABAK FINAL',
  'JEDA TEKNIS MATRAS',
];

export default function IntermissionModal({
  isOpen,
  onClose,
}: IntermissionModalProps) {
  const intermission = useMatchStore((s) => s.match.intermission);
  const startIntermission = useMatchStore((s) => s.startIntermission);

  const [title, setTitle] = useState('ISTIRAHAT PERTANDINGAN');
  const [subtitle, setSubtitle] = useState(
    'Pertandingan akan dilanjutkan kembali dalam:'
  );
  const [durationStr, setDurationStr] = useState('30:00');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      if (intermission?.isActive) {
        setTitle(intermission.title || 'ISTIRAHAT PERTANDINGAN');
        setSubtitle(
          intermission.subtitle ||
            'Pertandingan akan dilanjutkan kembali dalam:'
        );
        const mins = Math.max(
          1,
          Math.round(intermission.timer.remainingMs / 60_000)
        );
        setDurationStr(`${mins}:00`);
      } else {
        setTitle('ISTIRAHAT PERTANDINGAN');
        setSubtitle('Pertandingan akan dilanjutkan kembali dalam:');
        setDurationStr('30:00');
      }
    }
  }, [isOpen, intermission]);

  if (!isOpen) return null;

  const parseDurationInputMs = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // Jika operator hanya mengetik angka menit (misal "30"), tafsirkan sebagai 30 menit
    if (/^\d+$/.test(trimmed)) {
      const mins = parseInt(trimmed, 10);
      if (mins > 0) return mins * 60_000;
      return null;
    }
    return parseClockToMs(trimmed);
  };

  const handleApply = (autoStart: boolean) => {
    const ms = parseDurationInputMs(durationStr);
    if (!ms || ms <= 0) {
      setErrorMsg(
        'Format durasi tidak valid! Masukkan menit (contoh: 30) atau MM:SS (contoh: 30:00).'
      );
      return;
    }

    startIntermission({
      durationMs: ms,
      title,
      subtitle,
      autoStart,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-amber-500/50 rounded-3xl shadow-2xl text-white overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wider text-white">
                Layar Istirahat TV (Intermission)
              </h2>
              <p className="text-[11px] text-slate-400">
                Tampilkan hitung mundur jeda sesi di Display TV tanpa mengubah skor partai
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4 text-xs">
          {/* Preset Durasi */}
          <div className="space-y-2">
            <label className="block font-bold uppercase tracking-wider text-slate-300">
              Durasi Hitung Mundur Istirahat:
            </label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_MINUTES.map((mins) => {
                const targetStr = `${mins}:00`;
                const isSelected = durationStr === targetStr || durationStr === String(mins);
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setDurationStr(targetStr);
                      setErrorMsg('');
                    }}
                    className={`py-2 rounded-xl font-black transition cursor-pointer border ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    {mins} Menit
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <input
                type="text"
                value={durationStr}
                onChange={(e) => {
                  setDurationStr(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="30:00 atau 30"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-base font-black text-amber-300 focus:outline-hidden focus:border-amber-400"
              />
              <span className="text-[11px] text-slate-400 shrink-0">
                Format: MM:SS atau angka menit
              </span>
            </div>
          </div>

          {/* Judul Layar */}
          <div className="space-y-2">
            <label className="block font-bold uppercase tracking-wider text-slate-300">
              Judul Pengumuman di TV:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TITLES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTitle(preset)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition border cursor-pointer ${
                    title === preset
                      ? 'bg-sky-600/30 border-sky-400 text-sky-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ISTIRAHAT PERTANDINGAN"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-white focus:outline-hidden focus:border-amber-400"
            />
          </div>

          {/* Keterangan Sub-judul */}
          <div className="space-y-1.5">
            <label className="block font-bold uppercase tracking-wider text-slate-300">
              Keterangan Tambahan:
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Pertandingan akan dilanjutkan kembali dalam:"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-amber-400"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 font-semibold">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={() => handleApply(false)}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Tampilkan (Dijeda)</span>
          </button>

          <button
            type="button"
            onClick={() => handleApply(true)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-slate-950" />
            <span>Tampilkan &amp; Mulai Hitung Mundur</span>
          </button>
        </div>
      </div>
    </div>
  );
}
