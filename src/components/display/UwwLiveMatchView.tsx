import { useEffect, useState } from 'react';
import { MatchState, WrestlerState } from '../../types/match';
import { TieBreakerResult } from '../../engine/uwwRules';
import { HeartPulse } from 'lucide-react';
import PorprovLogo from '../common/PorprovLogo';
import { getRegionFlagUrl, normalizeRegionCode } from '../../utils/flagHelper';
import {
  formatAgeWeightCode,
  formatBoutDigits,
  formatFullStyleName,
} from '../../utils/scoreboardDisplayHelpers';

interface UwwLiveMatchViewProps {
  match: MatchState;
  tieBreaker: TieBreakerResult;
  mainMs: number;
  formattedMain: string;
  formattedBreak: string;
  formattedActivity: string;
  formattedRedInjury?: string;
  formattedRedBlood?: string;
  formattedBlueInjury?: string;
  formattedBlueBlood?: string;
  isRedInjuryRunning?: boolean;
  isRedBloodRunning?: boolean;
  isBlueInjuryRunning?: boolean;
  isBlueBloodRunning?: boolean;
  variant?: 'tv' | 'mini';
}

/**
 * Komponen SVG Bendera Negara / Kontingen Daerah (rasio 16:10) seperti pada layar UWW Arena.
 */
function ContingentFlag({
  code,
  corner,
  isMini,
}: {
  code: string;
  corner: 'RED' | 'BLUE';
  isMini: boolean;
}) {
  const upper = normalizeRegionCode(code);
  const flagUrl = getRegionFlagUrl(upper);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [upper]);

  const sizeClass = isMini
    ? 'w-14 h-9 rounded-[2px]'
    : 'w-28 h-18 md:w-44 md:h-28 xl:w-56 xl:h-36 rounded-xs';

  if (flagUrl && !hasError) {
    return (
      <span
        title={upper}
        className={`${sizeClass} region-flag inline-flex shrink-0 items-center justify-center overflow-hidden bg-white/95 p-0.5 md:p-1 shadow-md border border-white/20`}
      >
        <img
          src={flagUrl}
          alt={upper}
          loading="eager"
          draggable={false}
          onError={() => setHasError(true)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  // Bendera spesifik untuk negara populer & Indonesia
  if (upper === 'INA' || upper === 'IDN') {
    return (
      <svg viewBox="0 0 160 100" className={`${sizeClass} shrink-0 shadow-md border border-white/15`}>
        <rect width="160" height="50" fill="#e11d48" />
        <rect y="50" width="160" height="50" fill="#ffffff" />
      </svg>
    );
  }

  if (upper === 'SWE') {
    return (
      <svg viewBox="0 0 160 100" className={`${sizeClass} shrink-0 shadow-md border border-white/15`}>
        <rect width="160" height="100" fill="#006aa7" />
        <rect x="50" width="20" height="100" fill="#fecc02" />
        <rect y="40" width="160" height="20" fill="#fecc02" />
      </svg>
    );
  }

  if (upper === 'USA') {
    return (
      <svg viewBox="0 0 160 100" className={`${sizeClass} shrink-0 shadow-md border border-white/15`}>
        <rect width="160" height="100" fill="#ffffff" />
        {[0, 2, 4, 6, 8, 10, 12].map((i) => (
          <rect key={i} y={i * 7.69} width="160" height="7.7" fill="#b22234" />
        ))}
        <rect width="68" height="53.8" fill="#3c3b6e" />
        {[12, 26, 40, 54].map((x) =>
          [11, 26, 41].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.3" fill="#ffffff" />
          ))
        )}
      </svg>
    );
  }

  if (upper === 'JPN') {
    return (
      <svg viewBox="0 0 160 100" className={`${sizeClass} shrink-0 shadow-md border border-white/15`}>
        <rect width="160" height="100" fill="#ffffff" />
        <circle cx="80" cy="50" r="30" fill="#bc002d" />
      </svg>
    );
  }

  if (upper === 'ARM') {
    return (
      <svg viewBox="0 0 160 100" className={`${sizeClass} shrink-0 shadow-md border border-white/15`}>
        <rect width="160" height="33.3" fill="#d90012" />
        <rect y="33.3" width="160" height="33.3" fill="#0033a0" />
        <rect y="66.6" width="160" height="33.4" fill="#f2a800" />
      </svg>
    );
  }

  // Palet warna bendera kontingen provinsi / tim berdasarkan hash kode kontingen
  const palettes: Array<[string, string, string]> = [
    ['#006aa7', '#fecc02', '#004a77'], // Biru - Kuning Emas
    ['#15803d', '#facc15', '#ffffff'], // Hijau - Emas - Putih (Jabar / Jatim)
    ['#dc2626', '#ffffff', '#1d4ed8'], // Merah - Putih - Biru (DKI / Nasional)
    ['#0284c7', '#ffffff', '#f59e0b'], // Biru Langit - Putih - Amber (Kaltim / Lampung)
    ['#b91c1c', '#facc15', '#111827'], // Merah - Emas - Hitam (Sumbar / Bali)
    ['#0f766e', '#ffffff', '#eab308'], // Teal - Putih - Emas
  ];

  let hash = 0;
  for (let i = 0; i < upper.length; i++) {
    hash = (hash * 31 + upper.charCodeAt(i)) % palettes.length;
  }
  const [c1, c2, c3] =
    palettes[hash] || (corner === 'RED' ? ['#b91c1c', '#facc15', '#ffffff'] : ['#1d4ed8', '#facc15', '#ffffff']);

  return (
    <svg viewBox="0 0 160 100" className={`${sizeClass} shrink-0 shadow-md border border-white/15`}>
      <rect width="160" height="34" fill={c1} />
      <rect y="34" width="160" height="32" fill={c3} />
      <rect y="66" width="160" height="34" fill={c1} />
      <rect y="30" width="160" height="6" fill={c2} />
      <rect y="64" width="160" height="6" fill={c2} />
      <circle cx="80" cy="50" r="14" fill={c2} stroke={c1} strokeWidth="3" />
    </svg>
  );
}

