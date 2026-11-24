import { UpcomingBoutSnapshot } from '../../types/tournament';
import { Clock } from 'lucide-react';
import RegionFlag from '../common/RegionFlag';

interface UpcomingBoutTableProps {
  bouts: UpcomingBoutSnapshot[];
}

export default function UpcomingBoutTable({ bouts }: UpcomingBoutTableProps) {
  if (bouts.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 font-bold text-sm bg-slate-900/50 rounded-2xl border border-slate-800">
        Belum ada partai antrean selanjutnya.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-2xl">
      <table className="w-full text-left text-xs md:text-sm">
        <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 text-[11px] md:text-xs">
          <tr>
            <th className="py-2.5 px-4 w-24">Matras</th>
            <th className="py-2.5 px-3 w-16 text-center">Partai</th>
            <th className="py-2.5 px-4">Kategori &amp; Babak</th>
            <th className="py-2.5 px-4">Sudut Merah (RED)</th>
            <th className="py-2.5 px-4">Sudut Biru (BLUE)</th>
            <th className="py-2.5 px-4 text-center w-40">Status Antrean</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-200">
          {bouts.slice(0, 10).map((bout) => {
            const isOnDeck = bout.queueBadge === 'ON_DECK';
            const isInTheHole = bout.queueBadge === 'IN_THE_HOLE';

            return (
              <tr
                key={bout.id}
                className={`transition ${
                  isOnDeck
                    ? 'bg-amber-950/30 font-bold'
                    : isInTheHole
                    ? 'bg-sky-950/20'
                    : 'hover:bg-slate-800/40'
                }`}
              >
                {/* Matras Name */}
                <td className="py-2.5 px-4 font-mono font-black text-amber-400">
                  {bout.matName}
                </td>

                {/* Bout Number */}
                <td className="py-2.5 px-3 text-center font-mono font-black text-white">
                  {bout.boutNumber ? `#${bout.boutNumber}` : '-'}
                </td>

                {/* Kategori & Babak */}
                <td className="py-2.5 px-4">
                  <div className="font-extrabold text-white text-xs md:text-sm">
                    {bout.divisionLabel}
                  </div>
                  <div className="text-[10px] md:text-xs text-slate-400 font-semibold uppercase">
                    {bout.roundLabel}
                  </div>
                </td>

                {/* Sudut Merah */}
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    <RegionFlag
                      code={bout.redRegion}
                      regionName={bout.redRegion}
                      size="sm"
                    />
                    <span className="font-bold text-red-300 truncate max-w-[160px]">
                      {bout.redName}
                    </span>
                    <span className="font-mono text-xs text-slate-400 shrink-0">
                      ({bout.redRegion})
                    </span>
                  </div>
                </td>

                {/* Sudut Biru */}
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                    <RegionFlag
                      code={bout.blueRegion}
                      regionName={bout.blueRegion}
                      size="sm"
                    />
                    <span className="font-bold text-blue-300 truncate max-w-[160px]">
                      {bout.blueName}
                    </span>
                    <span className="font-mono text-xs text-slate-400 shrink-0">
                      ({bout.blueRegion})
                    </span>
                  </div>
                </td>

                {/* Status Queue Badge */}
                <td className="py-2.5 px-4 text-center">
                  {isOnDeck ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow-md shadow-amber-950 animate-pulse">
                      <Clock className="w-3.5 h-3.5 fill-slate-950" />
                      ON DECK • SIAP DI MATRAS
                    </span>
                  ) : isInTheHole ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-sky-950 text-sky-400 border border-sky-700/80">
                      IN THE HOLE • PEMANASAN
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400">
                      UPCOMING
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
