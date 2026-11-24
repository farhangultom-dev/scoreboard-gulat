import { Corner, MatchState, WrestlerState } from '../../types/match';
import RegionFlag from '../common/RegionFlag';

interface PreMatchIntroViewProps {
  match: MatchState;
  variant?: 'tv' | 'mini';
}

/**
 * Mengonversi nama babak turnamen ke singkatan resmi layar UWW:
 * Contoh: QUALIFICATION -> "Qualif.", QUARTERFINAL -> "1/4 Final", GOLD_FINAL -> "Final"
 */
export function formatUwwRoundShortLabel(round?: string): string {
  if (!round) return 'Qualif.';
  const upper = round.trim().toUpperCase();

  switch (upper) {
    case 'QUALIFICATION':
      return 'Qualif.';
    case 'ROUND_OF_32':
      return '1/16 Final';
    case 'ROUND_OF_16':
      return '1/8 Final';
    case 'QUARTERFINAL':
      return '1/4 Final';
    case 'SEMIFINAL':
      return '1/2 Final';
    case 'REPECHAGE_1':
    case 'REPECHAGE_2':
      return 'Repech.';
    case 'BRONZE_1':
    case 'BRONZE_2':
      return 'Bronze';
    case 'GOLD_FINAL':
      return 'Final';
    case 'GROUP_A':
      return 'Group A';
    case 'GROUP_B':
      return 'Group B';
    case 'NORDIC_R1':
      return 'Round 1';
    case 'NORDIC_R2':
      return 'Round 2';
    case 'NORDIC_R3':
      return 'Round 3';
    case 'NORDIC_R4':
      return 'Round 4';
    case 'NORDIC_R5':
      return 'Round 5';
    default:
      return round;
  }
}

/**
 * Mengekstrak angka kelas berat tanpa "KG" (contoh: "65 KG" -> "65", "74 KG" -> "74").
 */
function formatWeightNumberOnly(weightClass: string): string {
  return weightClass.replace(/\s*KG/i, '').trim() || weightClass;
}

/**
 * Mengekstrak nomor urut partai saja (contoh: "BOUT 2" -> "2", "BOUT 14" -> "14").
 */
function formatBoutNumberDigits(boutNumber: string): string {
  const digits = boutNumber.replace(/[^0-9]/g, '');
  if (digits) return digits;
  const trimmed = (boutNumber || '').trim().toUpperCase();
  return !trimmed || trimmed === 'BOUT' ? '1' : boutNumber;
}

/**
 * Menentukan apakah pertandingan masih berada pada tampilan Pre-Match Intro
 * (belum dimulai, skor masih 0-0, belum ada event/challenge/activity clock).
 */
export function isPreMatchIntroState(match: MatchState): boolean {
  return (
    match.phase === 'PRE_MATCH' &&
    !match.mainClock.isRunning &&
    match.red.score === 0 &&
    match.blue.score === 0 &&
    match.events.length === 0 &&
    match.activeChallengeCorner === null &&
    match.winner === null &&
    match.activityClock.activeCorner === null
  );
}

interface WrestlerIntroBannerProps {
  corner: Corner;
  wrestler: WrestlerState;
  isMini: boolean;
}

/**
 * Merender satu pita banner pegulat (Merah / Biru) pada layar Pre-Match Intro
 * dengan kolom logo daerah + kode kontingen yang sejajar konsisten serta kolom nama rata kiri.
 */