/**
 * Merender kotak kuning peringatan (Caution / Passivity) secara vertikal di tepi dalam kotak skor
 * persis seperti layar UWW Arena pada screenshot.
 */
function renderCautionSquares(wrestler: WrestlerState, isMini: boolean) {
  // Tampilkan kotak kuning sejumlah cautions (atau minimal 1 kotak jika ada passivityCount > 0 dan cautions === 0)
  const squareCount = Math.min(3, wrestler.cautions);
  const squares = Array.from({ length: squareCount }, (_, i) => i);

  if (squares.length === 0) return null;

  return (
    <div className={`flex flex-col ${isMini ? 'gap-1' : 'gap-2 md:gap-3'}`}>
      {squares.map((idx) => (
        <div
          key={idx}
          className={`${
            isMini
              ? 'w-3.5 h-3.5 rounded-[2px]'
              : 'w-7 h-7 md:w-11 md:h-11 xl:w-14 xl:h-14 rounded-xs'
          } bg-[#ffff00] border border-yellow-600 shadow-[0_0_10px_rgba(255,255,0,0.6)]`}
        />
      ))}
    </div>
  );
}

export default function UwwLiveMatchView({
  match,
  tieBreaker,
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
  variant = 'tv',
}: UwwLiveMatchViewProps) {
  const isMini = variant === 'mini';
  const isBreak = match.phase === 'BREAK';
  const displayTimeStr = isBreak ? formattedBreak : formattedMain;
  const isUnderTenSec = !isBreak && mainMs > 0 && mainMs < 10_000;

  const isRedCriteria = tieBreaker.leader === 'RED';
  const isBlueCriteria = tieBreaker.leader === 'BLUE';

  const isAnyMedicalRunning = Boolean(
    isRedInjuryRunning ||
      isRedBloodRunning ||
      isBlueInjuryRunning ||
      isBlueBloodRunning
  );

  const ageWeightCode = formatAgeWeightCode(
    match.metadata.ageCategory,
    match.metadata.weightClass
  );
  const boutDigits = formatBoutDigits(match.metadata.boutNumber);
  const styleFullName = formatFullStyleName(match.metadata.style);

  return (
    <div className="w-full h-full bg-black text-white select-none flex flex-col justify-between overflow-hidden font-sans">
      {/* =====================================================================
          BAND 1: TOP METALLIC HEADER BAR (S87 | 64 | Freestyle)
          ===================================================================== */}
      <header
        className={`relative w-full ${
          isMini ? 'h-[16%]' : 'h-[14%]'
        } bg-gradient-to-b from-[#353535] via-[#1a1a1a] to-[#080808] border-b border-zinc-800 flex items-center justify-between shrink-0 z-20`}
      >
        {/* Kiri: Age + Weight Code (misal: S87 / S74) */}
        <div
          className={`w-[34%] text-center font-mono font-semibold text-white tracking-wider whitespace-nowrap leading-none ${
            isMini ? 'text-base' : ''
          }`}
          style={
            !isMini ? { fontSize: 'clamp(2rem, 4.8vw, 4.8rem)' } : undefined
          }
          title={`${match.metadata.matName} • ${match.metadata.boutNumber} • ${styleFullName.toUpperCase()} • ${match.metadata.weightClass} • ${match.metadata.ageCategory}`}
        >
          {ageWeightCode}
        </div>

        {/* Tengah: Protruding 3D Metallic Trapezoid dengan Nomor Partai (misal: 64) */}
        <div className="relative w-[32%] h-[118%] self-start flex items-center justify-center z-30">
          <div
            className="
              absolute inset-0
              bg-gradient-to-b from-[#6e6e6e] via-[#484848] to-[#202020]
              shadow-[0_6px_16px_rgba(0,0,0,0.85)]
            "
            style={{
              clipPath: 'polygon(0 0, 100% 0, 88% 100%, 12% 100%)',
            }}
          />
          <span
            className={`relative z-10 font-mono font-semibold text-white tracking-wider leading-none ${
              isMini ? 'text-base' : ''
            }`}
            style={
              !isMini ? { fontSize: 'clamp(2rem, 4.8vw, 4.8rem)' } : undefined
            }
          >
            {boutDigits}
          </span>
        </div>

        {/* Kanan: Nama Gaya dalam Warna Kuning/Emas (misal: Freestyle) */}
        <div
          className={`w-[34%] text-center font-mono font-semibold text-[#f5b800] tracking-wide whitespace-nowrap truncate px-2 leading-none ${
            isMini ? 'text-sm' : ''
          }`}
          style={
            !isMini ? { fontSize: 'clamp(1.8rem, 4.3vw, 4.4rem)' } : undefined
          }
        >
          {styleFullName}
        </div>
      </header>

      {/* =====================================================================
          BAND 2: MIDDLE WRESTLER IDENTITY SECTION (Flag + SWE/USA + Name)
          ===================================================================== */}
      <div className="relative flex-1 w-full bg-black grid grid-cols-2 min-h-0 overflow-hidden">
        {/* Garis Vertikal Pemisah Tengah */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] md:w-[2px] bg-zinc-700/80 pointer-events-none z-10" />

        {/* Sisi Kiri: Pegulat Sudut Merah */}
        <div
          className={`flex flex-col justify-between ${
            isMini ? 'px-2.5 py-1.5' : 'px-5 md:px-10 py-3 md:py-6'
          } min-w-0 overflow-hidden`}
        >
          {/* Baris Atas: Bendera di Kiri Luar, Kode Negara/Kontingen di Kanan Dalam */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <ContingentFlag
              code={match.red.countryOrTeam}
              corner="RED"
              isMini={isMini}
            />
            <span
              className={`font-sans font-bold uppercase text-white tracking-tight leading-none whitespace-nowrap ${
                isMini ? 'text-2xl pr-1' : 'pr-2 md:pr-6'
              }`}
              style={
                !isMini
                  ? { fontSize: 'clamp(3.2rem, 8.8vw, 9.2rem)' }
                  : undefined
              }
            >
              {match.red.countryOrTeam}
            </span>
          </div>

          {/* Baris Bawah: Nama Lengkap Pegulat Merah */}
          <div className="flex items-center justify-between gap-2 mt-auto">
            <div
              className={`w-full font-mono font-semibold uppercase text-white tracking-wider truncate leading-tight ${
                isMini ? 'text-[10px]' : ''
              }`}
              style={
                !isMini
                  ? { fontSize: 'clamp(1.4rem, 3.3vw, 3.5rem)' }
                  : undefined
              }
            >
              {match.red.name}
            </div>
          </div>
        </div>

        {/* Sisi Kanan: Pegulat Sudut Biru */}
        <div
          className={`flex flex-col justify-between ${
            isMini ? 'px-2.5 py-1.5' : 'px-5 md:px-10 py-3 md:py-6'
          } min-w-0 overflow-hidden`}
        >
          {/* Baris Atas: Kode Negara/Kontingen di Kiri Dalam, Bendera di Kanan Luar */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span
              className={`font-sans font-bold uppercase text-white tracking-tight leading-none whitespace-nowrap ${
                isMini ? 'text-2xl pl-1' : 'pl-2 md:pl-6'
              }`}
              style={
                !isMini
                  ? { fontSize: 'clamp(3.2rem, 8.8vw, 9.2rem)' }
                  : undefined
              }
            >
              {match.blue.countryOrTeam}
            </span>
            <ContingentFlag
              code={match.blue.countryOrTeam}
              corner="BLUE"
              isMini={isMini}
            />
          </div>

          {/* Baris Bawah: Nama Lengkap Pegulat Biru */}
          <div className="flex items-center justify-end gap-2 mt-auto">
            <div
              className={`w-full text-right font-mono font-semibold uppercase text-white tracking-wider truncate leading-tight ${
                isMini ? 'text-[10px]' : ''
              }`}
              style={
                !isMini
                  ? { fontSize: 'clamp(1.4rem, 3.3vw, 3.5rem)' }
                  : undefined
              }
            >
              {match.blue.name}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          BAND 3: BOTTOM SCORE & CENTER METALLIC CLOCK SECTION (11 | 3:52 | 8)
          ===================================================================== */}
      <div
        className={`relative w-full ${
          isMini ? 'h-[37%]' : 'h-[38%]'
        } flex items-stretch shrink-0`}
      >
        {/* Kotak Skor Merah (Kiri — 33.5%) */}
        <div
          className="relative w-[33.5%] h-full bg-gradient-to-b from-[#ff0000] via-[#cc0000] to-[#750000] shadow-[inset_0_0_40px_rgba(0,0,0,0.65)] flex items-center justify-center overflow-hidden"
        >
          <span
            id={!isMini ? 'display-red-score' : undefined}
            className={`font-sans font-bold tabular-nums text-white leading-none select-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${
              isMini ? 'text-4xl' : ''
            }`}
            style={
              !isMini
                ? { fontSize: 'clamp(5.5rem, 15.5vw, 16.5rem)' }
                : undefined
            }
          >
            {match.red.score}
          </span>

          {/* Kotak Kuning Caution di Pojok Kanan Atas Kotak Merah (Dekat Jam) */}
          <div
            className={`absolute ${
              isMini ? 'top-1.5 right-1.5' : 'top-3 right-3 md:top-4 md:right-4'
            } flex flex-col items-end gap-1`}
          >
            {renderCautionSquares(match.red, isMini)}
            {match.red.passivityCount > 0 && (
              <span
                className={`font-black bg-amber-400 text-black rounded-xs leading-none ${
                  isMini ? 'text-[7px] px-1 py-0.5' : 'text-xs md:text-base px-2 py-0.5'
                }`}
              >
                P
              </span>
            )}
          </div>

          {/* Indikator Criteria Leader Merah */}
          {isRedCriteria && (
            <div
              className={`absolute ${
                isMini ? 'bottom-1 left-1.5' : 'bottom-2 left-4'
              }`}
            >
              <span
                className={`px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black uppercase tracking-wider shadow ${
                  isMini ? 'text-[6.5px]' : 'text-xs md:text-sm'
                }`}
              >
                CRITERIA LEADER
              </span>
            </div>
          )}
        </div>

        {/* Kotak Jam Metalik 3D Tengah (33% — Menonjol sedikit ke atas seperti screenshot) */}
        <div
          className={`relative w-[33%] ${
            isMini
              ? '-mt-1.5 rounded-t-lg'
              : '-mt-3 md:-mt-4 rounded-t-2xl'
          } bg-gradient-to-b from-[#6a6a6a] via-[#3d3d3d] to-[#1e1e1e] border-t-2 border-x border-white/25 shadow-[0_-6px_25px_rgba(0,0,0,0.9)] flex flex-col items-center justify-center z-20 px-1`}
        >
          {/* Angka Jam Utama */}
          <div
            className={`font-mono font-bold tabular-nums tracking-tight leading-none whitespace-nowrap select-none ${
              isUnderTenSec
                ? 'text-yellow-300 animate-pulse'
                : isBreak
                ? 'text-amber-300'
                : 'text-white'
            } ${isMini ? 'text-2xl' : ''}`}
            style={
              !isMini ? { fontSize: 'clamp(3.2rem, 8.6vw, 9rem)' } : undefined
            }
          >
            {displayTimeStr}
          </div>

          {/* Activity Clock 30s Pop-up / Medical / Next Up Info */}
          {match.activityClock.activeCorner && (
            <div
              className={`${
                isMini
                  ? 'mt-0.5 px-1.5 py-0.2 text-[7px] rounded'
                  : 'mt-1.5 px-3 py-1 text-xs md:text-base rounded-lg'
              } bg-[#ffff00] text-black font-black uppercase tracking-wider flex items-center gap-1 shadow-md whitespace-nowrap`}
            >
              {match.activityClock.activeCorner === 'RED' && <span>◀</span>}
              <span>ACTIVITY {formattedActivity}</span>
              {match.activityClock.activeCorner === 'BLUE' && <span>▶</span>}
            </div>
          )}

          {isAnyMedicalRunning && (
            <div
              className={`${
                isMini ? 'text-[6.5px] mt-0.5' : 'text-xs md:text-sm mt-1'
              } flex items-center gap-1 text-rose-300 font-black uppercase animate-pulse whitespace-nowrap`}
            >
              <HeartPulse className={isMini ? 'w-2.5 h-2.5' : 'w-4 h-4'} />
              {isRedInjuryRunning && <span>RED INJ {formattedRedInjury}</span>}
              {isRedBloodRunning && <span>RED BLD {formattedRedBlood}</span>}
              {isBlueInjuryRunning && <span>BLUE INJ {formattedBlueInjury}</span>}
              {isBlueBloodRunning && <span>BLUE BLD {formattedBlueBlood}</span>}
            </div>
          )}

          {!match.activityClock.activeCorner && !isAnyMedicalRunning && (
            <div
              className={`${
                isMini
                  ? 'mt-0.5 px-1.5 py-0.5 gap-1 text-[6px] rounded'
                  : 'mt-1.5 px-3.5 py-1 gap-2 md:gap-2.5 text-[11px] md:text-sm xl:text-base rounded-xl'
              } bg-black/45 border border-amber-400/40 shadow-inner flex items-center justify-center max-w-[94%] overflow-hidden`}
            >
              <PorprovLogo isMini={isMini} />
              <span className="font-black text-amber-300 tracking-wider uppercase whitespace-nowrap truncate">
                PORPROV X LAMPUNG 2026
              </span>
            </div>
          )}
        </div>

        {/* Kotak Skor Biru (Kanan — 33.5%) */}
        <div
          className="relative w-[33.5%] h-full bg-gradient-to-b from-[#0026ff] via-[#0018cc] to-[#000b75] shadow-[inset_0_0_40px_rgba(0,0,0,0.65)] flex items-center justify-center overflow-hidden"
        >
          {/* Kotak Kuning Caution di Pojok Kiri Atas Kotak Biru (Dekat Jam) */}
          <div
            className={`absolute ${
              isMini ? 'top-1.5 left-1.5' : 'top-3 left-3 md:top-4 md:left-4'
            } flex flex-col items-start gap-1`}
          >
            {renderCautionSquares(match.blue, isMini)}
            {match.blue.passivityCount > 0 && (
              <span
                className={`font-black bg-amber-400 text-black rounded-xs leading-none ${
                  isMini ? 'text-[7px] px-1 py-0.5' : 'text-xs md:text-base px-2 py-0.5'
                }`}
              >
                P
              </span>
            )}
          </div>

          <span
            id={!isMini ? 'display-blue-score' : undefined}
            className={`font-sans font-bold tabular-nums text-white leading-none select-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${
              isMini ? 'text-4xl' : ''
            }`}
            style={
              !isMini
                ? { fontSize: 'clamp(5.5rem, 15.5vw, 16.5rem)' }
                : undefined
            }
          >
            {match.blue.score}
          </span>

          {/* Indikator Criteria Leader Biru */}
          {isBlueCriteria && (
            <div
              className={`absolute ${
                isMini ? 'bottom-1 right-1.5' : 'bottom-2 right-4'
              }`}
            >
              <span
                className={`px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black uppercase tracking-wider shadow ${
                  isMini ? 'text-[6.5px]' : 'text-xs md:text-sm'
                }`}
              >
                CRITERIA LEADER
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Metadata aksesibilitas tersembunyi untuk pencarian layar & unit test */}
      <div className="sr-only">
        <span>{match.metadata.matName}</span>
        <span>{match.metadata.boutNumber}</span>
        <span>
          {styleFullName.toUpperCase()} • {match.metadata.weightClass} •{' '}
          {match.metadata.ageCategory}
        </span>
        <span>
          {match.phase === 'PERIOD_1'
            ? 'PERIOD 1'
            : match.phase === 'PERIOD_2'
            ? 'PERIOD 2'
            : match.phase}
        </span>
      </div>
    </div>
  );
}
