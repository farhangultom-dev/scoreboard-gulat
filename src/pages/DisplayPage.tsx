import { useState, useEffect, useRef } from 'react';
import { useMatchStore } from '../store/useMatchStore';
import { usePrecisionTimer } from '../hooks/usePrecisionTimer';
import { audioEngine } from '../engine/audioEngine';

import StatusOverlay from '../components/display/StatusOverlay';
import PreMatchIntroView, {
  isPreMatchIntroState,
} from '../components/display/PreMatchIntroView';
import UwwLiveMatchView from '../components/display/UwwLiveMatchView';
import IntermissionView from '../components/display/IntermissionView';

import {
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';

export default function DisplayPage() {
  const match = useMatchStore((s) => s.match);
  const getTieBreaker = useMatchStore((s) => s.getTieBreaker);
  const isControllerConnected = useMatchStore((s) => s.isControllerConnected);
  const initDisplay = useMatchStore((s) => s.initDisplay);

  const {
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
  } = usePrecisionTimer({
    isMaster: false,
    showTenthsUnderTenSeconds: true,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(audioEngine.getIsMuted());
  const [showControls, setShowControls] = useState(true);
  const hideTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const cleanup = initDisplay();
    return () => cleanup();
  }, [initDisplay]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  // Auto-hide cursor & floating controls after 3 seconds of mouse inactivity
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
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleToggleMute = () => {
    const next = audioEngine.toggleMute();
    setIsMuted(next);
  };

  const isAnyMedicalRunning =
    isRedInjuryRunning ||
    isRedBloodRunning ||
    isBlueInjuryRunning ||
    isBlueBloodRunning;

  const isIntermissionActive = Boolean(match.intermission?.isActive);

  const showPreMatchIntro =
    !isIntermissionActive &&
    isPreMatchIntroState(match) &&
    !isAnyMedicalRunning;

  const tieBreaker = getTieBreaker();

  return (
    <div
      className={`h-screen w-screen overflow-hidden bg-black text-white select-none flex flex-col justify-between font-sans ${
        !showControls ? 'cursor-none' : ''
      }`}
      style={{
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div className="flex-1 w-full h-full overflow-hidden">
        {isIntermissionActive ? (
          <IntermissionView match={match} variant="tv" />
        ) : showPreMatchIntro ? (
          <PreMatchIntroView match={match} variant="tv" />
        ) : (
          <UwwLiveMatchView
            match={match}
            tieBreaker={tieBreaker}
            mainMs={mainMs}
            formattedMain={formattedMain}
            formattedBreak={formattedBreak}
            formattedActivity={formattedActivity}
            formattedRedInjury={formattedRedInjury}
            formattedRedBlood={formattedRedBlood}
            formattedBlueInjury={formattedBlueInjury}
            formattedBlueBlood={formattedBlueBlood}
            isRedInjuryRunning={isRedInjuryRunning}
            isRedBloodRunning={isRedBloodRunning}
            isBlueInjuryRunning={isBlueInjuryRunning}
            isBlueBloodRunning={isBlueBloodRunning}
            variant="tv"
          />
        )}
      </div>

      {/* Floating UX Controls (Pojok Kanan Bawah, Auto-hide setelah 3 detik) */}
      <div
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <span
          className={`px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5 shadow-lg border backdrop-blur-md ${
            isControllerConnected
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
              : 'bg-rose-950/80 text-rose-300 border-rose-700/60'
          }`}
        >
          {isControllerConnected ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-rose-400" />
          )}
          {isControllerConnected ? 'SYNCED' : 'OFFLINE'}
        </span>

        <button
          type="button"
          onClick={handleToggleMute}
          className={`p-2 rounded-xl border backdrop-blur-md transition shadow-lg cursor-pointer ${
            isMuted
              ? 'bg-rose-950/80 border-rose-700 text-rose-300'
              : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-white'
          }`}
          title={isMuted ? 'Unmute Audio TV' : 'Mute Audio TV'}
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-white backdrop-blur-md transition shadow-lg cursor-pointer"
          title={
            isFullscreen ? 'Keluar Fullscreen (Esc)' : 'Layar Penuh (Fullscreen)'
          }
        >
          {isFullscreen ? (
            <Minimize className="w-4 h-4" />
          ) : (
            <Maximize className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Overlays: BREAK, CHALLENGE, WINNER (disembunyikan saat layar Istirahat Sesi aktif) */}
      {!isIntermissionActive && <StatusOverlay />}
    </div>
  );
}
