import { useMatchStore } from '../../store/useMatchStore';
import { usePrecisionTimer } from '../../hooks/usePrecisionTimer';

export default function CenterClock() {
  const match = useMatchStore((s) => s.match);
  const { mainMs, formattedMain, formattedBreak, formattedActivity } =
    usePrecisionTimer({
      isMaster: false,
      showTenthsUnderTenSeconds: true,
    });

  const isBreak = match.phase === 'BREAK';
  const displayTimeStr = isBreak ? formattedBreak : formattedMain;
  const isUnderTenSec = !isBreak && mainMs > 0 && mainMs < 10_000;

  const activity = match.activityClock;
  const isActivityActive = activity.activeCorner !== null;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full px-2 overflow-visible">
      {/* Jam Utama Raksasa - Presisi tanpa overflow atau tertutup panel lain */}
      <div
        className={`font-mono font-black tabular-nums tracking-tighter text-center transition select-none leading-none whitespace-nowrap ${
          isUnderTenSec
            ? 'text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)] animate-pulse'
            : isBreak
            ? 'text-amber-400'
            : 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]'
        }`}
        style={{
          fontSize: 'clamp(2.5rem, 4.8vw, 5.8rem)',
        }}
      >
        {displayTimeStr}
      </div>

      {/* Label Sub-Jam */}
      <div className="text-[11px] md:text-xs font-bold tracking-widest uppercase text-slate-400 mt-2 whitespace-nowrap">
        {isBreak ? (
          <span className="text-amber-400 font-extrabold animate-pulse">
            BREAK (0:30)
          </span>
        ) : match.phase === 'PERIOD_1' || match.phase === 'PERIOD_2' ? (
          'MATCH CLOCK'
        ) : (
          match.phase
        )}
      </div>

      {/* Activity Clock 30s Pop-up Box */}
      {isActivityActive && (
        <div className="mt-3 w-full max-w-[260px] animate-bounce-short">
          <div className="px-3.5 py-1.5 rounded-xl text-slate-950 font-black text-center shadow-xl border-2 bg-amber-400 border-amber-300 flex items-center justify-center gap-1.5 whitespace-nowrap">
            {activity.activeCorner === 'RED' && (
              <span className="text-base md:text-lg font-black leading-none">◀</span>
            )}
            <span className="text-xs md:text-sm tracking-wider uppercase font-black">
              ACTIVITY {formattedActivity}
            </span>
            {activity.activeCorner === 'BLUE' && (
              <span className="text-base md:text-lg font-black leading-none">▶</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
