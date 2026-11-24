import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Trophy,
  Maximize,
  Minimize,
  Radio,
  Tv,
} from 'lucide-react';
import { useTournamentStore } from '../store/useTournamentStore';
import { useMatchStore } from '../store/useMatchStore';
import { syncChannel } from '../store/syncChannel';
import {
  joinScheduleSocketRoom,
  subscribeSocketMatchState,
  subscribeSocketSchedule,
} from '../store/socketClient';
import {
  ActiveMatSnapshot,
  UpcomingBoutSnapshot,
  TournamentBout,
} from '../types/tournament';
import LiveMatCard from '../components/schedule/LiveMatCard';
import UpcomingBoutTable from '../components/schedule/UpcomingBoutTable';

export default function ScheduleDisplayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedMatQuery = searchParams.get('mat') || 'ALL';

  const bouts = useTournamentStore((s) => s.bouts);
  const orderOfBouts = useTournamentStore((s) => s.orderOfBouts);
  const divisions = useTournamentStore((s) => s.divisions);
  const athletes = useTournamentStore((s) => s.athletes);
  const loadFromIndexedDB = useTournamentStore((s) => s.loadFromIndexedDB);

  const match = useMatchStore((s) => s.match);

  const [currentTime, setCurrentTime] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    loadFromIndexedDB();
  }, [loadFromIndexedDB]);

  // Digital Wall Clock Ticker
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(
        d.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen to syncChannel & Socket.IO updates
  useEffect(() => {
    joinScheduleSocketRoom();

    const unsubscribeChannel = syncChannel.subscribe((msg) => {
      if (msg.type === 'STATE_UPDATE') {
        useMatchStore.getState().setMatchState(msg.payload);
      }
    });

    const unsubscribeSocketMatch = subscribeSocketMatchState((state) => {
      useMatchStore.getState().setMatchState(state);
    });

    const unsubscribeSocketSchedule = subscribeSocketSchedule(() => {
      loadFromIndexedDB();
    });

    return () => {
      unsubscribeChannel();
      unsubscribeSocketMatch();
      unsubscribeSocketSchedule();
    };
  }, [loadFromIndexedDB]);

  // Auto-hide floating controls and cursor after 3 seconds of inactivity
  useEffect(() => {
    const resetTimer = () => {
      setShowControls(true);
      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('mousedown', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    resetTimer();

    return () => {
      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current);
      }
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('mousedown', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Daftar seluruh matras yang tersedia
  const allMats = ['MAT A', 'MAT B', 'MAT C', 'MAT D'];
  const activeMatFilter = selectedMatQuery.toUpperCase();

  const matsToDisplay = useMemo(() => {
    if (activeMatFilter !== 'ALL' && allMats.includes(activeMatFilter)) {
      return [activeMatFilter];
    }
    return ['MAT A', 'MAT B']; // Default 2 matras utama jika ALL
  }, [activeMatFilter]);

  // Bangun Live Snapshots untuk setiap matras
  const liveSnapshotsByMat = useMemo(() => {
    const map = new Map<string, ActiveMatSnapshot | null>();

    matsToDisplay.forEach((matName) => {
      // 1. Cek apakah useMatchStore saat ini sedang memegang matras ini
      if (match.metadata.matName === matName && match.activeBoutId) {
        const divLabel = `${match.metadata.style} • ${match.metadata.weightClass}`;
        const boutNum = parseInt(match.metadata.boutNumber.replace(/\D/g, ''), 10) || null;

        const periodLabel =
          match.phase === 'PERIOD_1'
            ? 'P1'
            : match.phase === 'PERIOD_2'
            ? 'P2'
            : match.phase === 'BREAK'
            ? 'BREAK'
            : match.phase === 'FINISHED'
            ? 'FINAL'
            : 'READY';

        map.set(matName, {
          matName,
          boutNumber: boutNum,
          divisionLabel: divLabel,
          redName: match.red.name,
          redRegion: match.red.countryOrTeam,
          redScore: match.red.score,
          blueName: match.blue.name,
          blueRegion: match.blue.countryOrTeam,
          blueScore: match.blue.score,
          periodLabel,
          remainingMs: match.mainClock.remainingMs,
          isRunning: match.mainClock.isRunning,
          lastSyncedAt: match.mainClock.lastSyncedAt,
        });
        return;
      }

      // 2. Jika tidak ada di useMatchStore, cek dari bouts di tournament store yang IN_PROGRESS
      const inProgBout = Object.values(bouts).find(
        (b) => (b.matName || 'MAT A') === matName && b.status === 'IN_PROGRESS'
      );

      if (inProgBout) {
        const div = divisions[inProgBout.divisionId];
        const red = inProgBout.redAthleteId ? athletes[inProgBout.redAthleteId] : null;
        const blue = inProgBout.blueAthleteId ? athletes[inProgBout.blueAthleteId] : null;

        map.set(matName, {
          matName,
          boutNumber: inProgBout.boutNumber,
          divisionLabel: `${div?.style || ''} • ${div?.weightClass || ''} • ${inProgBout.round.replace('_', ' ')}`,
          redName: red?.name || 'RED',
          redRegion: red?.regionCode || 'RED',
          redScore: inProgBout.result?.redScore || 0,
          blueName: blue?.name || 'BLUE',
          blueRegion: blue?.regionCode || 'BLUE',
          blueScore: inProgBout.result?.blueScore || 0,
          periodLabel: 'LIVE',
          remainingMs: 180_000,
          isRunning: false,
          lastSyncedAt: null,
        });
      } else {
        map.set(matName, null);
      }
    });

    return map;
  }, [matsToDisplay, match, bouts, divisions, athletes]);

  // Bangun antrean Upcoming Bouts (ON_DECK, IN_THE_HOLE, UPCOMING)
  const upcomingBoutList: UpcomingBoutSnapshot[] = useMemo(() => {
    // Ambil semua bout dari master order
    const ordered = (
      orderOfBouts.length > 0
        ? orderOfBouts.map((id) => bouts[id]).filter((b): b is TournamentBout => Boolean(b))
        : Object.values(bouts)
    ).filter((b) => {
      if (b.status === 'COMPLETED' || b.status === 'IN_PROGRESS') return false;
      if (activeMatFilter !== 'ALL' && (b.matName || 'MAT A') !== activeMatFilter) {
        return false;
      }
      return true;
    });

    return ordered.map((b, idx) => {
      const div = divisions[b.divisionId];
      const red = b.redAthleteId ? athletes[b.redAthleteId] : null;
      const blue = b.blueAthleteId ? athletes[b.blueAthleteId] : null;

      let queueBadge: 'ON_DECK' | 'IN_THE_HOLE' | 'UPCOMING' = 'UPCOMING';
      if (idx === 0 || b.status === 'ON_DECK') {
        queueBadge = 'ON_DECK';
      } else if (idx === 1) {
        queueBadge = 'IN_THE_HOLE';
      }

      return {
        id: b.id,
        matName: b.matName || 'MAT A',
        boutNumber: b.boutNumber,
        divisionLabel: `${div?.style || ''} ${div?.weightClass || ''}`,
        roundLabel: b.round.replace('_', ' '),
        redName: red?.name || b.redSourceLabel || 'TBD',
        redRegion: red?.regionCode || 'RED',
        blueName: blue?.name || b.blueSourceLabel || 'TBD',
        blueRegion: blue?.regionCode || 'BLUE',
        queueBadge,
      };
    });
  }, [orderOfBouts, bouts, divisions, athletes, activeMatFilter]);

  return (
    <div
      className={`h-screen w-screen overflow-hidden bg-slate-950 text-white select-none flex flex-col justify-between font-sans ${
        !showControls ? 'cursor-none' : ''
      }`}
    >
      {/* Top Header Bar */}
      <header className="h-[9vh] min-h-[60px] px-6 bg-slate-900 border-b-2 border-slate-800 flex items-center justify-between shadow-2xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base md:text-xl font-black uppercase tracking-wider text-white">
              Official Olympic Wrestling Live Schedule
            </h1>
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
              UNITED WORLD WRESTLING • JADWAL &amp; ANTREAN MATRAS LIVE
            </p>
          </div>
        </div>

        {/* Center/Right Clock & Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 font-mono font-black text-xl text-amber-400 tabular-nums shadow-inner">
            <span>{currentTime}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 text-xs font-black uppercase tracking-wider">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>LIVE SYNC</span>
          </div>
        </div>
      </header>

      {/* Main Body: Zona Atas (On Mat) & Zona Bawah (Upcoming) */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto px-6 py-4 flex flex-col gap-4 overflow-hidden justify-between">
        {/* Zona Atas: Kartu Sedang Bertanding (ON MAT) */}
        <section className="space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-xs md:text-sm font-black uppercase tracking-widest text-emerald-400">
                Sedang Bertanding • On Mat Live
              </h2>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              Menampilkan {matsToDisplay.length} Matras
            </span>
          </div>

          <div
            className={`grid gap-4 ${
              matsToDisplay.length === 1
                ? 'grid-cols-1'
                : 'grid-cols-1 lg:grid-cols-2'
            }`}
          >
            {matsToDisplay.map((mat) => (
              <LiveMatCard
                key={mat}
                matName={mat}
                snapshot={liveSnapshotsByMat.get(mat)}
              />
            ))}
          </div>
        </section>

        {/* Zona Bawah: Pertandingan Selanjutnya (UPCOMING BOUTS) */}
        <section className="flex-1 flex flex-col min-h-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-sky-400" />
              <h2 className="text-xs md:text-sm font-black uppercase tracking-widest text-sky-400">
                Pertandingan Selanjutnya • Next Up
              </h2>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              Atlet On Deck wajib bersiap di pinggir matras
            </span>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <UpcomingBoutTable bouts={upcomingBoutList} />
          </div>
        </section>
      </main>

      {/* Floating UX Controls (Pojok Kanan Bawah, Auto-hide setelah 3 detik) */}
      <div
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Matras Switcher Pills */}
        <div className="flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-700 rounded-2xl backdrop-blur-md shadow-xl text-xs font-bold">
          {['ALL', 'MAT A', 'MAT B', 'MAT C'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (m === 'ALL') {
                  searchParams.delete('mat');
                  setSearchParams(searchParams);
                } else {
                  setSearchParams({ mat: m });
                }
              }}
              className={`px-3 py-1 rounded-xl transition cursor-pointer ${
                activeMatFilter === m
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Fullscreen Toggle */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white backdrop-blur-md transition shadow-xl cursor-pointer"
          title={isFullscreen ? 'Keluar Fullscreen (Esc)' : 'Layar Penuh (Fullscreen)'}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
