import { useMatchStore } from '../../store/useMatchStore';
import { usePrecisionTimer } from '../../hooks/usePrecisionTimer';
import { Trophy, ShieldAlert } from 'lucide-react';
import RegionFlag from '../common/RegionFlag';
import PorprovLogo from '../common/PorprovLogo';
import {
  formatAgeWeightCode,
  formatBoutDigits,
  formatFullStyleName,
  getCornerGradientClass,
} from '../../utils/scoreboardDisplayHelpers';

interface StatusOverlayProps {
  variant?: 'tv' | 'mini';
}

export default function StatusOverlay({ variant = 'tv' }: StatusOverlayProps) {
  const isMini = variant === 'mini';
  const match = useMatchStore((s) => s.match);
  const { formattedMain, formattedBreak } = usePrecisionTimer({
    isMaster: false,
    showTenthsUnderTenSeconds: false,
  });

  const isBreak = match.phase === 'BREAK';
  const isChallenge = match.activeChallengeCorner !== null;
  const isWinnerDeclared = match.winner !== null;

  const ageWeightCode = formatAgeWeightCode(
    match.metadata.ageCategory,
    match.metadata.weightClass
  );
  const boutDigits = formatBoutDigits(match.metadata.boutNumber);
  const styleFullName = formatFullStyleName(match.metadata.style);

  const renderScoreboardHeader = () => (
    <header
      className={`relative w-full ${
        isMini ? 'h-[16%]' : 'h-[14%]'
      } bg-gradient-to-b from-[#353535] via-[#1a1a1a] to-[#080808] border-b border-zinc-800 flex items-center justify-between shrink-0 z-20`}
    >
      <div
        className={`w-[34%] text-center font-mono font-semibold text-white tracking-wider whitespace-nowrap leading-none ${
          isMini ? 'text-xs' : ''
        }`}
        style={!isMini ? { fontSize: 'clamp(2rem, 4.8vw, 4.8rem)' } : undefined}
      >
        {ageWeightCode}
      </div>

      <div className="relative w-[32%] h-[118%] self-start flex items-center justify-center z-30">
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#6e6e6e] via-[#484848] to-[#202020] shadow-[0_6px_16px_rgba(0,0,0,0.85)]"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 88% 100%, 12% 100%)',
          }}
        />
        <span
          className={`relative z-10 font-mono font-semibold text-white tracking-wider leading-none ${
            isMini ? 'text-xs' : ''
          }`}
          style={!isMini ? { fontSize: 'clamp(2rem, 4.8vw, 4.8rem)' } : undefined}
        >
          {boutDigits}
        </span>
      </div>

      <div
        className={`w-[34%] text-center font-mono font-semibold text-[#f5b800] tracking-wide whitespace-nowrap truncate px-2 leading-none ${
          isMini ? 'text-[11px]' : ''
        }`}
        style={!isMini ? { fontSize: 'clamp(1.8rem, 4.3vw, 4.4rem)' } : undefined}
      >
        {styleFullName}
      </div>
    </header>
  );

  const renderWrestlerHero = (countryOrTeam: string, name: string) => (
    <div
      className={`flex-1 flex items-center min-h-0 overflow-hidden ${
        isMini ? 'px-3 py-1 gap-2.5' : 'px-6 md:px-14 py-6 gap-6 md:gap-12'
      }`}
    >
      <RegionFlag
        code={countryOrTeam}
        regionName={countryOrTeam}
        size={isMini ? 'sm' : 'winner'}
        overrideBoxClass={
          isMini
            ? 'h-10 w-12 p-1 rounded-md shrink-0 shadow-md'
            : 'h-[clamp(6rem,14.5vw,13.5rem)] w-[clamp(7rem,17vw,15.5rem)] p-2 md:p-3 rounded-xl md:rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.55)]'
        }
        showFallbackText={false}
      />

      <div
        className={`flex-1 min-w-0 flex flex-col justify-center ${
          isMini ? 'gap-0.5' : 'gap-2 md:gap-4'
        }`}
      >
        <div
          className={`font-sans font-black uppercase text-white tracking-tight leading-none drop-shadow-[0_4px_14px_rgba(0,0,0,0.5)] whitespace-nowrap truncate ${
            isMini ? 'text-xl' : ''
          }`}
          style={!isMini ? { fontSize: 'clamp(3.2rem, 7.6vw, 8rem)' } : undefined}
        >
          {countryOrTeam}
        </div>
        <div
          className={`font-mono font-bold uppercase text-white tracking-wider leading-tight drop-shadow-[0_4px_14px_rgba(0,0,0,0.5)] truncate ${
            isMini ? 'text-xs' : ''
          }`}
          style={!isMini ? { fontSize: 'clamp(2.1rem, 5.2vw, 5.6rem)' } : undefined}
        >
          {name}
        </div>
      </div>
    </div>
  );

  const overlayPositionClass = isMini
    ? 'absolute inset-0 z-30'
    : 'fixed inset-0 z-40';

  // 1. WINNER OVERLAY (Full-Screen UWW Scoreboard Style)
  if (isWinnerDeclared && match.winner) {
    const winnerCorner = match.winner.corner;
    const isRedWinner = winnerCorner === 'RED';
    const winner = isRedWinner ? match.red : match.blue;
    const opponent = isRedWinner ? match.blue : match.red;

    const getVictoryTitle = () => {
      switch (match.winner?.type) {
        case 'VFA':
          return 'WINNER BY FALL (VFA)';
        case 'VSU':
          return 'WINNER BY TECHNICAL SUPERIORITY (VSU)';
        case 'VSU1':
          return 'WINNER BY TECHNICAL SUPERIORITY (VSU1)';
        case 'VPO':
          return 'WINNER BY POINTS (VPO)';
        case 'VPO1':
          return 'WINNER BY POINTS (VPO1)';
        case 'DSQ':
          return 'WINNER BY DISQUALIFICATION (DSQ)';
        case 'VIN':
          return 'WINNER BY INJURY DEFAULT (VIN)';
        case 'VFO':
          return 'WINNER BY FORFEIT (VFO)';
        default:
          return `WINNER (${match.winner?.type})`;
      }
    };

    return (
      <div
        data-testid={isMini ? 'mini-winner-scoreboard-overlay' : 'winner-scoreboard-overlay'}
        data-corner={winnerCorner}
        className={`${overlayPositionClass} bg-black text-white flex flex-col justify-between overflow-hidden select-none animate-fade-in`}
      >
        {renderScoreboardHeader()}

        {/* Panel Utama Pemenang Sesuai Warna Sudut */}
        <div
          className={`flex-1 w-full flex flex-col justify-between overflow-hidden ${getCornerGradientClass(
            winnerCorner
          )} shadow-[inset_0_0_90px_rgba(0,0,0,0.72)]`}
        >
          {/* Strip Judul Kemenangan */}
          <div
            className={`bg-black/30 border-b border-white/15 flex items-center justify-between gap-2 ${
              isMini ? 'px-2.5 py-1' : 'px-6 md:px-14 py-4 md:py-5 flex-wrap gap-4'
            }`}
          >
            <div className={`flex items-center ${isMini ? 'gap-1.5' : 'gap-3'}`}>
              <span
                className={`${
                  isMini ? 'p-0.5 rounded' : 'p-2 rounded-xl'
                } bg-[#f5b800]/20 border border-[#f5b800]/60`}
              >
                <Trophy
                  className={`${
                    isMini ? 'w-3 h-3' : 'w-7 h-7 md:w-9 md:h-9'
                  } text-[#f5b800]`}
                />
              </span>
              <span
                className={`font-mono font-black uppercase tracking-widest text-[#f5b800] whitespace-nowrap ${
                  isMini ? 'text-[9px]' : 'text-lg md:text-2xl'
                }`}
              >
                WINNER • {isRedWinner ? 'RED CORNER' : 'BLUE CORNER'}
              </span>
            </div>

            <div
              className={`bg-black/45 border border-white/20 min-w-0 ${
                isMini ? 'px-1.5 py-0.5 rounded' : 'px-4 py-1.5 rounded-lg'
              }`}
            >
              <span
                className={`font-mono font-black uppercase tracking-wider text-white block truncate ${
                  isMini ? 'text-[8px]' : 'text-base md:text-2xl'
                }`}
              >
                {isMini ? match.winner.type : getVictoryTitle()}
              </span>
            </div>
          </div>

          {renderWrestlerHero(winner.countryOrTeam, winner.name)}

          {/* Footer Metalik Skor Akhir + Event Banner */}
          <div
            className={`bg-gradient-to-b from-[#232323] via-[#121212] to-[#050505] border-t border-zinc-700 flex items-center justify-between gap-2 ${
              isMini ? 'px-2.5 py-1' : 'px-6 md:px-14 py-4 md:py-5 flex-wrap gap-4'
            }`}
          >
            <div
              className={`inline-flex items-center bg-black/60 border border-zinc-700/80 ${
                isMini ? 'gap-1 px-1.5 py-0.5 rounded' : 'gap-2.5 px-3 py-1.5 rounded-lg'
              }`}
            >
              <PorprovLogo
                className={`${
                  isMini ? 'w-3.5 h-3.5 rounded-xs' : 'w-7 h-7 md:w-9 md:h-9 rounded-md'
                } shrink-0`}
              />
              <span
                className={`font-mono font-black uppercase text-[#f5b800] whitespace-nowrap ${
                  isMini
                    ? 'text-[7px] tracking-wider'
                    : 'text-xs md:text-base tracking-[0.14em]'
                }`}
              >
                PORPROV X LAMPUNG 2026
              </span>
            </div>

            <div className="flex items-center gap-4 md:gap-6">
              {!isMini && (
                <span className="hidden sm:inline text-sm md:text-lg font-mono text-zinc-400 uppercase tracking-wide truncate max-w-[26rem]">
                  VS {opponent.countryOrTeam} • {opponent.name}
                </span>
              )}
              <div
                className={`bg-black/70 border border-zinc-600 font-mono font-black tabular-nums text-white shadow-inner whitespace-nowrap ${
                  isMini
                    ? 'px-2 py-0.5 rounded text-[10px]'
                    : 'px-5 py-2 rounded-xl text-2xl md:text-4xl'
                }`}
              >
                SKOR AKHIR: {winner.score} - {opponent.score}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. CHALLENGE REVIEW OVERLAY (Full-Screen UWW Scoreboard Style)
  if (isChallenge && match.activeChallengeCorner) {
    const challengingCorner = match.activeChallengeCorner;
    const isRedChallenging = challengingCorner === 'RED';
    const challenger = isRedChallenging ? match.red : match.blue;

    return (
      <div
        data-testid={isMini ? 'mini-challenge-scoreboard-overlay' : 'challenge-scoreboard-overlay'}
        data-corner={challengingCorner}
        className={`${overlayPositionClass} bg-black text-white flex flex-col justify-between overflow-hidden select-none`}
      >
        {renderScoreboardHeader()}

        {/* Panel Utama Challenge Sesuai Warna Sudut Penantang */}
        <div
          className={`flex-1 w-full flex flex-col justify-between overflow-hidden ${
            isMini ? 'ring-2' : 'ring-4'
          } ring-inset ring-[#f5b800]/80 ${getCornerGradientClass(
            challengingCorner
          )} shadow-[inset_0_0_90px_rgba(0,0,0,0.72)]`}
        >
          {/* Strip Status Jury / Video Review */}
          <div
            className={`bg-black/35 border-b border-white/15 flex items-center justify-between gap-2 ${
              isMini ? 'px-2.5 py-1' : 'px-6 md:px-14 py-4 md:py-5 flex-wrap gap-4'
            }`}
          >
            <div
              className={`inline-flex items-center bg-[#f5b800] text-slate-950 shadow-lg animate-pulse shrink-0 ${
                isMini ? 'gap-1 px-1.5 py-0.5 rounded' : 'gap-3 px-4 py-2 rounded-xl'
              }`}
            >
              <ShieldAlert
                className={`${isMini ? 'w-3 h-3' : 'w-7 h-7 md:w-8 md:h-8'} shrink-0`}
              />
              <span
                className={`font-mono font-black uppercase whitespace-nowrap ${
                  isMini
                    ? 'text-[8px] tracking-wider'
                    : 'text-base md:text-2xl tracking-widest'
                }`}
              >
                JURY / VIDEO REVIEW
              </span>
            </div>

            <h2
              className={`font-mono font-black uppercase tracking-wider text-white truncate ${
                isMini ? 'text-[9px]' : 'text-xl md:text-4xl'
              }`}
            >
              CHALLENGE — {isRedChallenging ? 'RED CORNER' : 'BLUE CORNER'}
            </h2>
          </div>

          {renderWrestlerHero(challenger.countryOrTeam, challenger.name)}

          {/* Footer Metalik Skor Berjalan & Jam Pertandingan */}
          <div
            className={`bg-gradient-to-b from-[#232323] via-[#121212] to-[#050505] border-t border-zinc-700 flex items-center justify-between gap-2 ${
              isMini ? 'px-2.5 py-1' : 'px-6 md:px-14 py-4 flex-wrap gap-4'
            }`}
          >
            <div className={`flex items-center ${isMini ? 'gap-1.5' : 'gap-3 md:gap-4'}`}>
              <span
                className={`bg-[#b80000] border border-red-400/50 font-mono font-black tabular-nums ${
                  isMini
                    ? 'px-1.5 py-0.5 rounded text-[9px]'
                    : 'px-3.5 py-1.5 rounded-lg text-xl md:text-3xl'
                }`}
              >
                {match.red.countryOrTeam} {match.red.score}
              </span>
              <span className={`text-zinc-500 font-black ${isMini ? 'text-[9px]' : 'text-xl'}`}>
                VS
              </span>
              <span
                className={`bg-[#0018b8] border border-blue-400/50 font-mono font-black tabular-nums ${
                  isMini
                    ? 'px-1.5 py-0.5 rounded text-[9px]'
                    : 'px-3.5 py-1.5 rounded-lg text-xl md:text-3xl'
                }`}
              >
                {match.blue.score} {match.blue.countryOrTeam}
              </span>
            </div>

            <div className={`flex items-center ${isMini ? 'gap-1.5' : 'gap-5'}`}>
              {!isMini && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 border border-zinc-700/80">
                  <PorprovLogo className="w-6 h-6 md:w-8 md:h-8 rounded-md shrink-0" />
                  <span className="hidden md:inline text-xs md:text-sm font-mono font-black tracking-[0.14em] uppercase text-[#f5b800]">
                    PORPROV X LAMPUNG 2026
                  </span>
                </div>
              )}
              <div
                className={`bg-black/80 border border-zinc-600 font-mono font-black text-white tabular-nums ${
                  isMini
                    ? 'px-2 py-0.5 rounded text-[10px]'
                    : 'px-4 py-1.5 rounded-xl text-2xl md:text-4xl'
                }`}
              >
                {formattedMain}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. BREAK OVERLAY (Banner Tengah Istirahat pada TV — Skor Latar Tetap Terlihat)
  if (isBreak && !isMini) {
    return (
      <div className="fixed inset-x-0 top-[15%] z-30 flex items-center justify-center pointer-events-none px-4">
        <div className="px-8 py-3 rounded-2xl bg-slate-900/90 border-2 border-amber-400 text-white shadow-2xl flex items-center gap-4 backdrop-blur-xs">
          <span className="text-lg md:text-2xl font-black uppercase tracking-widest text-amber-400">
            BREAK (ISTIRAHAT)
          </span>
          <span className="font-mono text-2xl md:text-4xl font-black text-amber-300 tabular-nums">
            {formattedBreak}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
