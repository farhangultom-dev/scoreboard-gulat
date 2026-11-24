import { useState, useEffect } from 'react';
import { useMatchStore } from '../../store/useMatchStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { usePrecisionTimer } from '../../hooks/usePrecisionTimer';
import { computeRemainingMs, formatClock, parseClockToMs } from '../../engine/timerEngine';
import {
  Play,
  Pause,
  RotateCcw,
  Trophy,
  AlertOctagon,
  Clock,
  Sparkles,
  Tv,
  Coffee,
  X,
} from 'lucide-react';
import IntermissionModal from './IntermissionModal';

interface ClockControlsProps {
  onOpenVictoryModal: () => void;
}

export default function ClockControls({ onOpenVictoryModal }: ClockControlsProps) {
  const match = useMatchStore((s) => s.match);
  const toggleMainClock = useMatchStore((s) => s.toggleMainClock);
  const adjustMainClock = useMatchStore((s) => s.adjustMainClock);
  const setMainClock = useMatchStore((s) => s.setMainClock);
  const switchPhase = useMatchStore((s) => s.switchPhase);
  const resetMatch = useMatchStore((s) => s.resetMatch);
  const toggleIntermissionClock = useMatchStore(
    (s) => s.toggleIntermissionClock
  );
  const adjustIntermissionClock = useMatchStore(
    (s) => s.adjustIntermissionClock
  );
  const stopIntermission = useMatchStore((s) => s.stopIntermission);

  const getTechSuperiority = useMatchStore((s) => s.getTechSuperiority);
  const getDisqualification = useMatchStore((s) => s.getDisqualification);

  const { formattedMain, formattedBreak, isMainRunning, isBreakRunning } =
    usePrecisionTimer({
      isMaster: true,
      showTenthsUnderTenSeconds: true,
    });

  const [isEditingTime, setIsEditingTime] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('');
  const [isIntermissionModalOpen, setIsIntermissionModalOpen] = useState(false);
  const [intermissionLiveMs, setIntermissionLiveMs] = useState<number>(0);

  const intermission = match.intermission;

  useEffect(() => {
    if (!intermission || !intermission.isActive) {
      setIntermissionLiveMs(0);
      return;
    }
    const update = () => {
      setIntermissionLiveMs(computeRemainingMs(intermission.timer));
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [intermission]);

  const tech = getTechSuperiority();
  const dsq = getDisqualification();

  const isBreakPhase = match.phase === 'BREAK';
  const displayClockStr = isBreakPhase ? formattedBreak : formattedMain;
  const isClockRunning = isBreakPhase ? isBreakRunning : isMainRunning;

  const handleCustomTimeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ms = parseClockToMs(customTimeInput);
    if (ms !== null) {
      setMainClock(ms);
      setIsEditingTime(false);
      setCustomTimeInput('');
    }
  };

  const handleReset = () => {
    if (
      window.confirm(
        'Apakah Anda yakin ingin me-reset partai ini? Seluruh skor dan waktu akan kembali ke awal.'
      )
    ) {
      resetMatch({ keepMetadata: true });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xl">
      {/* Active Phase Badge & Alerts */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Jam Pertandingan (Match Clock)
          </span>

          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
              match.phase === 'BREAK'
                ? 'bg-amber-950 text-amber-300 border border-amber-700/60 animate-pulse'
                : match.phase === 'PERIOD_1' || match.phase === 'PERIOD_2'
                ? 'bg-sky-950 text-sky-300 border border-sky-700/60'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {match.phase === 'PRE_MATCH'
              ? 'SIAP'
              : match.phase === 'PERIOD_1'
              ? 'BABAK 1'
              : match.phase === 'BREAK'
              ? 'ISTIRAHAT 0:30'
              : match.phase === 'PERIOD_2'
              ? 'BABAK 2'
              : 'SELESAI'}
          </span>
        </div>

        {/* Automatic Alert: VSU Detected */}
        {tech.triggered && (
          <div className="p-2 rounded-lg bg-amber-950/80 border border-amber-500/80 text-amber-200 text-xs flex items-center justify-between animate-bounce-short">
            <div className="flex items-center gap-1.5 font-bold">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                VSU Tercapai! ({tech.leader} unggul {tech.suggestedVictoryType})
              </span>
            </div>
            <button
              onClick={onOpenVictoryModal}
              className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded font-black text-[11px] cursor-pointer"
            >
              Konfirmasi
            </button>
          </div>
        )}

        {/* Automatic Alert: DSQ Detected */}
        {dsq.triggered && (
          <div className="p-2 rounded-lg bg-rose-950/90 border border-rose-500 text-rose-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
              <span>DSQ: 3 Cautions ({dsq.disqualifiedCorner} Gugur)</span>
            </div>
            <button
              onClick={onOpenVictoryModal}
              className="px-2 py-0.5 bg-rose-500 hover:bg-rose-400 text-white rounded font-black text-[11px] cursor-pointer"
            >
              Konfirmasi
            </button>
          </div>
        )}
      </div>

      {/* Main Clock Display */}
      <div className="flex flex-col items-center justify-center my-1">
        {isEditingTime ? (
          <form
            onSubmit={handleCustomTimeSubmit}
            className="flex items-center gap-2 my-2"
          >
            <input
              type="text"
              autoFocus
              placeholder="MM:SS (misal 2:30)"
              value={customTimeInput}
              onChange={(e) => setCustomTimeInput(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-center text-xl font-mono text-white w-40 focus:outline-hidden focus:border-sky-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold text-white cursor-pointer"
            >
              Set
            </button>
            <button
              type="button"
              onClick={() => setIsEditingTime(false)}
              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 cursor-pointer"
            >
              Batal
            </button>
          </form>
        ) : (
          <div
            onClick={() => {
              if (!isClockRunning) {
                setCustomTimeInput(displayClockStr);
                setIsEditingTime(true);
              }
            }}
            className={`text-5xl md:text-6xl font-black font-mono tracking-tight tabular-nums transition cursor-pointer select-none ${
              isClockRunning
                ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                : 'text-white hover:text-sky-300'
            }`}
            title={!isClockRunning ? 'Klik untuk edit waktu manual' : undefined}
          >
            {displayClockStr}
          </div>
        )}

        <span className="text-[10px] text-slate-500 mt-0.5 font-medium">
          {!isClockRunning ? 'Klik angka jam untuk edit MM:SS' : 'Jam Berjalan'}
        </span>
      </div>

      {/* Pre-Match Button: Mulai Tampilkan Scoreboard di TV tanpa langsung menjalankan jam */}
      {match.phase === 'PRE_MATCH' && (
        <button
          id="btn-start-show-scoreboard"
          type="button"
          onClick={() => switchPhase('PERIOD_1')}
          className="w-full py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs uppercase tracking-wider transition shadow-md shadow-sky-950/60 border border-sky-400/40 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          title="Beralih dari tampilan Pre-Match Intro ke tampilan Scoreboard Babak 1 (jam tetap berhenti menunggu peluit wasit)"
        >
          <Tv className="w-4 h-4 shrink-0" />
          <span>Mulai Tampilkan Scoreboard (Babak 1)</span>
        </button>
      )}

      {/* Primary Big Start/Pause Button */}
      <button
        id="btn-start-pause-clock"
        onClick={toggleMainClock}
        className={`w-full py-3.5 rounded-xl font-black text-base uppercase tracking-wider transition shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
          isClockRunning
            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/50'
            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
        }`}
      >
        {isClockRunning ? (
          <>
            <Pause className="w-5 h-5 fill-current" />
            PAUSE (Space)
          </>
        ) : (
          <>
            <Play className="w-5 h-5 fill-current" />
            START (Space)
          </>
        )}
      </button>

      {/* Fine Adjustment Controls (Only when paused) */}
      <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-800">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isClockRunning}
            onClick={() => adjustMainClock(-5000)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-mono text-xs cursor-pointer"
          >
            -5s
          </button>
          <button
            type="button"
            disabled={isClockRunning}
            onClick={() => adjustMainClock(-1000)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-mono text-xs cursor-pointer"
          >
            -1s
          </button>
          <button
            type="button"
            disabled={isClockRunning}
            onClick={() => adjustMainClock(1000)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-mono text-xs cursor-pointer"
          >
            +1s
          </button>
          <button
            type="button"
            disabled={isClockRunning}
            onClick={() => adjustMainClock(5000)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-mono text-xs cursor-pointer"
          >
            +5s
          </button>
        </div>

        <button
          type="button"
          disabled={isClockRunning}
          onClick={() => {
            setCustomTimeInput(displayClockStr);
            setIsEditingTime(true);
          }}
          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
        >
          <Clock className="w-3 h-3" />
          Edit
        </button>
      </div>

      {/* Period Switches */}
      <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800">
        <button
          type="button"
          onClick={() => switchPhase('PERIOD_1')}
          className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            match.phase === 'PERIOD_1'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
          }`}
        >
          P1 (3:00)
        </button>
        <button
          type="button"
          onClick={() => switchPhase('BREAK')}
          className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            match.phase === 'BREAK'
              ? 'bg-amber-500 text-slate-950 shadow-xs'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
          }`}
        >
          BREAK (0:30)
        </button>
        <button
          type="button"
          onClick={() => switchPhase('PERIOD_2')}
          className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            match.phase === 'PERIOD_2'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
          }`}
        >
          P2 (3:00)
        </button>
      </div>

      {/* Global Declare Winner, Save & Next Bout, Reset & Istirahat Sesi TV */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={onOpenVictoryModal}
          className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer active:scale-98"
        >
          <Trophy className="w-4 h-4 fill-slate-950" />
          Declare Winner
        </button>

        <button
          type="button"
          onClick={async () => {
            const tournamentStore = useTournamentStore.getState();
            const hasTournamentQueue =
              Object.keys(tournamentStore.bouts).length > 0 ||
              Boolean(match.activeBoutId);

            if (hasTournamentQueue) {
              const noScoreOrWinner =
                !match.winner &&
                match.red.score === 0 &&
                match.blue.score === 0 &&
                match.events.length === 0;

              const confirmMsg = noScoreOrWinner
                ? 'Pertandingan ini masih 0-0 dan belum memiliki pemenang. Lanjutkan memuat partai berikutnya pada antrean matras?'
                : 'Simpan hasil pertandingan ini ke bagan & riwayat, lalu lanjutkan ke partai berikutnya?';

              if (window.confirm(confirmMsg)) {
                await tournamentStore.saveAndLoadNextBout();
              }
              return;
            }

            if (
              window.confirm(
                'Simpan pertandingan saat ini ke riwayat dan lanjutkan ke nomor partai berikutnya?'
              )
            ) {
              useMatchStore.getState().saveAndNextBout();
            }
          }}
          className="py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer active:scale-98"
          title="Simpan partai ini ke bagan & riwayat, lalu muat partai berikutnya dari antrean matras"
        >
          <Clock className="w-4 h-4" />
          Save & Next Bout
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-200 text-slate-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer active:scale-98"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Match
        </button>
      </div>

      {/* Kontrol Mode Istirahat Sesi Pertandingan (misal: 30 Menit) di TV */}
      <div className="pt-2 border-t border-slate-800">
        {intermission?.isActive ? (
          <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/70 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Coffee className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 truncate">
                  {intermission.title}
                </span>
              </div>
              <span className="font-mono font-black text-base text-white tabular-nums shrink-0">
                {formatClock(intermissionLiveMs, false)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={toggleIntermissionClock}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black inline-flex items-center gap-1 cursor-pointer ${
                  intermission.timer.isRunning
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {intermission.timer.isRunning ? (
                  <>
                    <Pause className="w-3 h-3" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" /> Lanjut
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => adjustIntermissionClock(-60_000)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] font-bold cursor-pointer"
                title="Kurangi 1 menit"
              >
                -1m
              </button>
              <button
                type="button"
                onClick={() => adjustIntermissionClock(60_000)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] font-bold cursor-pointer"
                title="Tambah 1 menit"
              >
                +1m
              </button>

              <button
                type="button"
                onClick={() => setIsIntermissionModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-bold cursor-pointer"
              >
                Ubah
              </button>

              <button
                type="button"
                onClick={stopIntermission}
                className="ml-auto px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" /> Akhiri Istirahat
              </button>
            </div>
          </div>
        ) : (
          <button
            id="btn-intermission-tv"
            type="button"
            onClick={() => setIsIntermissionModalOpen(true)}
            className="w-full py-2 px-3 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-700/60 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
            title="Tampilkan layar istirahat sesi (misal 30 menit sebelum pertandingan selanjutnya) di Display TV"
          >
            <Coffee className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Mode Istirahat Sesi di TV (30 Menit)</span>
          </button>
        )}
      </div>

      <IntermissionModal
        isOpen={isIntermissionModalOpen}
        onClose={() => setIsIntermissionModalOpen(false)}
      />
    </div>
  );
}
