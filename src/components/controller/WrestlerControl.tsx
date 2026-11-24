import { useMatchStore } from '../../store/useMatchStore';
import { usePrecisionTimer } from '../../hooks/usePrecisionTimer';
import { Corner, PointValue } from '../../types/match';
import {
  Plus,
  Shield,
  Clock,
  HeartPulse,
  Flag,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import RegionFlag from '../common/RegionFlag';

interface WrestlerControlProps {
  corner: Corner;
}

export default function WrestlerControl({ corner }: WrestlerControlProps) {
  const match = useMatchStore((s) => s.match);
  const addPoints = useMatchStore((s) => s.addPoints);
  const addCaution = useMatchStore((s) => s.addCaution);
  const addPassivity = useMatchStore((s) => s.addPassivity);
  const startActivityClock = useMatchStore((s) => s.startActivityClock);
  const cancelActivityClock = useMatchStore((s) => s.cancelActivityClock);
  const openChallenge = useMatchStore((s) => s.openChallenge);
  const resolveChallenge = useMatchStore((s) => s.resolveChallenge);
  const toggleMedicalTimer = useMatchStore((s) => s.toggleMedicalTimer);
  const getTieBreaker = useMatchStore((s) => s.getTieBreaker);

  const {
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
    showTenthsUnderTenSeconds: false,
  });

  const isRed = corner === 'RED';
  const wrestler = isRed ? match.red : match.blue;

  const isCriteriaLeader = getTieBreaker().leader === corner;
  const isActivityActive = match.activityClock.activeCorner === corner;
  const isChallenging = match.activeChallengeCorner === corner;

  const isInjuryRunning = isRed ? isRedInjuryRunning : isBlueInjuryRunning;
  const isBloodRunning = isRed ? isRedBloodRunning : isBlueBloodRunning;
  const injuryTimeStr = isRed ? formattedRedInjury : formattedBlueInjury;
  const bloodTimeStr = isRed ? formattedRedBlood : formattedBlueBlood;

  // Shortcuts indicator letters
  const pointKeys: Record<PointValue, string> = isRed
    ? { 1: 'Q', 2: 'W', 4: 'E', 5: 'R' }
    : { 1: 'U', 2: 'I', 4: 'O', 5: 'P' };
  const passivityKey = isRed ? 'A' : 'L';

  return (
    <div
      className={`rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xl border-2 transition ${
        isRed
          ? 'bg-red-950/30 border-red-600/60 shadow-red-950/20'
          : 'bg-blue-950/30 border-blue-600/60 shadow-blue-950/20'
      }`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider text-white shrink-0 ${
              isRed ? 'bg-red-600' : 'bg-blue-600'
            }`}
          >
            {isRed ? 'SUDUT MERAH' : 'SUDUT BIRU'}
          </span>
          <RegionFlag
            code={wrestler.countryOrTeam}
            regionName={wrestler.countryOrTeam}
            size="md"
          />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono truncate">
            {wrestler.countryOrTeam}
          </span>
        </div>

        {/* Tie-Breaker Criteria Badge */}
        {isCriteriaLeader && (
          <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[10px] tracking-wider uppercase animate-pulse shadow-sm">
            CRITERIA
          </span>
        )}
      </div>

      {/* Wrestler Name & Giant Score */}
      <div className="flex items-center justify-between px-2">
        <div className="space-y-0.5">
          <h2 className="text-lg font-bold text-white leading-tight truncate max-w-[170px]">
            {wrestler.name}
          </h2>
          <div className="text-xs text-slate-400">
            {wrestler.countryOrTeam} • {match.metadata.weightClass}
          </div>
        </div>

        <div
          className={`text-6xl md:text-7xl font-extrabold tabular-nums tracking-tight ${
            isRed ? 'text-red-500' : 'text-blue-500'
          }`}
        >
          {wrestler.score}
        </div>
      </div>

      {/* 4 Large Point Buttons (+1, +2, +4, +5) */}
      <div className="grid grid-cols-4 gap-2">
        {([1, 2, 4, 5] as PointValue[]).map((pts) => (
          <button
            key={pts}
            type="button"
            onClick={() => addPoints(corner, pts)}
            className={`py-3.5 rounded-xl font-black text-xl text-white shadow-md transition flex flex-col items-center justify-center cursor-pointer active:scale-95 ${
              isRed
                ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 shadow-red-950/60'
                : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-blue-950/60'
            }`}
          >
            <span className="flex items-center leading-none">
              <Plus className="w-4 h-4 stroke-[3]" />
              {pts}
            </span>
            <span className="text-[9px] font-mono opacity-60 mt-0.5">
              ({pointKeys[pts]})
            </span>
          </button>
        ))}
      </div>

      {/* Panel Pelanggaran (Caution O & Passivity P) */}
      <div className="space-y-2 pt-2 border-t border-slate-800">
        {/* Caution (O) Row */}
        <div className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300">Caution (O):</span>
            {/* 3 Bulatan Indikator Caution */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((cIdx) => (
                <div
                  key={cIdx}
                  className={`w-3.5 h-3.5 rounded-full border transition ${
                    wrestler.cautions >= cIdx
                      ? 'bg-amber-400 border-amber-300 shadow-xs shadow-amber-400'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Quick Caution Action Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => addCaution(corner, 0)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
              title="Caution tanpa poin tambahan"
            >
              O
            </button>
            <button
              type="button"
              onClick={() => addCaution(corner, 1)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
              title="Caution + 1 poin untuk lawan"
            >
              O +1
            </button>
            <button
              type="button"
              onClick={() => addCaution(corner, 2)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
              title="Caution + 2 poin untuk lawan"
            >
              O +2
            </button>
          </div>
        </div>

        {/* Passivity (P) & Activity Clock */}
        <div className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-300">
              Passivity (P): {wrestler.passivityCount}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => addPassivity(corner)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer flex items-center gap-1"
            >
              +P <span className="text-[10px] opacity-60">({passivityKey})</span>
            </button>

            {/* Tombol Kontrol Activity Clock khusus FS / WW */}
            {match.metadata.style !== 'GR' && (
              <>
                {isActivityActive ? (
                  <button
                    type="button"
                    onClick={cancelActivityClock}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer flex items-center gap-1 animate-pulse"
                  >
                    <X className="w-3.5 h-3.5" />
                    Batal 30s ({formattedActivity})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startActivityClock(corner)}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 cursor-pointer flex items-center gap-1"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    30s Act
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Challenge & Medical Controls */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
        {/* Challenge Control */}
        <div className="flex flex-col gap-1">
          {isChallenging ? (
            <div className="p-1.5 rounded-lg bg-amber-950/70 border border-amber-500 flex flex-col gap-1">
              <span className="text-[9px] font-black uppercase text-amber-300 text-center">
                Review Challenge
              </span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => resolveChallenge('WON')}
                  className="py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold flex items-center justify-center cursor-pointer"
                  title="Challenge Menang (Tetap simpan kuota)"
                >
                  <Check className="w-3 h-3" /> Won
                </button>
                <button
                  type="button"
                  onClick={() => resolveChallenge('LOST')}
                  className="py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold flex items-center justify-center cursor-pointer"
                  title="Challenge Kalah (Lawan +1 & kuota hangus)"
                >
                  <X className="w-3 h-3" /> Lost
                </button>
                <button
                  type="button"
                  onClick={() => resolveChallenge('CANCEL')}
                  className="py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-bold flex items-center justify-center cursor-pointer"
                  title="Batal Challenge"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!wrestler.hasChallenge}
              onClick={() => openChallenge(corner)}
              className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                wrestler.hasChallenge
                  ? 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-700'
                  : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed line-through'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              {wrestler.hasChallenge ? 'Challenge (1)' : 'Challenge Hangus'}
            </button>
          )}
        </div>

        {/* Medical Timers (Injury & Blood) */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => toggleMedicalTimer(corner, 'injury')}
            className={`py-2 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center transition cursor-pointer border ${
              isInjuryRunning
                ? 'bg-amber-600 border-amber-400 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
            title="Injury Timer (Maksimal 2:00 kumulatif)"
          >
            <span className="flex items-center gap-1">
              <HeartPulse className="w-3 h-3 text-rose-400" /> Inj
            </span>
            <span className="font-mono text-[10px] leading-tight">{injuryTimeStr}</span>
          </button>

          <button
            type="button"
            onClick={() => toggleMedicalTimer(corner, 'blood')}
            className={`py-2 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center transition cursor-pointer border ${
              isBloodRunning
                ? 'bg-rose-600 border-rose-400 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
            title="Blood Timer (Maksimal 4:00 kumulatif)"
          >
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-red-400" /> Bld
            </span>
            <span className="font-mono text-[10px] leading-tight">{bloodTimeStr}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
