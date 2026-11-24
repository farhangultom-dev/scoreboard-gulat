import { useState, useEffect } from 'react';
import { useMatchStore } from '../../store/useMatchStore';
import { WrestlingStyle, AgeCategory } from '../../types/match';
import { getPeriodDurationMs } from '../../engine/uwwRules';
import { X, Save, ShieldAlert } from 'lucide-react';

interface MatchSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MatchSetupModal({ isOpen, onClose }: MatchSetupModalProps) {
  const match = useMatchStore((s) => s.match);
  const updateMetadata = useMatchStore((s) => s.updateMetadata);
  const updateWrestlers = useMatchStore((s) => s.updateWrestlers);
  const setMainClock = useMatchStore((s) => s.setMainClock);

  const [matName, setMatName] = useState(match.metadata.matName);
  const [boutNumber, setBoutNumber] = useState(match.metadata.boutNumber);
  const [style, setStyle] = useState<WrestlingStyle>(match.metadata.style);
  const [ageCategory, setAgeCategory] = useState<AgeCategory>(match.metadata.ageCategory);
  const [weightClass, setWeightClass] = useState(match.metadata.weightClass);

  const [redName, setRedName] = useState(match.red.name);
  const [redTeam, setRedTeam] = useState(match.red.countryOrTeam);

  const [blueName, setBlueName] = useState(match.blue.name);
  const [blueTeam, setBlueTeam] = useState(match.blue.countryOrTeam);

  useEffect(() => {
    if (isOpen) {
      setMatName(match.metadata.matName);
      setBoutNumber(match.metadata.boutNumber);
      setStyle(match.metadata.style);
      setAgeCategory(match.metadata.ageCategory);
      setWeightClass(match.metadata.weightClass);
      setRedName(match.red.name);
      setRedTeam(match.red.countryOrTeam);
      setBlueName(match.blue.name);
      setBlueTeam(match.blue.countryOrTeam);
    }
  }, [isOpen, match]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    updateMetadata({
      matName: matName.trim() || 'MAT A',
      boutNumber: boutNumber.trim() || 'BOUT 1',
      style,
      ageCategory,
      weightClass: weightClass.trim() || '74 KG',
    });

    updateWrestlers(
      {
        name: redName.trim() || 'RED WRESTLER',
        countryOrTeam: redTeam.trim().toUpperCase() || 'INA',
      },
      {
        name: blueName.trim() || 'BLUE WRESTLER',
        countryOrTeam: blueTeam.trim().toUpperCase() || 'JPN',
      }
    );

    // Jika pertandingan belum mulai, sesuaikan durasi main clock dengan kategori umur baru
    if (match.phase === 'PRE_MATCH' && !match.mainClock.isRunning) {
      setMainClock(getPeriodDurationMs(ageCategory));
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Pengaturan Pertandingan (Match Setup)
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto">
          {/* Metadata Grid */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Informasi Partai & Kategori
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Matras (Mat)
                </label>
                <input
                  type="text"
                  value={matName}
                  onChange={(e) => setMatName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-hidden focus:border-sky-500"
                  placeholder="MAT A"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nomor Partai (Bout)
                </label>
                <input
                  type="text"
                  value={boutNumber}
                  onChange={(e) => setBoutNumber(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-hidden focus:border-sky-500"
                  placeholder="BOUT 14"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Gaya Gulat (Style)
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as WrestlingStyle)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-hidden focus:border-sky-500 cursor-pointer"
                >
                  <option value="FS">Freestyle (FS)</option>
                  <option value="WW">Women's Wrestling (WW)</option>
                  <option value="GR">Greco-Roman (GR)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kategori Umur
                </label>
                <select
                  value={ageCategory}
                  onChange={(e) => setAgeCategory(e.target.value as AgeCategory)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-hidden focus:border-sky-500 cursor-pointer"
                >
                  <option value="SENIOR">SENIOR (2x 3:00)</option>
                  <option value="U23">U23 (2x 3:00)</option>
                  <option value="U20">U20 (2x 3:00)</option>
                  <option value="U17">U17 (2x 2:00)</option>
                  <option value="U15">U15 (2x 2:00)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kelas Berat (Weight)
                </label>
                <input
                  type="text"
                  value={weightClass}
                  onChange={(e) => setWeightClass(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-hidden focus:border-sky-500"
                  placeholder="74 KG"
                />
              </div>
            </div>
          </div>

          {/* Wrestlers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* RED Corner */}
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-700/50 space-y-3">
              <span className="text-xs font-black uppercase text-red-400 tracking-wider">
                Sudut Merah (RED)
              </span>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nama Pegulat
                </label>
                <input
                  type="text"
                  value={redName}
                  onChange={(e) => setRedName(e.target.value)}
                  className="w-full bg-slate-800 border border-red-700/60 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-hidden focus:border-red-500"
                  placeholder="Nama Lengkap"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kontingen / Negara (3-6 Huruf)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={redTeam}
                  onChange={(e) => setRedTeam(e.target.value.toUpperCase())}
                  className="w-full bg-slate-800 border border-red-700/60 rounded-lg px-3 py-1.5 text-sm text-white font-mono uppercase focus:outline-hidden focus:border-red-500"
                  placeholder="INA / JABAR"
                />
              </div>
            </div>

            {/* BLUE Corner */}
            <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-700/50 space-y-3">
              <span className="text-xs font-black uppercase text-blue-400 tracking-wider">
                Sudut Biru (BLUE)
              </span>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nama Pegulat
                </label>
                <input
                  type="text"
                  value={blueName}
                  onChange={(e) => setBlueName(e.target.value)}
                  className="w-full bg-slate-800 border border-blue-700/60 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-hidden focus:border-blue-500"
                  placeholder="Nama Lengkap"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kontingen / Negara (3-6 Huruf)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={blueTeam}
                  onChange={(e) => setBlueTeam(e.target.value.toUpperCase())}
                  className="w-full bg-slate-800 border border-blue-700/60 rounded-lg px-3 py-1.5 text-sm text-white font-mono uppercase focus:outline-hidden focus:border-blue-500"
                  placeholder="JPN / JATIM"
                />
              </div>
            </div>
          </div>

          {match.events.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-950/40 border border-amber-700/40 text-amber-300 text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Catatan: Pertandingan sudah memiliki {match.events.length} riwayat poin. Mengubah gaya (FS vs GR) akan memengaruhi aturan passivity berikutnya.
              </span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Simpan Pengaturan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
