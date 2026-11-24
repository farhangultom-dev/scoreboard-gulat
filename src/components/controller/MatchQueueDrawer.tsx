import { useMemo } from 'react';
import {
  X,
  Play,
  RotateCcw,
  Clock,
  CheckCircle2,
  ListOrdered,
  Radio,
  Layers,
} from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useMatchStore } from '../../store/useMatchStore';
import { TournamentBout } from '../../types/tournament';
import RegionFlag from '../common/RegionFlag';

interface MatchQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MatchQueueDrawer({
  isOpen,
  onClose,
}: MatchQueueDrawerProps) {
  const bouts = useTournamentStore((s) => s.bouts);
  const orderOfBouts = useTournamentStore((s) => s.orderOfBouts);
  const activeMat = useTournamentStore((s) => s.activeMat);
  const setActiveMat = useTournamentStore((s) => s.setActiveMat);
  const divisions = useTournamentStore((s) => s.divisions);
  const athletes = useTournamentStore((s) => s.athletes);

  const loadBoutToMatch = useTournamentStore((s) => s.loadBoutToMatch);
  const cancelCurrentBout = useTournamentStore((s) => s.cancelCurrentBout);

  const activeBoutId = useMatchStore((s) => s.match.activeBoutId);

  // Filter partai pada matras yang sedang aktif (gunakan orderOfBouts + fallback sorted bouts agar tidak pernah kosong)
  const boutsOnMat = useMemo(() => {
    const orderedIds = new Set<string>();
    const combined: TournamentBout[] = [];

    for (const id of orderOfBouts) {
      const b = bouts[id];
      if (b && (b.matName || 'MAT A') === activeMat) {
        orderedIds.add(id);
        combined.push(b);
      }
    }

    const remaining = Object.values(bouts)
      .filter((b) => !orderedIds.has(b.id) && (b.matName || 'MAT A') === activeMat)
      .sort((a, b) => {
        const numA = a.boutNumber ?? 999999;
        const numB = b.boutNumber ?? 999999;
        if (numA !== numB) return numA - numB;
        if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
        return a.bracketPosition - b.bracketPosition;
      });

    return [...combined, ...remaining];
  }, [bouts, orderOfBouts, activeMat]);

  if (!isOpen) return null;

  const currentInProgress = boutsOnMat.find(
    (b) => b.status === 'IN_PROGRESS' || b.id === activeBoutId
  );
  const onDeckBout = boutsOnMat.find((b) => b.status === 'ON_DECK');
  const upcomingScheduled = boutsOnMat.filter(
    (b) =>
      b.status === 'SCHEDULED' &&
      b.id !== currentInProgress?.id &&
      b.id !== onDeckBout?.id
  );

  const handleLoad = (boutId: string) => {
    loadBoutToMatch(boutId);
    onClose();
  };

  const handleCancelActive = async (boutId: string) => {
    if (
      window.confirm(
        'Kembalikan partai ini ke status antrean (SCHEDULED)? Skor di scoreboard saat ini tidak akan dihapus.'
      )
    ) {
      await cancelCurrentBout(boutId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs select-none">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl text-white animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <ListOrdered className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider">
                Antrean Partai Matras
              </h2>
              <p className="text-[10px] text-slate-400 font-semibold">
                Integrasi 1-Klik Roster &amp; Papan Skor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Matras Selector */}
            <select
              value={activeMat}
              onChange={(e) => setActiveMat(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs font-bold text-amber-400 focus:outline-hidden cursor-pointer"
            >
              <option value="MAT A">MAT A</option>
              <option value="MAT B">MAT B</option>
              <option value="MAT C">MAT C</option>
              <option value="MAT D">MAT D</option>
            </select>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Section 1: Sedang Berlangsung (IN_PROGRESS) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>Sedang Bertanding (On Mat)</span>
            </div>

            {currentInProgress ? (
              <div className="p-3.5 rounded-2xl bg-emerald-950/40 border-2 border-emerald-600/80 shadow-lg space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-black text-amber-400">
                    {currentInProgress.boutNumber
                      ? `BOUT #${currentInProgress.boutNumber}`
                      : 'PARTAI AKTIF'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {divisions[currentInProgress.divisionId]?.style}{' '}
                    {divisions[currentInProgress.divisionId]?.weightClass} •{' '}
                    {currentInProgress.round.replace('_', ' ')}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-xl text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <RegionFlag
                        code={athletes[currentInProgress.redAthleteId || '']?.regionCode}
                        regionName={athletes[currentInProgress.redAthleteId || '']?.region}
                        size="xs"
                      />
                      <span className="font-bold text-red-400 truncate">
                        {athletes[currentInProgress.redAthleteId || '']?.name || 'RED'}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {athletes[currentInProgress.redAthleteId || '']?.regionCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-xl text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <RegionFlag
                        code={athletes[currentInProgress.blueAthleteId || '']?.regionCode}
                        regionName={athletes[currentInProgress.blueAthleteId || '']?.region}
                        size="xs"
                      />
                      <span className="font-bold text-blue-400 truncate">
                        {athletes[currentInProgress.blueAthleteId || '']?.name || 'BLUE'}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {athletes[currentInProgress.blueAthleteId || '']?.regionCode}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Terhubung ke Scoreboard
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCancelActive(currentInProgress.id)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 text-[10px] font-semibold flex items-center gap-1 transition border border-slate-700 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Lepas Partai</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-xs text-slate-500">
                Tidak ada partai yang sedang dimainkan di {activeMat}.
              </div>
            )}
          </div>

          {/* Section 2: Berikutnya (ON_DECK) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>Berikutnya (On Deck)</span>
            </div>

            {onDeckBout ? (
              <div className="p-3.5 rounded-2xl bg-amber-950/30 border-2 border-amber-500/80 shadow-lg space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-black text-amber-300">
                    {onDeckBout.boutNumber ? `BOUT #${onDeckBout.boutNumber}` : 'ON DECK'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {divisions[onDeckBout.divisionId]?.style}{' '}
                    {divisions[onDeckBout.divisionId]?.weightClass} •{' '}
                    {onDeckBout.round.replace('_', ' ')}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-xl text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <RegionFlag
                        code={athletes[onDeckBout.redAthleteId || '']?.regionCode}
                        regionName={athletes[onDeckBout.redAthleteId || '']?.region}
                        size="xs"
                      />
                      <span className="font-bold text-red-300 truncate">
                        {athletes[onDeckBout.redAthleteId || '']?.name || 'RED'}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {athletes[onDeckBout.redAthleteId || '']?.regionCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-xl text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <RegionFlag
                        code={athletes[onDeckBout.blueAthleteId || '']?.regionCode}
                        regionName={athletes[onDeckBout.blueAthleteId || '']?.region}
                        size="xs"
                      />
                      <span className="font-bold text-blue-300 truncate">
                        {athletes[onDeckBout.blueAthleteId || '']?.name || 'BLUE'}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {athletes[onDeckBout.blueAthleteId || '']?.regionCode}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleLoad(onDeckBout.id)}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950 transition cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Load ke Matras Sekarang (1 Klik)</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-xs text-slate-500">
                Belum ada partai On Deck di {activeMat}.
              </div>
            )}
          </div>

          {/* Section 3: Antrean Selanjutnya (SCHEDULED) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Antrean Selanjutnya ({upcomingScheduled.length})</span>
              </div>
            </div>

            {upcomingScheduled.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-xs text-slate-500">
                Tidak ada partai terjadwal berikutnya di {activeMat}.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {upcomingScheduled.map((bout) => {
                  const redAth = bout.redAthleteId ? athletes[bout.redAthleteId] : null;
                  const blueAth = bout.blueAthleteId ? athletes[bout.blueAthleteId] : null;
                  const div = divisions[bout.divisionId];

                  return (
                    <div
                      key={bout.id}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-400">
                            #{bout.boutNumber || '-'}
                          </span>
                          <span className="font-semibold text-slate-400 text-[10px]">
                            {div ? `${div.style} ${div.weightClass}` : ''} •{' '}
                            {bout.round.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-white font-bold mt-1 flex items-center gap-1.5 min-w-0">
                          {redAth && (
                            <RegionFlag
                              code={redAth.regionCode}
                              regionName={redAth.region}
                              size="xs"
                            />
                          )}
                          <span className="truncate">
                            {redAth ? redAth.name : 'TBD'}
                          </span>
                          <span className="text-slate-500 font-normal shrink-0">
                            vs
                          </span>
                          {blueAth && (
                            <RegionFlag
                              code={blueAth.regionCode}
                              regionName={blueAth.region}
                              size="xs"
                            />
                          )}
                          <span className="truncate">
                            {blueAth ? blueAth.name : 'TBD'}
                          </span>
                        </div>
                      </div>

                      {bout.redAthleteId && bout.blueAthleteId && (
                        <button
                          type="button"
                          onClick={() => handleLoad(bout.id)}
                          className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] shrink-0 transition cursor-pointer"
                        >
                          Load
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