function WrestlerIntroBanner({
  corner,
  wrestler,
  isMini,
}: WrestlerIntroBannerProps) {
  const isRed = corner === 'RED';

  return (
    <div
      className={`w-full ${
        isMini ? 'h-[40%] px-2.5 gap-2' : 'h-[41%] px-6 md:px-12 gap-4 md:gap-6'
      } ${
        isRed
          ? 'bg-gradient-to-b from-[#d80000] via-[#b80000] to-[#7a0000] border-[#450000]'
          : 'bg-gradient-to-b from-[#0022e0] via-[#0018b8] to-[#000c7a] border-[#000845]'
      } shadow-[inset_0_0_45px_rgba(0,0,0,0.75)] border flex items-center overflow-hidden`}
    >
      {/* Kolom Kiri: Wadah Logo Daerah + Kode Daerah Proporsional */}
      <div
        className={`${
          isMini ? 'w-[46%] gap-2 pr-2' : 'w-[42%] gap-4 md:gap-7 pr-4 md:pr-6'
        } shrink-0 flex items-center min-w-0 overflow-hidden`}
      >
        <RegionFlag
          code={wrestler.countryOrTeam}
          regionName={wrestler.countryOrTeam}
          size={isMini ? 'sm' : 'tv'}
          overrideBoxClass={
            isMini
              ? 'h-9 w-11 p-0.5 rounded-sm'
              : 'h-[clamp(4.6rem,10.5vw,10.5rem)] w-[clamp(5.4rem,12vw,12rem)] p-1.5 md:p-2 rounded-lg md:rounded-xl shadow-[0_6px_20px_rgba(0,0,0,0.45)]'
          }
          showFallbackText={false}
        />

        {/* Kode Kontingen */}
        <div
          className={`flex-1 min-w-0 font-sans font-bold uppercase text-white tracking-tight leading-none whitespace-nowrap truncate ${
            isMini ? 'text-2xl' : ''
          }`}
          style={
            !isMini
              ? { fontSize: 'clamp(3rem, 7.6vw, 8rem)' }
              : undefined
          }
        >
          {wrestler.countryOrTeam}
        </div>
      </div>

      {/* Kolom Kanan: Nama Pegulat (Sejajar Vertikal Antara Merah & Biru) */}
      <div
        className={`flex-1 min-w-0 border-l border-white/15 font-mono font-semibold uppercase text-white tracking-wider truncate leading-none ${
          isMini ? 'text-sm pl-2.5' : 'pl-5 md:pl-9'
        }`}
        style={
          !isMini
            ? { fontSize: 'clamp(2rem, 5vw, 5.2rem)' }
            : undefined
        }
      >
        {wrestler.name}
      </div>
    </div>
  );
}

export default function PreMatchIntroView({
  match,
  variant = 'tv',
}: PreMatchIntroViewProps) {
  const isMini = variant === 'mini';
  const styleWeightText = `${match.metadata.style} ${formatWeightNumberOnly(
    match.metadata.weightClass
  )}`;
  const boutDigitText = formatBoutNumberDigits(match.metadata.boutNumber);
  const roundText = formatUwwRoundShortLabel(match.metadata.round);

  return (
    <div className="w-full h-full bg-black text-white select-none flex flex-col justify-between p-[2px] md:p-1 overflow-hidden">
      {/* Baris 1: Top Metallic Header Bar (FS 65 | 2 | Qualif.) */}
      <div
        className={`relative w-full ${
          isMini ? 'h-[19%]' : 'h-[17%]'
        } bg-gradient-to-b from-[#383838] via-[#1c1c1c] to-[#0a0a0a] flex items-center justify-between overflow-hidden border-b border-black`}
      >
        {/* Center Trapezoid Metallic Panel */}
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[32%] bg-gradient-to-b from-[#6e6e6e] via-[#474747] to-[#1e1e1e] pointer-events-none"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 90% 100%, 10% 100%)',
          }}
        />

        {/* Kiri: Style + Weight Number (misal: FS 65) */}
        <div
          className={`relative z-10 w-[34%] ${
            isMini ? 'pl-2.5 text-lg' : 'pl-6 md:pl-10'
          } font-mono font-semibold text-white tracking-wider whitespace-nowrap leading-none`}
          style={
            !isMini
              ? { fontSize: 'clamp(2.2rem, 5.5vw, 5.5rem)' }
              : undefined
          }
        >
          {styleWeightText}
        </div>

        {/* Tengah: Nomor Partai di dalam Trapezoid (misal: 2) */}
        <div
          className={`relative z-10 w-[32%] text-center ${
            isMini ? 'text-lg' : ''
          } font-mono font-semibold text-white tracking-wider whitespace-nowrap leading-none`}
          style={
            !isMini
              ? { fontSize: 'clamp(2.2rem, 5.5vw, 5.5rem)' }
              : undefined
          }
        >
          {boutDigitText}
        </div>

        {/* Kanan: Babak dalam warna Kuning UWW (misal: Qualif.) */}
        <div
          className={`relative z-10 w-[34%] text-right ${
            isMini ? 'pr-2.5 text-lg' : 'pr-6 md:pr-10'
          } font-mono font-semibold text-[#eefb00] tracking-wide whitespace-nowrap truncate leading-none`}
          style={
            !isMini
              ? { fontSize: 'clamp(2.1rem, 5.2vw, 5.2rem)' }
              : undefined
          }
        >
          {roundText}
        </div>
      </div>

      {/* Baris 2: Red Wrestler Banner */}
      <WrestlerIntroBanner
        corner="RED"
        wrestler={match.red}
        isMini={isMini}
      />

      {/* Baris 3: Blue Wrestler Banner */}
      <WrestlerIntroBanner
        corner="BLUE"
        wrestler={match.blue}
        isMini={isMini}
      />
    </div>
  );
}
