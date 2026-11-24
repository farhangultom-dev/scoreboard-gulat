import { useEffect, useState } from 'react';
import { MatchState } from '../../types/match';
import { computeRemainingMs, formatClock } from '../../engine/timerEngine';
import PorprovLogo from '../common/PorprovLogo';
import RegionFlag from '../common/RegionFlag';
import { Coffee, Clock } from 'lucide-react';

interface IntermissionViewProps {
  match: MatchState;
  variant?: 'tv' | 'mini';
}

export default function IntermissionView({
  match,
  variant = 'tv',
}: IntermissionViewProps) {
  const isMini = variant === 'mini';
  const intermission = match.intermission;

  const [remainingMs, setRemainingMs] = useState<number>(() =>
    intermission ? computeRemainingMs(intermission.timer) : 0
  );
  const [wallClock, setWallClock] = useState<string>(() =>
    new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  );

  useEffect(() => {
    const syncNow = () => {
      if (intermission) {
        setRemainingMs(computeRemainingMs(intermission.timer));
      }
      setWallClock(
        new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };

    syncNow();
    const interval = window.setInterval(syncNow, 200);
    return () => window.clearInterval(interval);
  }, [intermission]);

  if (!intermission || !intermission.isActive) {
    return null;
  }

  const countdownStr = formatClock(remainingMs, false);
  const isFinished = remainingMs <= 0;
  const isRunning = intermission.timer.isRunning && !isFinished;

  // Tentukan info pertandingan selanjutnya untuk ditampilkan di bagian bawah TV
  const nextBout = match.nextBoutPreview
    ? {
        boutLabel: match.nextBoutPreview.boutNumber
          ? `BOUT ${match.nextBoutPreview.boutNumber}`
          : 'PARTAI BERIKUTNYA',
        divisionLabel: match.nextBoutPreview.divisionLabel,
        redName: match.nextBoutPreview.redName,
        redRegion: match.nextBoutPreview.redRegion,
        blueName: match.nextBoutPreview.blueName,
        blueRegion: match.nextBoutPreview.blueRegion,
      }
    : match.phase === 'PRE_MATCH' && match.activeBoutId
    ? {
        boutLabel: match.metadata.boutNumber || 'PARTAI BERIKUTNYA',
        divisionLabel: `${match.metadata.style} ${match.metadata.weightClass} (${match.metadata.ageCategory})`,
        redName: match.red.name,
        redRegion: match.red.countryOrTeam,
        blueName: match.blue.name,
        blueRegion: match.blue.countryOrTeam,
      }
    : null;

  return (
    <div
      className="w-full h-full bg-gradient-to-b from-slate-950 via-[#060b16] to-black text-white select-none flex flex-col justify-between overflow-hidden font-sans"
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {/* BAND 1: Top Arena Header Bar */}
      <header
        className={`relative w-full ${
          isMini ? 'h-[16%] px-2.5' : 'h-[13%] px-5 md:px-10'
        } bg-gradient-to-b from-[#353535] via-[#1a1a1a] to-[#080808] border-b border-zinc-800 flex items-center justify-between shrink-0 z-20`}
      >
        {/* Kiri: Logo + PORPROV X LAMPUNG 2026 */}
        <div className="w-[38%] flex items-center gap-2 md:gap-3 min-w-0">
          <PorprovLogo isMini={isMini} />
          <span
            className={`font-black text-amber-300 uppercase tracking-wider truncate ${
              isMini ? 'text-[8px]' : 'text-xs sm:text-base md:text-xl xl:text-2xl'
            }`}
          >
            PORPROV X LAMPUNG 2026
          </span>
        </div>

        {/* Tengah: Trapezoid Matras Aktif */}
        <div className="relative w-[24%] h-[118%] self-start flex items-center justify-center z-30">
          <div
            className="absolute inset-0 bg-gradient-to-b from-[#6e6e6e] via-[#484848] to-[#202020] shadow-[0_6px_16px_rgba(0,0,0,0.85)]"
            style={{
              clipPath: 'polygon(0 0, 100% 0, 88% 100%, 12% 100%)',
            }}
          />
          <span
            className={`relative z-10 font-mono font-black text-white tracking-wider uppercase leading-none ${
              isMini ? 'text-[10px]' : 'text-lg sm:text-2xl md:text-3xl xl:text-4xl'
            }`}
          >
            {match.metadata.matName}
          </span>
        </div>

        {/* Kanan: Jam Dinding Digital */}
        <div className="w-[38%] flex items-center justify-end gap-1.5 md:gap-2.5">
          {!isMini && <Clock className="w-5 h-5 md:w-6 md:h-6 text-amber-400 shrink-0" />}
          <span
            className={`font-mono font-bold text-[#f5b800] tracking-wider tabular-nums leading-none ${
              isMini ? 'text-[9px]' : 'text-lg sm:text-2xl md:text-3xl xl:text-4xl'
            }`}
          >
            {wallClock}
          </span>
        </div>
      </header>

      {/* BAND 2: Center Intermission Title & Giant Countdown Clock */}
      <main
        className={`relative flex-1 flex flex-col items-center justify-center text-center overflow-hidden ${
          isMini ? 'px-2 py-1 gap-1' : 'px-6 py-4 gap-3 md:gap-4'
        }`}
      >
        {/* Ambient radial highlight */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.12)_0%,transparent_68%)] pointer-events-none" />

        {/* Status Pill */}
        <div
          className={`relative z-10 inline-flex items-center gap-1.5 rounded-full border font-black uppercase tracking-widest ${
            isMini ? 'px-2 py-0.5 text-[6px]' : 'px-4 py-1 text-xs md:text-sm'
          } ${
            isFinished
              ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 animate-pulse'
              : isRunning
              ? 'bg-amber-500/20 border-amber-400/70 text-amber-300'
              : 'bg-slate-800/90 border-slate-600 text-slate-300'
          }`}
        >
          <Coffee className={isMini ? 'w-2.5 h-2.5' : 'w-4 h-4'} />
          <span>
            {isFinished
              ? 'WAKTU ISTIRAHAT SELESAI • SIAP DILANJUTKAN'
              : isRunning
              ? 'JEDA SESI PERTANDINGAN'
              : 'JEDA SESI PERTANDINGAN (DIJEDA)'}
          </span>
        </div>

        {/* Main Intermission Title */}
        <h1
          className={`relative z-10 font-black uppercase tracking-wide text-white drop-shadow-md max-w-[92%] truncate leading-tight ${
            isMini ? 'text-xs' : ''
          }`}
          style={
            !isMini ? { fontSize: 'clamp(1.6rem, 3.6vw, 3.8rem)' } : undefined
          }
        >
          {intermission.title}
        </h1>

        {intermission.subtitle && (
          <p
            className={`relative z-10 font-semibold text-slate-300 max-w-[85%] truncate ${
              isMini ? 'text-[7px]' : 'text-sm md:text-xl xl:text-2xl'
            }`}
          >
            {intermission.subtitle}
          </p>
        )}

        {/* Giant Countdown Digits */}
        <div
          className={`relative z-10 font-mono font-black tabular-nums tracking-tight leading-none select-none drop-shadow-[0_6px_30px_rgba(0,0,0,0.8)] ${
            isFinished
              ? 'text-emerald-400 animate-pulse'
              : isRunning
              ? 'text-white'
              : 'text-amber-300'
          } ${isMini ? 'text-4xl' : ''}`}
          style={
            !isMini ? { fontSize: 'clamp(4.5rem, 15vw, 14.5rem)' } : undefined
          }
        >
          {countdownStr}
        </div>
      </main>

      {/* BAND 3: Bottom Next Match Preview Strip */}
      <footer
        className={`relative z-20 w-full shrink-0 border-t border-slate-800/90 bg-slate-900/90 flex items-center justify-center overflow-hidden ${
          isMini ? 'h-[22%] px-2' : 'h-[17%] px-6 md:px-12'
        }`}
      >
        {nextBout ? (
          <div className="w-full max-w-6xl flex items-center justify-between gap-3 md:gap-6 min-w-0">
            {/* Label Pertandingan Selanjutnya */}
            <div className="shrink-0 flex flex-col">
              <span
                className={`font-black uppercase tracking-widest text-amber-400 leading-tight ${
                  isMini ? 'text-[6px]' : 'text-[11px] md:text-xs'
                }`}
              >
                PERTANDINGAN SELANJUTNYA
              </span>
              <span
                className={`font-mono font-bold text-slate-300 truncate ${
                  isMini ? 'text-[6.5px]' : 'text-xs md:text-base'
                }`}
              >
                {nextBout.boutLabel} • {nextBout.divisionLabel}
              </span>
            </div>

            {/* Sudut Merah vs Sudut Biru */}
            <div className="flex-1 flex items-center justify-end gap-2 md:gap-4 min-w-0">
              {/* Merah */}
              <div
                className={`flex items-center gap-1.5 md:gap-2.5 bg-red-950/75 border border-red-600/60 rounded-xl min-w-0 ${
                  isMini ? 'px-1.5 py-0.5' : 'px-3 py-1.5 md:px-4 md:py-2'
                }`}
              >
                <RegionFlag
                  code={nextBout.redRegion}
                  regionName={nextBout.redRegion}
                  size={isMini ? 'xs' : 'md'}
                  showFallbackText={false}
                />
                <span
                  className={`font-mono font-black text-red-300 shrink-0 ${
                    isMini ? 'text-[7px]' : 'text-xs md:text-base'
                  }`}
                >
                  {nextBout.redRegion}
                </span>
                <span
                  className={`font-bold text-white uppercase truncate ${
                    isMini ? 'text-[7px] max-w-[55px]' : 'text-xs md:text-lg max-w-[200px]'
                  }`}
                >
                  {nextBout.redName}
                </span>
              </div>

              <span
                className={`font-black text-amber-400 shrink-0 ${
                  isMini ? 'text-[7px]' : 'text-xs md:text-base'
                }`}
              >
                VS
              </span>

              {/* Biru */}
              <div
                className={`flex items-center gap-1.5 md:gap-2.5 bg-blue-950/75 border border-blue-600/60 rounded-xl min-w-0 ${
                  isMini ? 'px-1.5 py-0.5' : 'px-3 py-1.5 md:px-4 md:py-2'
                }`}
              >
                <span
                  className={`font-bold text-white uppercase truncate ${
                    isMini ? 'text-[7px] max-w-[55px]' : 'text-xs md:text-lg max-w-[200px]'
                  }`}
                >
                  {nextBout.blueName}
                </span>
                <span
                  className={`font-mono font-black text-blue-300 shrink-0 ${
                    isMini ? 'text-[7px]' : 'text-xs md:text-base'
                  }`}
                >
                  {nextBout.blueRegion}
                </span>
                <RegionFlag
                  code={nextBout.blueRegion}
                  regionName={nextBout.blueRegion}
                  size={isMini ? 'xs' : 'md'}
                  showFallbackText={false}
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`text-center font-bold uppercase tracking-wider text-amber-300/90 ${
              isMini ? 'text-[7px]' : 'text-xs md:text-lg'
            }`}
          >
            Atlet &amp; Ofisial yang akan bertanding pada sesi berikutnya harap bersiap di area matras
          </div>
        )}
      </footer>
    </div>
  );
}
