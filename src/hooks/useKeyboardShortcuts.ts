import { useEffect } from 'react';
import { PointValue } from '../types/match';

interface KeyboardShortcutsOptions {
  enabled?: boolean;
  isModalOpen?: boolean;
  onStartPause: () => void;
  onRedPoint: (pts: PointValue) => void;
  onBluePoint: (pts: PointValue) => void;
  onRedPassivity: () => void;
  onBluePassivity: () => void;
  onUndo: () => void;
}

export function useKeyboardShortcuts({
  enabled = true,
  isModalOpen = false,
  onStartPause,
  onRedPoint,
  onBluePoint,
  onRedPassivity,
  onBluePassivity,
  onUndo,
}: KeyboardShortcutsOptions): void {
  useEffect(() => {
    if (!enabled || isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Wajib nonaktif otomatis saat fokus berada di input, textarea, atau select
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Undo: Ctrl+Z atau Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
        return;
      }

      // Start / Pause: Space
      if (e.code === 'Space') {
        e.preventDefault();
        onStartPause();
        return;
      }

      // Jangan proses shortcut huruf jika tombol Ctrl / Meta / Alt ditekan
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const code = e.code;

      // RED Shortcuts: Q, W, E, R (+1, +2, +4, +5) & A (Passivity)
      switch (code) {
        case 'KeyQ':
          e.preventDefault();
          onRedPoint(1);
          break;
        case 'KeyW':
          e.preventDefault();
          onRedPoint(2);
          break;
        case 'KeyE':
          e.preventDefault();
          onRedPoint(4);
          break;
        case 'KeyR':
          e.preventDefault();
          onRedPoint(5);
          break;
        case 'KeyA':
          e.preventDefault();
          onRedPassivity();
          break;

        // BLUE Shortcuts: U, I, O, P (+1, +2, +4, +5) & L (Passivity)
        case 'KeyU':
          e.preventDefault();
          onBluePoint(1);
          break;
        case 'KeyI':
          e.preventDefault();
          onBluePoint(2);
          break;
        case 'KeyO':
          e.preventDefault();
          onBluePoint(4);
          break;
        case 'KeyP':
          e.preventDefault();
          onBluePoint(5);
          break;
        case 'KeyL':
          e.preventDefault();
          onBluePassivity();
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    enabled,
    isModalOpen,
    onStartPause,
    onRedPoint,
    onBluePoint,
    onRedPassivity,
    onBluePassivity,
    onUndo,
  ]);
}
