import {
  CheckCircle2,
  AlertOctagon,
  Sparkles,
  MousePointerClick,
} from 'lucide-react';
import { Athlete, DivisionFormat } from '../../types/tournament';
import {
  BallSlotMeta,
  BallZoneType,
  getBallSlotMetadata,
} from '../../engine/uwwManualDraw';

interface BallTrackerBoardProps {
  totalAthletes: number;
  format: DivisionFormat;
  athletes: Athlete[];
  activeAthlete: Athlete | null;
  isLocked: boolean;
  isPresentationMode?: boolean;
  onSelectBall: (ballNumber: number) => void;
}

function getZoneBadgeClasses(zone: BallZoneType, isAvailable: boolean): string {
  if (!isAvailable) {
    return 'bg-slate-900 text-slate-400 border-slate-700';
  }
  switch (zone) {
    case 'BYE':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
    case 'QUAL':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
    case 'POOL_A':
      return 'bg-sky-500/20 text-sky-300 border-sky-500/50';
    case 'POOL_B':
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50';
    case 'NORDIC':
      return 'bg-teal-500/20 text-teal-300 border-teal-500/50';
    case 'MAIN':
    default:
      return 'bg-sky-500/20 text-sky-300 border-sky-500/50';
  }
}

function getAvailableCardClasses(zone: BallZoneType): string {
  switch (zone) {
    case 'BYE':
      return 'bg-emerald-950/70 hover:bg-emerald-900/90 border-emerald-500/80 hover:border-emerald-400 shadow-lg shadow-emerald-950/60';
    case 'QUAL':
      return 'bg-amber-950/70 hover:bg-amber-900/90 border-amber-500/80 hover:border-amber-400 shadow-lg shadow-amber-950/60';
    case 'POOL_A':
      return 'bg-sky-950/70 hover:bg-sky-900/90 border-sky-500/80 hover:border-sky-400 shadow-lg shadow-sky-950/60';
    case 'POOL_B':
      return 'bg-indigo-950/70 hover:bg-indigo-900/90 border-indigo-500/80 hover:border-indigo-400 shadow-lg shadow-indigo-950/60';
    case 'NORDIC':
      return 'bg-teal-950/70 hover:bg-teal-900/90 border-teal-500/80 hover:border-teal-400 shadow-lg shadow-teal-950/60';
    case 'MAIN':
    default:
      return 'bg-sky-950/70 hover:bg-sky-900/90 border-sky-500/80 hover:border-sky-400 shadow-lg shadow-sky-950/60';
  }
}

