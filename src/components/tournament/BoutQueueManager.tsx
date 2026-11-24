import { useState, useMemo } from 'react';
import {
  ListOrdered,
  Play,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { TournamentBout } from '../../types/tournament';

export default function BoutQueueManager() {
  const bouts = useTournamentStore((s) => s.bouts);
  const orderOfBouts = useTournamentStore((s) => s.orderOfBouts);
  const divisions = useTournamentStore((s) => s.divisions);
  const athletes = useTournamentStore((s) => s.athletes);

  const generateMasterOrder = useTournamentStore(
    (s) => s.generateMasterOrderOfBouts
  );
  const reorderBout = useTournamentStore((s) => s.reorderBout);
  const setBoutMat = useTournamentStore((s) => s.setBoutMat);
  const loadBoutToMatch = useTournamentStore((s) => s.loadBoutToMatch);

  const [matFilter, setMatFilter] = useState<string>('ALL');
  const [isGenerating, setIsGenerating] = useState(false);

  // Daftar partai tersusun sesuai orderOfBouts
  const orderedBoutList = useMemo(() => {
    if (orderOfBouts.length === 0) {
      // Fallback: tampilkan semua bouts jika belum di-generate
      return Object.values(bouts);
    }
    return orderOfBouts
      .map((id) => bouts[id])
      .filter((b): b is TournamentBout => Boolean(b));
  }, [bouts, orderOfBouts]);

  // Filter berdasarkan Matras
  const filteredBoutList = useMemo(() => {
    if (matFilter === 'ALL') return orderedBoutList;
    return orderedBoutList.filter((b) => (b.matName || 'MAT A') === matFilter);
  }, [orderedBoutList, matFilter]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    await generateMasterOrder();
    setTimeout(() => setIsGenerating(false), 300);
  };

  const handleMoveUp = async (boutId: string) => {
    const idx = orderOfBouts.indexOf(boutId);
    if (idx > 0) {
      await reorderBout(idx, idx - 1);
    }
  };

  const handleMoveDown = async (boutId: string) => {
    const idx = orderOfBouts.indexOf(boutId);
    if (idx >= 0 && idx < orderOfBouts.length - 1) {
      await reorderBout(idx, idx + 1);
    }
  };

  const totalBouts = Object.keys(bouts).length;
  const completedBouts = Object.values(bouts).filter(
    (b) => b.status === 'COMPLETED'
  ).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 text-white select-none">
      {/* Header Info & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ListOrdered className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-black uppercase tracking-wider text-white">
              Master Order of Bouts (Antrean Pertandingan)
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Susunan jadwal kronologis lintas kelas dengan penomoran resmi per matras
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter Matras */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400 font-bold uppercase">Filter:</span>
            <select
              value={matFilter}
              onChange={(e) => setMatFilter(e.target.value)}
              className="bg-transparent font-bold text-amber-400 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">Semua Matras</option>
              <option value="MAT A" className="bg-slate-900 text-white">MAT A</option>
              <option value="MAT B" className="bg-slate-900 text-white">MAT B</option>
              <option value="MAT C" className="bg-slate-900 text-white">MAT C</option>
              <option value="MAT D" className="bg-slate-900 text-white">MAT D</option>
            </select>
          </div>

          {/* Generate Master Order */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={totalBouts === 0 || isGenerating}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-sky-950 disabled:opacity-40 cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>Generate Master Order</span>
          </button>
        </div>
      </div>

      {/* Metric Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-slate-400 uppercase font-bold text-[10px]">Total Partai</span>
          <div className="text-xl font-black text-white mt-0.5">{totalBouts}</div>
        </div>
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-emerald-400 uppercase font-bold text-[10px]">Selesai</span>
          <div className="text-xl font-black text-emerald-400 mt-0.5">{completedBouts}</div>
        </div>
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-sky-400 uppercase font-bold text-[10px]">Tersisa</span>
          <div className="text-xl font-black text-sky-400 mt-0.5">
            {totalBouts - completedBouts}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-amber-400 uppercase font-bold text-[10px]">Matras Aktif</span>
          <div className="text-xl font-black text-amber-400 mt-0.5">{matFilter}</div>
        </div>
      </div>

      {/* Bouts List Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        {filteredBoutList.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Belum ada partai pertandingan. Kunci undian kelas pada tab bagan dan klik{' '}
            <strong className="text-white">&quot;Generate Master Order&quot;</strong>.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3 w-16 text-center">Partai</th>
                <th className="py-2.5 px-3 w-28">Matras</th>
                <th className="py-2.5 px-3">Kategori &amp; Babak</th>
                <th className="py-2.5 px-3">Sudut Merah (RED)</th>
                <th className="py-2.5 px-3">Sudut Biru (BLUE)</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center w-24">Urutan</th>
                <th className="py-2.5 px-3 text-right w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredBoutList.map((bout, idx) => {
                const div = divisions[bout.divisionId];
                const redAth = bout.redAthleteId ? athletes[bout.redAthleteId] : null;
                const blueAth = bout.blueAthleteId ? athletes[bout.blueAthleteId] : null;

                const isCompleted = bout.status === 'COMPLETED';
                const isInProgress = bout.status === 'IN_PROGRESS';
                const isOnDeck = bout.status === 'ON_DECK';

                return (
                  <tr
                    key={bout.id}
                    className={`hover:bg-slate-800/30 transition ${
                      isInProgress
                        ? 'bg-emerald-950/20'
                        : isOnDeck
                        ? 'bg-amber-950/20'
                        : ''
                    }`}
                  >
                    {/* Nomor Partai Resmi */}
                    <td className="py-2.5 px-3 text-center font-mono font-black text-amber-400">
                      {bout.boutNumber ? `#${bout.boutNumber}` : `-`}
                    </td>

                    {/* Selector Matras */}
                    <td className="py-2.5 px-3">
                      <select
                        value={bout.matName || 'MAT A'}
                        onChange={(e) => setBoutMat(bout.id, e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold text-amber-400 focus:outline-hidden"
                      >
                        <option value="MAT A">MAT A</option>
                        <option value="MAT B">MAT B</option>
                        <option value="MAT C">MAT C</option>
                        <option value="MAT D">MAT D</option>
                      </select>
                    </td>

                    {/* Kategori & Babak */}
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white">
                        {div ? `${div.style} ${div.weightClass}` : bout.divisionId}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {bout.round.replace('_', ' ')}
                      </div>
                    </td>

                    {/* Sudut Merah */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <span className="font-bold text-red-300 truncate max-w-[140px]">
                          {redAth ? redAth.name : bout.redSourceLabel || 'TBD'}
                        </span>
                        {redAth && (
                          <span className="font-mono text-[10px] text-slate-400">
                            ({redAth.regionCode})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Sudut Biru */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="font-bold text-blue-300 truncate max-w-[140px]">
                          {blueAth ? blueAth.name : bout.blueSourceLabel || 'TBD'}
                        </span>
                        {blueAth && (
                          <span className="font-mono text-[10px] text-slate-400">
                            ({blueAth.regionCode})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-2.5 px-3 text-center">
                      {isCompleted ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-800">
                          SELESAI ({bout.result?.redScore}-{bout.result?.blueScore})
                        </span>
                      ) : isInProgress ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500 animate-pulse">
                          ON MAT
                        </span>
                      ) : isOnDeck ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-400 border border-amber-600 animate-pulse">
                          ON DECK
                        </span>
                      ) : bout.status === 'SCHEDULED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-950 text-sky-400 border border-sky-800">
                          SCHEDULED
                        </span>
                      ) : (
                        <span className="text-slate-600 font-mono text-[10px]">TBD</span>
                      )}
                    </td>

                    {/* Up / Down Controls */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(bout.id)}
                          disabled={idx === 0}
                          className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                          title="Geser Naik"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(bout.id)}
                          disabled={idx === filteredBoutList.length - 1}
                          className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                          title="Geser Turun"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </td>

                    {/* Quick Load to Scoreboard */}
                    <td className="py-2.5 px-3 text-right">
                      {bout.status !== 'TBD' && !isCompleted && (
                        <button
                          type="button"
                          onClick={() => loadBoutToMatch(bout.id)}
                          className="px-2.5 py-1 rounded-lg bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 text-[10px] font-bold transition cursor-pointer"
                          title="Muat partai ke scoreboard"
                        >
                          Load
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
