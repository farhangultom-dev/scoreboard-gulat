import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMatchStore } from '../store/useMatchStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { audioEngine } from '../engine/audioEngine';

import MatchSetupModal from '../components/controller/MatchSetupModal';
import VictoryModal from '../components/controller/VictoryModal';
import MatchHistoryModal from '../components/controller/MatchHistoryModal';
import MatchQueueDrawer from '../components/controller/MatchQueueDrawer';
import IntermissionModal from '../components/controller/IntermissionModal';
import WrestlerControl from '../components/controller/WrestlerControl';
import ClockControls from '../components/controller/ClockControls';
import MiniPreview from '../components/controller/MiniPreview';
import EventLogPanel from '../components/controller/EventLogPanel';
import MySqlStatusBadge from '../components/common/MySqlStatusBadge';
import { useTournamentStore } from '../store/useTournamentStore';

import {
  Settings,
  Tv,
  ExternalLink,
  Volume2,
  VolumeX,
  Bell,
  HelpCircle,
  Radio,
  X,
  Keyboard,
  Trophy,
  ListOrdered,
  CalendarDays,
  Coffee,
} from 'lucide-react';

export default function ControllerPage() {
  const match = useMatchStore((s) => s.match);
  const isDisplayConnected = useMatchStore((s) => s.isDisplayConnected);
  const initController = useMatchStore((s) => s.initController);

  const toggleMainClock = useMatchStore((s) => s.toggleMainClock);
  const addPoints = useMatchStore((s) => s.addPoints);
  const addPassivity = useMatchStore((s) => s.addPassivity);
  const undoLastEvent = useMatchStore((s) => s.undoLastEvent);

  // Modal States
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isVictoryOpen, setIsVictoryOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isIntermissionOpen, setIsIntermissionOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(audioEngine.getIsMuted());

  const bouts = useTournamentStore((s) => s.bouts);
  const activeMat = useTournamentStore((s) => s.activeMat);
  const loadTournamentFromStorage = useTournamentStore((s) => s.loadFromIndexedDB);
  const remainingBoutsCount = Object.values(bouts).filter(
    (b) => (b.matName || 'MAT A') === activeMat && b.status !== 'COMPLETED'
  ).length;

  useEffect(() => {
    const cleanup = initController();
    loadTournamentFromStorage();
    audioEngine.unlockAudio();
    return () => cleanup();
  }, [initController, loadTournamentFromStorage]);

  // Keyboard Shortcuts Hook
  const anyModalOpen =
    isSetupOpen ||
    isVictoryOpen ||
    isHistoryOpen ||
    isShortcutsOpen ||
    isIntermissionOpen;
  useKeyboardShortcuts({
    enabled: true,
    isModalOpen: anyModalOpen,
    onStartPause: () => toggleMainClock(),
    onRedPoint: (pts) => addPoints('RED', pts),
    onBluePoint: (pts) => addPoints('BLUE', pts),
    onRedPassivity: () => addPassivity('RED'),
    onBluePassivity: () => addPassivity('BLUE'),
    onUndo: () => undoLastEvent(),
  });

  const openDisplayWindow = () => {
    window.open('/display', 'UWW_TV_DISPLAY', 'width=1280,height=720');
  };

  const handleToggleMute = () => {
    const next = audioEngine.toggleMute();
    setIsMuted(next);
  };

  const handleTestBuzzer = () => {
    audioEngine.unlockAudio();
    audioEngine.playPeriodEndBuzzer();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-2.5 md:p-4 font-sans select-none">
      <div className="max-w-[1500px] mx-auto space-y-3">
        {/* Top Navigation Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          {/* Left: Title, Status Badges, & Active Bout Info */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm md:text-base font-black text-white tracking-wide whitespace-nowrap">
                  UWW Scoreboard — Meja Operator
                </h1>

                {/* MySQL Local Backend Status */}
                <MySqlStatusBadge />

                {/* Display Sync Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 ${
                    isDisplayConnected
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/60'
                      : 'bg-amber-950 text-amber-400 border border-amber-700/60'
                  }`}
                >
                  <Radio className="w-3 h-3 shrink-0" />
                  <span>{isDisplayConnected ? 'Display Online' : 'Display Standby'}</span>
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium mt-0.5 flex-wrap">
                <span className="whitespace-nowrap">
                  <span className="font-bold text-slate-200">
                    {match.metadata.matName}
                  </span>{' '}
                  •{' '}
                  <span className="font-bold text-sky-400">
                    {match.metadata.boutNumber}
                  </span>{' '}
                  •{' '}
                  <span className="text-slate-300">
                    {match.metadata.style} {match.metadata.weightClass} (
                    {match.metadata.ageCategory})
                  </span>
                </span>

                {match.nextBoutPreview && (
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-700/60 max-w-[320px] truncate">
                    <span className="animate-pulse text-amber-400 shrink-0">▶ ON DECK:</span>
                    <span className="truncate">
                      {match.nextBoutPreview.boutNumber
                        ? `Bout #${match.nextBoutPreview.boutNumber} • `
                        : ''}
                      {match.nextBoutPreview.redName} vs {match.nextBoutPreview.blueName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Grouped Navigation & Action Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* Group 1: Queue, Tournament, Setup & History */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/70 border border-slate-800 shrink-0">
              <button
                id="btn-bout-queue"
                type="button"
                onClick={() => setIsQueueOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-700/60 transition cursor-pointer whitespace-nowrap shrink-0"
                title="Buka antrean partai pada matras aktif"
              >
                <ListOrdered className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Bout Queue</span>
                {remainingBoutsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-sky-500 text-slate-950">
                    {remainingBoutsCount}
                  </span>
                )}
              </button>

              <Link
                id="btn-tournament-secretariat"
                to="/tournament"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 border border-amber-700/60 transition cursor-pointer whitespace-nowrap shrink-0"
                title="Buka panel Sekretariat Turnamen & Manajemen Kategori"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Tournament</span>
              </Link>

              <button
                id="btn-match-setup"
                type="button"
                onClick={() => setIsSetupOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold hover:bg-slate-800 text-slate-200 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <Settings className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Match Setup</span>
              </button>

              <button
                id="btn-match-history"
                type="button"
                onClick={() => setIsHistoryOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold hover:bg-slate-800 text-slate-200 transition cursor-pointer whitespace-nowrap shrink-0"
                title="Lihat riwayat pertandingan & export data"
              >
                <Tv className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>History</span>
              </button>

              <button
                id="btn-topbar-intermission"
                type="button"
                onClick={() => setIsIntermissionOpen(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer whitespace-nowrap shrink-0 ${
                  match.intermission?.isActive
                    ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse shadow-sm'
                    : 'bg-amber-950/60 hover:bg-amber-900/70 text-amber-300 border-amber-700/60'
                }`}
                title="Tampilkan Layar Istirahat Sesi (misal 30 Menit) di Display TV"
              >
                <Coffee className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {match.intermission?.isActive
                    ? 'Istirahat Aktif'
                    : 'Istirahat TV'}
                </span>
              </button>
            </div>

            {/* Group 2: External TV Displays */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/70 border border-slate-800 shrink-0">
              <button
                id="btn-open-tv-display"
                type="button"
                onClick={openDisplayWindow}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-slate-800 text-slate-200 transition cursor-pointer whitespace-nowrap shrink-0"
                title="Buka jendela TV display sekunder (HDMI)"
              >
                <Tv className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Open TV</span>
                <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              <div className="h-3.5 w-px bg-slate-800" />

              <button
                id="btn-open-schedule-tv"
                type="button"
                onClick={() => window.open('/schedule', 'UWW_SCHEDULE_TV', 'width=1280,height=720')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-slate-800 text-slate-200 transition cursor-pointer whitespace-nowrap shrink-0"
                title="Buka Layar TV Jadwal & Antrean Pertandingan"
              >
                <CalendarDays className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Schedule TV</span>
                <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
            </div>

            {/* Group 3: Audio & Shortcuts */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/70 border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={handleToggleMute}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isMuted
                    ? 'bg-rose-950/80 text-rose-300'
                    : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title={isMuted ? 'Unmute Audio Buzzer' : 'Mute Audio Buzzer'}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                )}
              </button>

              <button
                type="button"
                onClick={handleTestBuzzer}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-amber-400 transition cursor-pointer"
                title="Test Bunyi Buzzer"
              >
                <Bell className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsShortcutsOpen(true)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                title="Panduan Keyboard Shortcuts"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* Main 3-Column Workspace (RED | CENTER | BLUE) */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          {/* Kiri: RED Wrestler Control (Col 1-4) */}
          <div className="lg:col-span-4 flex flex-col">
            <WrestlerControl corner="RED" />
          </div>

          {/* Tengah: ClockControls & MiniPreview (Col 5-8) */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <ClockControls onOpenVictoryModal={() => setIsVictoryOpen(true)} />
            <MiniPreview />
          </div>

          {/* Kanan: BLUE Wrestler Control (Col 9-12) */}
          <div className="lg:col-span-4 flex flex-col">
            <WrestlerControl corner="BLUE" />
          </div>
        </main>

        {/* Bottom Panel: Event Log & Undo */}
        <section>
          <EventLogPanel />
        </section>
      </div>

      {/* Modals */}
      <MatchSetupModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
      />

      <VictoryModal
        isOpen={isVictoryOpen}
        onClose={() => setIsVictoryOpen(false)}
      />

      <MatchHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />

      <IntermissionModal
        isOpen={isIntermissionOpen}
        onClose={() => setIsIntermissionOpen(false)}
      />

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      {isShortcutsOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-bold text-white">
                  Shortcut Keyboard Operator
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsShortcutsOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <span className="font-medium text-slate-300">Start / Pause Jam Utama</span>
                <kbd className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded font-mono font-bold text-emerald-400">
                  Space
                </kbd>
              </div>

              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/40 flex items-center justify-between">
                <span className="font-medium text-red-200">
                  Poin Sudut Merah (+1, +2, +4, +5)
                </span>
                <div className="flex items-center gap-1 font-mono font-bold text-red-300">
                  <kbd className="px-2 py-0.5 bg-slate-900 rounded border border-red-700">Q</kbd>
                  <kbd className="px-2 py-0.5 bg-slate-900 rounded border border-red-700">W</kbd>
                  <kbd className="px-2 py-0.5 bg-slate-900 rounded border border-red-700">E</kbd>
                  <kbd className="px-2 py-0.5 bg-slate-900 rounded border border-red-700">R</kbd>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-blue-950/40 border border-blue-800/40 flex items-center justify-between">
                <span className="font-medium text-blue-200">
                  Poin Sudut Biru (+1, +2, +4, +5)
                </span>
                <div className="flex items-center gap-1 font-mono font-bold text-blue-300">
                  <kbd className="px-2 py-0.5 bg-slate-900 rounded border border-blue-700">U</kbd>
                  <kbd className="px-2 py-0.5 bg-slate-900 rounded border border-blue-700">I</kbd>
                  <kbd className="px-2 py-0.5 bg-slate-900 rounded border border-blue-700">O</kbd>
                  <kbd className="px-2 py-0.5 bg-slate-900 rounded border border-blue-700">P</kbd>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                  <span className="font-medium text-slate-300">Passivity Merah</span>
                  <kbd className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded font-mono font-bold text-slate-200">
                    A
                  </kbd>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                  <span className="font-medium text-slate-300">Passivity Biru</span>
                  <kbd className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded font-mono font-bold text-slate-200">
                    L
                  </kbd>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <span className="font-medium text-slate-300">Undo Event Terakhir</span>
                <kbd className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded font-mono font-bold text-amber-400">
                  Ctrl + Z
                </kbd>
              </div>

              <p className="text-[11px] text-slate-500 italic pt-1 text-center">
                *Shortcut otomatis nonaktif saat mengetik pada form input atau modal dialog.
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsShortcutsOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bout Queue Drawer */}
      <MatchQueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
      />
    </div>
  );
}