export default function BallTrackerBoard({
  totalAthletes,
  format,
  athletes,
  activeAthlete,
  isLocked,
  isPresentationMode = false,
  onSelectBall,
}: BallTrackerBoardProps) {
  const slots: BallSlotMeta[] = getBallSlotMetadata(totalAthletes, format);

  // Kelompokkan atlet berdasarkan drawNumber
  const holdersByBall = new Map<number, Athlete[]>();
  for (const ath of athletes) {
    if (
      typeof ath.drawNumber === 'number' &&
      Number.isInteger(ath.drawNumber) &&
      ath.drawNumber >= 1 &&
      ath.drawNumber <= totalAthletes
    ) {
      const list = holdersByBall.get(ath.drawNumber) || [];
      list.push(ath);
      holdersByBall.set(ath.drawNumber, list);
    }
  }

  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
      {/* Header Papan Bola Fisik */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <h4
            className={`font-black uppercase tracking-wider text-white ${
              isPresentationMode ? 'text-base' : 'text-xs'
            }`}
          >
            Papan Indikator Bola Undian Fisik (#1 s.d. #{totalAthletes})
          </h4>
        </div>

        {/* Info Atlet Aktif untuk Click-to-Assign */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {!isLocked && activeAthlete ? (
            <div className="px-3 py-1 rounded-xl bg-sky-950/90 border border-sky-500/60 text-sky-200 flex items-center gap-1.5 font-bold">
              <MousePointerClick className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>
                Klik bola untuk:{' '}
                <strong className="text-white underline">
                  {activeAthlete.name}
                </strong>{' '}
                ({activeAthlete.regionCode})
              </span>
            </div>
          ) : !isLocked ? (
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <MousePointerClick className="w-3.5 h-3.5 text-slate-500" />
              Klik angka bola di bawah untuk mengisi atlet kosong berikutnya
            </span>
          ) : null}
        </div>
      </div>

      {/* Grid Bola Fisik 1..N */}
      <div
        className={`grid gap-2.5 ${
          isPresentationMode
            ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
            : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-11'
        }`}
      >
        {slots.map((slot) => {
          const holders = holdersByBall.get(slot.ballNumber) || [];
          const isAvailable = holders.length === 0;
          const isUsed = holders.length === 1;
          const isConflict = holders.length > 1;
          const isHeldByActive =
            activeAthlete &&
            holders.some((h) => h.id === activeAthlete.id);

          return (
            <button
              key={slot.ballNumber}
              type="button"
              disabled={isLocked}
              onClick={() => onSelectBall(slot.ballNumber)}
              title={`${slot.slotDescription}${
                holders.length > 0
                  ? ` — Dipegang oleh: ${holders.map((h) => `${h.name} (${h.regionCode})`).join(', ')}`
                  : ' — Belum dipilih (Klik untuk menetapkan)'
              }`}
              className={`relative rounded-2xl border-2 p-2.5 flex flex-col items-center justify-between text-center transition select-none ${
                isPresentationMode ? 'min-h-[118px]' : 'min-h-[94px]'
              } ${
                isLocked
                  ? 'cursor-default opacity-80 '
                  : 'cursor-pointer active:scale-95 '
              } ${
                isConflict
                  ? 'bg-rose-950/95 border-rose-500 ring-2 ring-rose-400 animate-pulse shadow-lg shadow-rose-950'
                  : isAvailable
                  ? getAvailableCardClasses(slot.zone)
                  : isHeldByActive
                  ? 'bg-slate-900 border-sky-400 ring-2 ring-sky-400/60'
                  : 'bg-slate-900/50 border-slate-800/90 opacity-65 hover:opacity-95 hover:border-slate-700'
              }`}
            >
              {/* Baris Atas: Sub-Label Zona Resmi UWW */}
              <div className="w-full flex items-center justify-between gap-1">
                <span
                  className={`px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider border ${
                    isPresentationMode ? 'text-[11px]' : 'text-[9px]'
                  } ${
                    isConflict
                      ? 'bg-rose-600 text-white border-rose-400'
                      : getZoneBadgeClasses(slot.zone, isAvailable)
                  }`}
                >
                  {slot.zoneLabel}
                </span>

                {isConflict ? (
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                ) : isUsed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </div>

              {/* Angka Bola Fisik */}
              <div
                className={`font-mono font-black leading-none my-1 ${
                  isPresentationMode ? 'text-3xl' : 'text-2xl'
                } ${
                  isConflict
                    ? 'text-rose-200'
                    : isAvailable
                    ? 'text-white'
                    : 'text-slate-500 line-through decoration-slate-600 decoration-2'
                }`}
              >
                #{slot.ballNumber}
              </div>

              {/* Baris Bawah: Nama Pemegang atau Status Tersedia */}
              <div className="w-full">
                {isConflict ? (
                  <div
                    className={`font-black text-rose-300 truncate ${
                      isPresentationMode ? 'text-xs' : 'text-[10px]'
                    }`}
                  >
                    KONFLIK ({holders.length})
                  </div>
                ) : isUsed ? (
                  <div className="leading-tight">
                    <div
                      className={`font-bold text-slate-300 truncate ${
                        isPresentationMode ? 'text-xs' : 'text-[10px]'
                      }`}
                    >
                      {holders[0].name}
                    </div>
                    <div className="text-[9px] font-mono font-black text-sky-400 truncate">
                      {holders[0].regionCode}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`font-extrabold uppercase tracking-wider text-emerald-300/90 ${
                      isPresentationMode ? 'text-xs' : 'text-[9px]'
                    }`}
                  >
                    TERSEDIA
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legenda Posisi Slot Bagan UWW */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-900 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            <span>
              <strong className="text-white">Cerah:</strong> Bola Tersedia (Belum Ditarik)
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" />
            <span>
              <strong className="text-slate-300">Redup / Tercoret:</strong> Sudah Terpakai
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <span>
              <strong className="text-rose-400">Merah Berkedip:</strong> Nomor Duplikat / Konflik
            </span>
          </span>
        </div>

        <div className="font-mono text-[10px] text-slate-400">
          {format === 'ELIMINATION_REPECHAGE' && (
            <span>
              BYE = Langsung Babak Utama • QUAL = Babak Kualifikasi
            </span>
          )}
          {format === 'GROUP_CROSS' && (
            <span>
              POOL A = Bola #1..#{Math.ceil(totalAthletes / 2)} • POOL B = Bola #
              {Math.ceil(totalAthletes / 2) + 1}..#{totalAthletes}
            </span>
          )}
          {format === 'NORDIC' && (
            <span>NORDIC = Round-Robin Penuh (Semua Bertemu Semua)</span>
          )}
          {format === 'SINGLE_BOUT' && (
            <span>#1 = Sudut Merah (RED) • #2 = Sudut Biru (BLUE)</span>
          )}
        </div>
      </div>
    </div>
  );
}
