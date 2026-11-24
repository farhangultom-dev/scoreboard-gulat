import { useMatchStore } from '../../store/useMatchStore';

export default function DisplayHeader() {
  const metadata = useMatchStore((s) => s.match.metadata);
  const phase = useMatchStore((s) => s.match.phase);

  const getStyleLabel = () => {
    switch (metadata.style) {
      case 'FS':
        return 'FREESTYLE';
      case 'WW':
        return "WOMEN'S WRESTLING";
      case 'GR':
        return 'GRECO-ROMAN';
      default:
        return metadata.style;
    }
  };

  const getPhaseLabel = () => {
    switch (phase) {
      case 'PRE_MATCH':
        return 'PRE-MATCH';
      case 'PERIOD_1':
        return 'PERIOD 1';
      case 'BREAK':
        return 'BREAK';
      case 'PERIOD_2':
        return 'PERIOD 2';
      case 'FINISHED':
        return 'MATCH FINISHED';
      default:
        return phase;
    }
  };

  return (
    <header className="h-[10vh] min-h-[56px] w-full bg-slate-900/90 border-b-2 border-slate-800 px-6 flex items-center justify-between text-white shadow-lg">
      {/* Kiri: Matras & Nomor Partai */}
      <div className="flex items-center gap-3">
        <span className="px-3.5 py-1 rounded-lg bg-slate-800 text-white font-black text-sm md:text-base tracking-widest uppercase border border-slate-700">
          {metadata.matName}
        </span>
        <span className="text-sm md:text-base font-extrabold text-amber-400 tracking-wider uppercase">
          {metadata.boutNumber}
        </span>
      </div>

      {/* Tengah: Gaya, Kelas Berat & Kategori Umur */}
      <div className="flex items-center gap-2">
        <div className="px-4 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs md:text-sm font-black tracking-widest uppercase text-slate-200">
          {getStyleLabel()} • {metadata.weightClass} • {metadata.ageCategory}
        </div>
      </div>

      {/* Kanan: Indikator Babak Besar */}
      <div className="flex items-center">
        <span
          className={`px-4 py-1 rounded-lg font-black text-xs md:text-base tracking-widest uppercase shadow-sm ${
            phase === 'BREAK'
              ? 'bg-amber-500 text-slate-950 animate-pulse'
              : phase === 'PERIOD_1' || phase === 'PERIOD_2'
              ? 'bg-sky-500 text-white'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
        >
          {getPhaseLabel()}
        </span>
      </div>
    </header>
  );
}
