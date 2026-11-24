import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { ActiveMatSnapshot } from '../../types/tournament';
import RegionFlag from '../common/RegionFlag';

interface LiveMatCardProps {
  snapshot?: ActiveMatSnapshot | null;
  matName: string;
}

export default function LiveMatCard({ snapshot, matName }: LiveMatCardProps) {
  // Real-time ticking for live timer if isRunning
  const [displayMs, setDisplayMs] = useState(snapshot?.remainingMs || 0);

  useEffect(() => {
    if (!snapshot) {
      setDisplayMs(0);
      return;
    }

    if (!snapshot.isRunning || !snapshot.lastSyncedAt) {
      setDisplayMs(snapshot.remainingMs);
      return;
    }

    // Ticking calculation
    const interval = setInterval(() => {
      const elapsed = Date.now() - (snapshot.lastSyncedAt || Date.now());
      const current = Math.max(0, snapshot.remainingMs - elapsed);
      setDisplayMs(current);
    }, 100);

    return () => clearInterval(interval);
  }, [snapshot]);

  const formatTimer = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!snapshot) {
    return (
      <div className="bg-slate-900/60 border-2 border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center text-center shadow-xl min-h-[220px]">
        <span className="font-mono font-black text-2xl tracking-widest text-slate-500 uppercase">
          {matName}
        </span>
        <div className="mt-3 flex items-center gap-2 text-slate-600 text-sm font-bold uppercase tracking-wider">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
          <span>STANDBY • MATRAS SIAP</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col justify-between overflow-hidden relative group">
      {/* Top Banner: Mat Name, Bout Number, Category & Round */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <span className="font-mono font-black text-lg md:text-xl tracking-wider text-amber-400 bg-amber-950/60 px-3 py-1 rounded-xl border border-amber-700/60">
            {matName}
          </span>
          {snapshot.boutNumber && (
            <span className="font-mono font-black text-sm md:text-base text-white bg-slate-800 px-2.5 py-1 rounded-xl">
              BOUT #{snapshot.boutNumber}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 text-xs font-black tracking-wider uppercase">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>LIVE</span>
          </div>
          <span className="text-xs md:text-sm font-black text-slate-300 uppercase tracking-wide truncate max-w-[200px]">
            {snapshot.divisionLabel}
          </span>
        </div>
      </div>

      {/* Main Arena: Red Corner | Live Clock & Period | Blue Corner */}
      <div className="grid grid-cols-12 gap-3 items-center py-4">
        {/* Sudut Merah */}
        <div className="col-span-5 bg-gradient-to-r from-red-950/80 to-red-900/60 border-2 border-red-600/70 rounded-2xl p-3.5 flex items-center justify-between gap-2 shadow-lg overflow-hidden">
          <div className="flex items-center gap-2.5 min-w-0 pr-1">
            <RegionFlag
              code={snapshot.redRegion}
              regionName={snapshot.redRegion}
              size="md"
            />
            <div className="min-w-0">
              <span className="font-mono font-black text-xs md:text-sm text-red-300 bg-black/40 px-2 py-0.5 rounded-lg uppercase">
                {snapshot.redRegion}
              </span>
              <h3 className="font-black text-sm md:text-lg text-white uppercase truncate mt-1">
                {snapshot.redName}
              </h3>
            </div>
          </div>
          <div className="font-mono font-black text-4xl md:text-5xl text-white tabular-nums shrink-0">
            {snapshot.redScore}
          </div>
        </div>

        {/* Center Clock & Period Indicator */}
        <div className="col-span-2 flex flex-col items-center justify-center text-center">
          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-400 text-[10px] md:text-xs font-black tracking-wider uppercase mb-1">
            {snapshot.periodLabel}
          </span>
          <div
            className={`font-mono font-black text-2xl md:text-3xl tabular-nums tracking-tighter ${
              snapshot.isRunning ? 'text-white' : 'text-amber-400'
            }`}
          >
            {formatTimer(displayMs)}
          </div>
        </div>

        {/* Sudut Biru */}
        <div className="col-span-5 bg-gradient-to-l from-blue-950/80 to-blue-900/60 border-2 border-blue-600/70 rounded-2xl p-3.5 flex items-center justify-between gap-2 shadow-lg overflow-hidden">
          <div className="font-mono font-black text-4xl md:text-5xl text-white tabular-nums shrink-0">
            {snapshot.blueScore}
          </div>
          <div className="flex items-center gap-2.5 min-w-0 pl-1 justify-end">
            <div className="min-w-0 text-right">
              <span className="font-mono font-black text-xs md:text-sm text-blue-300 bg-black/40 px-2 py-0.5 rounded-lg uppercase">
                {snapshot.blueRegion}
              </span>
              <h3 className="font-black text-sm md:text-lg text-white uppercase truncate mt-1">
                {snapshot.blueName}
              </h3>
            </div>
            <RegionFlag
              code={snapshot.blueRegion}
              regionName={snapshot.blueRegion}
              size="md"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
