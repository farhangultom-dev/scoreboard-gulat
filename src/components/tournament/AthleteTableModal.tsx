import React, { useState, useEffect } from 'react';
import { X, UserPlus, Save, AlertCircle } from 'lucide-react';
import { Athlete } from '../../types/tournament';
import { AgeCategory, WrestlingStyle } from '../../types/match';
import { normalizeRegionCode, normalizeWeightClass } from '../../engine/excelImporter';
import { useTournamentStore } from '../../store/useTournamentStore';

interface AthleteTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  athleteToEdit?: Athlete | null;
  defaultStyle?: WrestlingStyle;
  defaultAgeCategory?: AgeCategory;
  defaultWeightClass?: string;
}

export default function AthleteTableModal({
  isOpen,
  onClose,
  athleteToEdit,
  defaultStyle = 'FS',
  defaultAgeCategory = 'SENIOR',
  defaultWeightClass = '74 KG',
}: AthleteTableModalProps) {
  const addAthlete = useTournamentStore((s) => s.addAthlete);
  const updateAthlete = useTournamentStore((s) => s.updateAthlete);

  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [regionCode, setRegionCode] = useState('');
  const [style, setStyle] = useState<WrestlingStyle>(defaultStyle);
  const [ageCategory, setAgeCategory] = useState<AgeCategory>(defaultAgeCategory);
  const [weightClass, setWeightClass] = useState(defaultWeightClass);
  const [seed, setSeed] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (athleteToEdit) {
      setName(athleteToEdit.name);
      setRegion(athleteToEdit.region);
      setRegionCode(athleteToEdit.regionCode);
      setStyle(athleteToEdit.style);
      setAgeCategory(athleteToEdit.ageCategory);
      setWeightClass(athleteToEdit.weightClass);
      setSeed(athleteToEdit.seed ? String(athleteToEdit.seed) : '');
    } else {
      setName('');
      setRegion('');
      setRegionCode('');
      setStyle(defaultStyle);
      setAgeCategory(defaultAgeCategory);
      setWeightClass(defaultWeightClass);
      setSeed('');
    }
    setErrorMsg(null);
  }, [athleteToEdit, defaultStyle, defaultAgeCategory, defaultWeightClass, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = name.trim();
    const cleanRegion = region.trim();
    if (!cleanName) {
      setErrorMsg('Nama atlet tidak boleh kosong');
      return;
    }
    if (!cleanRegion) {
      setErrorMsg('Daerah asal / kontingen tidak boleh kosong');
      return;
    }

    const normWeight = normalizeWeightClass(weightClass);
    if (!normWeight) {
      setErrorMsg('Kelas berat tidak valid. Contoh: "74" atau "74 KG"');
      return;
    }

    const normCode = normalizeRegionCode(cleanRegion, regionCode);
    const parsedSeed = seed ? parseInt(seed, 10) : undefined;

    try {
      if (athleteToEdit) {
        await updateAthlete(athleteToEdit.id, {
          name: cleanName,
          region: cleanRegion.toUpperCase(),
          regionCode: normCode,
          style,
          ageCategory,
          weightClass: normWeight,
          seed: parsedSeed,
        });
      } else {
        await addAthlete({
          name: cleanName,
          region: cleanRegion.toUpperCase(),
          regionCode: normCode,
          style,
          ageCategory,
          weightClass: normWeight,
          seed: parsedSeed,
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to save athlete:', err);
      setErrorMsg('Terjadi kesalahan saat menyimpan data atlet');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-slate-700 rounded-3xl shadow-2xl text-white flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider">
                {athleteToEdit ? 'Koreksi Data Atlet (Weigh-in)' : 'Tambah Atlet Manual'}
              </h2>
              <p className="text-xs text-slate-400">
                Pembaruan data pegulat tersimpan ke database turnamen
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Nama Lengkap Atlet */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wide">
              Nama Lengkap Atlet <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-hidden focus:border-sky-500 transition"
            />
          </div>

          {/* Daerah Asal & Kode Singkat */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wide">
                Daerah / Kontingen <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Contoh: JAWA BARAT"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-hidden focus:border-sky-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wide">
                Kode TV
              </label>
              <input
                type="text"
                maxLength={5}
                value={regionCode}
                onChange={(e) => setRegionCode(e.target.value.toUpperCase())}
                placeholder="JBR"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-sky-400 text-center uppercase focus:outline-hidden focus:border-sky-500 transition"
              />
            </div>
          </div>

          {/* Style, Usia, Kelas Berat */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wide">
                Gaya (Style)
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as WrestlingStyle)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-amber-400 focus:outline-hidden focus:border-sky-500 transition cursor-pointer"
              >
                <option value="FS">Freestyle (FS)</option>
                <option value="GR">Greco-Roman (GR)</option>
                <option value="WW">Women (WW)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wide">
                Kategori Usia
              </label>
              <select
                value={ageCategory}
                onChange={(e) => setAgeCategory(e.target.value as AgeCategory)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-semibold text-slate-200 focus:outline-hidden focus:border-sky-500 transition cursor-pointer"
              >
                <option value="SENIOR">SENIOR</option>
                <option value="U23">U23</option>
                <option value="U20">U20</option>
                <option value="U17">U17</option>
                <option value="U15">U15</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wide">
                Kelas Berat <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={weightClass}
                onChange={(e) => setWeightClass(e.target.value)}
                placeholder="74 KG"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-emerald-400 text-center focus:outline-hidden focus:border-sky-500 transition"
              />
            </div>
          </div>

          {/* Seed Unggulan (1..4) */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wide">
              Unggulan (Seeding UWW)
            </label>
            <select
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-300 focus:outline-hidden focus:border-sky-500 transition cursor-pointer"
            >
              <option value="">Tanpa Unggulan (Non-Seed)</option>
              <option value="1">Seed #1 (Unggulan 1)</option>
              <option value="2">Seed #2 (Unggulan 2)</option>
              <option value="3">Seed #3 (Unggulan 3)</option>
              <option value="4">Seed #4 (Unggulan 4)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Unggulan 1..4 otomatis ditempatkan pada posisi bracket yang terpisah saat fase pengundian.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-sky-950 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{athleteToEdit ? 'Simpan Perubahan' : 'Tambah Atlet'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
