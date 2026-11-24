import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

describe('Phase 4: Keyboard Shortcuts for Operator', () => {
  const callbacks = {
    onStartPause: vi.fn(),
    onRedPoint: vi.fn(),
    onBluePoint: vi.fn(),
    onRedPassivity: vi.fn(),
    onBluePassivity: vi.fn(),
    onUndo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fireKeyDown = (
    code: string,
    modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
    targetTag?: string
  ) => {
    let targetElement: HTMLElement | undefined;
    if (targetTag) {
      targetElement = document.createElement(targetTag);
      document.body.appendChild(targetElement);
    }

    const event = new KeyboardEvent('keydown', {
      code,
      key: code.startsWith('Key') ? code.replace('Key', '').toLowerCase() : code,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });

    if (targetElement) {
      targetElement.dispatchEvent(event);
      document.body.removeChild(targetElement);
    } else {
      window.dispatchEvent(event);
    }
  };

  it('triggers onStartPause on Space', () => {
    renderHook(() => useKeyboardShortcuts({ ...callbacks }));
    fireKeyDown('Space');
    expect(callbacks.onStartPause).toHaveBeenCalledTimes(1);
  });

  it('triggers onRedPoint (+1, +2, +4, +5) on Q, W, E, R', () => {
    renderHook(() => useKeyboardShortcuts({ ...callbacks }));
    fireKeyDown('KeyQ');
    expect(callbacks.onRedPoint).toHaveBeenCalledWith(1);

    fireKeyDown('KeyW');
    expect(callbacks.onRedPoint).toHaveBeenCalledWith(2);

    fireKeyDown('KeyE');
    expect(callbacks.onRedPoint).toHaveBeenCalledWith(4);

    fireKeyDown('KeyR');
    expect(callbacks.onRedPoint).toHaveBeenCalledWith(5);
  });

  it('triggers onBluePoint (+1, +2, +4, +5) on U, I, O, P', () => {
    renderHook(() => useKeyboardShortcuts({ ...callbacks }));
    fireKeyDown('KeyU');
    expect(callbacks.onBluePoint).toHaveBeenCalledWith(1);

    fireKeyDown('KeyI');
    expect(callbacks.onBluePoint).toHaveBeenCalledWith(2);

    fireKeyDown('KeyO');
    expect(callbacks.onBluePoint).toHaveBeenCalledWith(4);

    fireKeyDown('KeyP');
    expect(callbacks.onBluePoint).toHaveBeenCalledWith(5);
  });

  it('triggers onRedPassivity on A and onBluePassivity on L', () => {
    renderHook(() => useKeyboardShortcuts({ ...callbacks }));
    fireKeyDown('KeyA');
    expect(callbacks.onRedPassivity).toHaveBeenCalledTimes(1);

    fireKeyDown('KeyL');
    expect(callbacks.onBluePassivity).toHaveBeenCalledTimes(1);
  });

  it('triggers onUndo on Ctrl+Z or Cmd+Z', () => {
    renderHook(() => useKeyboardShortcuts({ ...callbacks }));
    fireKeyDown('KeyZ', { ctrlKey: true });
    expect(callbacks.onUndo).toHaveBeenCalledTimes(1);

    fireKeyDown('KeyZ', { metaKey: true });
    expect(callbacks.onUndo).toHaveBeenCalledTimes(2);
  });

  it('does NOT trigger shortcuts when typing inside an input or textarea', () => {
    renderHook(() => useKeyboardShortcuts({ ...callbacks }));
    fireKeyDown('KeyQ', {}, 'input');
    fireKeyDown('Space', {}, 'input');
    fireKeyDown('KeyA', {}, 'textarea');

    expect(callbacks.onRedPoint).not.toHaveBeenCalled();
    expect(callbacks.onStartPause).not.toHaveBeenCalled();
    expect(callbacks.onRedPassivity).not.toHaveBeenCalled();
  });

  it('does NOT trigger shortcuts when modal is open (isModalOpen = true)', () => {
    renderHook(() => useKeyboardShortcuts({ ...callbacks, isModalOpen: true }));
    fireKeyDown('Space');
    fireKeyDown('KeyQ');
    fireKeyDown('KeyU');

    expect(callbacks.onStartPause).not.toHaveBeenCalled();
    expect(callbacks.onRedPoint).not.toHaveBeenCalled();
    expect(callbacks.onBluePoint).not.toHaveBeenCalled();
  });
});
