import { useMatchStore } from '../../store/useMatchStore';
import { usePrecisionTimer } from '../../hooks/usePrecisionTimer';
import { Tv, PlaySquare, RotateCcw, X } from 'lucide-react';
import PreMatchIntroView, {
  isPreMatchIntroState,
} from '../display/PreMatchIntroView';
import UwwLiveMatchView from '../display/UwwLiveMatchView';
import IntermissionView from '../display/IntermissionView';
import StatusOverlay from '../display/StatusOverlay';

export default function MiniPreview() {
  const match = useMatchStore((s) => s.match);
  const switchPhase = useMatchStore((s) => s.switchPhase);
  const stopIntermission = useMatchStore((s) => s.stopIntermission);
  const getTieBreaker = useMatchStore((s) => s.getTieBreaker);
  const {
    mainMs,
    formattedMain,
    formattedBreak,
    formattedActivity,
    formattedRedInjury,
    formattedRedBlood,
    formattedBlueInjury,
    formattedBlueBlood,
    isRedInjuryRunning,
    isRedBloodRunning,
    isBlueInjuryRunning,
    isBlueBloodRunning,
  } = usePrecisionTimer({
    isMaster: false,
    showTenthsUnderTenSeconds: true,
  });

  const tb = getTieBreaker();
  const isAnyMedicalRunning =
    isRedInjuryRunning ||
    isRedBloodRunning ||
    isBlueInjuryRunning ||
    isBlueBloodRunning;

  const isIntermissionActive = Boolean(match.intermission?.isActive);

  const showPreMatchIntro =
    !isIntermissionActive &&
    isPreMatchIntroState(match) &&
    !isAnyMedicalRunning;

  const canReturnToIntro =
    !isIntermissionActive &&
    match.phase === 'PERIOD_1' &&
    !match.mainClock.isRunning &&
    match.red.score === 0 &&
    match.blue.score === 0 &&
    match.events.length === 0 &&
    !isAnyMedicalRunning;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2 shadow-lg">
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <Tv className="w-3.5 h-3.5 text-sky-400" />
          Mini Preview TV (16:9)
        </span>

        <div className="flex items-center gap-1.5">
          {isIntermissionActive && (
            <button
              type="button"
              onClick={stopIntermission}
              className="px-2.5 py-0.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-wider inline-flex items-center gap-1 transition shadow cursor-pointer"
              title="Tutup layar istirahat dan kembalikan Scoreboard di TV"
            >
              <X className="w-3 h-3" />
              <span>Tutup Istirahat</span>
            </button>
          )}

          {showPreMatchIntro && (
            <button
              type="button"
              onClick={() => switchPhase('PERIOD_1')}
              className="px-2.5 py-0.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-black text-[10px] uppercase tracking-wider inline-flex items-center gap-1 transition shadow cursor-pointer"
              title="Mulai tampilkan Scoreboard Pertandingan di layar TV"
            >
              <PlaySquare className="w-3 h-3" />
              <span>Tampilkan Scoreboard</span>
            </button>
          )}

          {canReturnToIntro && (
            <button
              type="button"
              onClick={() => switchPhase('PRE_MATCH')}
              className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[10px] uppercase tracking-wider inline-flex items-center gap-1 transition border border-slate-700 cursor-pointer"
              title="Kembali ke tampilan Pre-Match Intro"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Intro Pre-Match</span>
            </button>
          )}

          <span
            className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
              isIntermissionActive
                ? 'bg-amber-950 text-amber-300 border-amber-700/80'
                : 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
            }`}
          >
            {isIntermissionActive
              ? 'ISTIRAHAT TV'
              : showPreMatchIntro
              ? 'PRE-MATCH INTRO'
              : 'LIVE SCOREBOARD'}
          </span>
        </div>
      </div>

      {/* 16:9 Mini Replica Container — Identik 1:1 dengan DisplayPage.tsx */}
      <div className="relative h-[195px] w-full rounded-lg overflow-hidden bg-black border border-slate-800 select-none flex flex-col justify-between text-white">
        {isIntermissionActive ? (
          <IntermissionView match={match} variant="mini" />
        ) : showPreMatchIntro ? (
          <PreMatchIntroView match={match} variant="mini" />
        ) : (
          <UwwLiveMatchView
            match={match}
            tieBreaker={tb}
            mainMs={mainMs}
            formattedMain={formattedMain}
            formattedBreak={formattedBreak}
            formattedActivity={formattedActivity}
            formattedRedInjury={formattedRedInjury}
            formattedRedBlood={formattedRedBlood}
            formattedBlueInjury={formattedBlueInjury}
            formattedBlueBlood={formattedBlueBlood}
            isRedInjuryRunning={isRedInjuryRunning}
            isRedBloodRunning={isRedBloodRunning}
            isBlueInjuryRunning={isBlueInjuryRunning}
            isBlueBloodRunning={isBlueBloodRunning}
            variant="mini"
          />
        )}

        {/* Mini StatusOverlay Replica (Challenge / Winner) — Identik dengan Display TV */}
        {!isIntermissionActive && <StatusOverlay variant="mini" />}
      </div>

      {/* Tombol Aksi Cepat di Bawah Mini Preview Saat Masih Pre-Match */}
      {showPreMatchIntro && (
        <button
          type="button"
          onClick={() => switchPhase('PERIOD_1')}
          className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-md shadow-sky-950/50 cursor-pointer"
        >
          <PlaySquare className="w-4 h-4 shrink-0" />
          <span>Mulai Tampilkan Scoreboard di TV</span>
        </button>
      )}
    </div>
  );
}
