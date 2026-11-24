import { useMatchStore } from '../../store/useMatchStore';
import { Corner } from '../../types/match';
import RegionFlag from '../common/RegionFlag';

interface ScorePanelProps {
  corner: Corner;
}

export default function ScorePanel({ corner }: ScorePanelProps) {
  const match = useMatchStore((s) => s.match);
  const getTieBreaker = useMatchStore((s) => s.getTieBreaker);

  const isRed = corner === 'RED';
  const wrestler = isRed ? match.red : match.blue;

  const tb = getTieBreaker();
  const isCriteriaLeader = tb.leader === corner;

  return (
    <div
      className={`relative h-full flex flex-col justify-between rounded-3xl p-5 md:p-8 shadow-2xl transition-all duration-200 border-4 ${
        isRed
          ? 'bg-gradient-to-b from-red-600 to-red-800 border-red-500 shadow-red-950/80 text-white'
          : 'bg-gradient-to-b from-blue-600 to-blue-800 border-blue-500 shadow-blue-950/80 text-white'
      } ${
        isCriteriaLeader
          ? 'ring-4 ring-amber-400 ring-offset-4 ring-offset-slate-950 shadow-[0_0_30px_rgba(250,204,21,0.4)]'
          : ''
      }`}
    >
      {/* Top Section: Bendera/Logo, Kontingen & Nama Pegulat */}
      <div
        className={`flex items-center justify-between gap-4 border-b border-white/20 pb-3 ${
          isRed ? '' : 'flex-row-reverse'
        }`}
      >
        <div
          className={`flex items-center gap-3 shrink-0 ${
            isRed ? '' : 'flex-row-reverse'
          }`}
        >
          <RegionFlag
            code={wrestler.countryOrTeam}
            regionName={wrestler.countryOrTeam}
            size="tv"
          />
          <span className="font-mono font-black text-2xl md:text-4xl tracking-widest uppercase bg-black/30 px-3.5 py-1 rounded-xl shadow-xs">
            {wrestler.countryOrTeam}
          </span>
        </div>
        <h2
          className={`text-xl md:text-3xl font-extrabold uppercase tracking-wide truncate drop-shadow-sm min-w-0 ${
            isRed ? 'text-right' : 'text-left'
          }`}
        >
          {wrestler.name}
        </h2>
      </div>

      {/* Center Section: Angka Skor Raksasa & Indikator Criteria */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-2">
        <div
          id={`display-${corner.toLowerCase()}-score`}
          className="font-black tabular-nums tracking-tighter leading-none text-center select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
          style={{
            fontSize: 'clamp(6rem, 16vw, 18rem)',
            lineHeight: 1,
          }}
        >
          {wrestler.score}
        </div>

        {/* Indikator Tie-Breaker CRITERIA Emas Terang */}
        {isCriteriaLeader && (
          <div className="absolute -bottom-2 md:-bottom-3 animate-pulse">
            <span className="px-3.5 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs md:text-sm uppercase tracking-widest shadow-lg border border-amber-300">
              CRITERIA LEADER
            </span>
          </div>
        )}
      </div>

      {/* Bottom Status Bar: Caution (O), Passivity (P), Challenge */}
      <div className="flex items-center justify-between pt-3 border-t border-white/20">
        {/* Caution (O): 3 Kotak Indikator */}
        <div className="flex items-center gap-1.5 md:gap-2">
          <span className="text-xs md:text-sm font-black uppercase text-white/80 mr-0.5">
            O
          </span>
          {[1, 2, 3].map((idx) => {
            const isSet = wrestler.cautions >= idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 md:w-5 md:h-5 rounded-md border-2 transition-all ${
                  isSet
                    ? 'bg-amber-400 border-amber-300 shadow-md shadow-amber-400/80 scale-105'
                    : 'bg-black/30 border-white/30'
                }`}
              />
            );
          })}
        </div>

        {/* Passivity (P) Badge */}
        <div className="flex items-center">
          <span
            className={`px-2.5 py-0.5 md:px-3 md:py-1 rounded-lg text-xs md:text-sm font-black tracking-wider uppercase border transition-all ${
              wrestler.passivityCount > 0
                ? 'bg-amber-400 border-amber-300 text-slate-950 shadow-md shadow-amber-400/60'
                : 'bg-black/30 border-white/20 text-white/40'
            }`}
          >
            P {wrestler.passivityCount > 1 ? wrestler.passivityCount : ''}
          </span>
        </div>

        {/* Challenge Badge */}
        <div className="flex items-center">
          <span
            className={`px-2.5 py-0.5 md:px-3 md:py-1 rounded-lg text-xs md:text-sm font-black tracking-wider uppercase border transition-all ${
              wrestler.hasChallenge
                ? 'bg-emerald-500 border-emerald-300 text-white shadow-md shadow-emerald-900/60'
                : 'bg-black/40 border-white/10 text-white/30 line-through'
            }`}
          >
            CHALLENGE
          </span>
        </div>
      </div>
    </div>
  );
}
