import { useMatchStore } from '../../store/useMatchStore';
import { formatClock } from '../../engine/timerEngine';
import { History, Undo2 } from 'lucide-react';

export default function EventLogPanel() {
  const match = useMatchStore((s) => s.match);
  const undoLastEvent = useMatchStore((s) => s.undoLastEvent);

  const reversedEvents = [...match.events].reverse();

  const getEventBadgeClass = (corner: 'RED' | 'BLUE') => {
    return corner === 'RED'
      ? 'bg-red-950 text-red-300 border-red-700/60'
      : 'bg-blue-950 text-blue-300 border-blue-700/60';
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col justify-between shadow-lg">
      {/* Header with Undo Button */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Riwayat Kronologis ({match.events.length})
          </span>
        </div>

        <button
          type="button"
          onClick={undoLastEvent}
          disabled={match.events.length === 0}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer ${
            match.events.length > 0
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 active:scale-95'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          }`}
          title="Batalkan aksi terakhir (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
          UNDO (Ctrl+Z)
        </button>
      </div>

      {/* Events List */}
      <div className="space-y-1.5 overflow-y-auto max-h-[140px] pr-1 scrollbar-thin">
        {reversedEvents.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 italic">
            Belum ada aksi poin atau pelanggaran tercatat.
          </div>
        ) : (
          reversedEvents.map((evt) => {
            const timeStr = formatClock(evt.matchClockMs, false);
            return (
              <div
                key={evt.id}
                className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                    P{evt.period} {timeStr}
                  </span>

                  <span
                    className={`font-black uppercase text-[10px] px-1.5 py-0.5 rounded border ${getEventBadgeClass(
                      evt.corner
                    )}`}
                  >
                    {evt.corner}
                  </span>

                  <span className="font-semibold text-slate-200">
                    {evt.points > 0 ? `+${evt.points}` : ''}{' '}
                    <span className="text-slate-400 font-normal">({evt.type})</span>
                  </span>
                </div>

                {evt.note && (
                  <span className="text-[10px] text-slate-400 italic truncate max-w-[120px]">
                    {evt.note}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
