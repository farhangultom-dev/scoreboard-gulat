import { MatchState, SyncMessage } from '../types/match';
import { ScheduleSnapshot } from '../types/tournament';

export const CHANNEL_NAME = 'uww-wrestling-scoreboard-v1';
export const STORAGE_KEY = 'uww_match_state_v1';
export const SCHEDULE_STORAGE_KEY = 'uww_schedule_snapshot_v1';

export function loadPersistedSchedule(): ScheduleSnapshot | null {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScheduleSnapshot;
  } catch (err) {
    console.error('Failed to load persisted schedule:', err);
    return null;
  }
}

export function savePersistedSchedule(snapshot: ScheduleSnapshot): void {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.error('Failed to save schedule:', err);
  }
}

export function loadPersistedState(): MatchState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MatchState;
  } catch (err) {
    console.error('Failed to load persisted state from localStorage:', err);
    return null;
  }
}

export function savePersistedState(state: MatchState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state to localStorage:', err);
  }
}

export function isStateAcceptedByDisplay(
  currentState: MatchState,
  incomingState: MatchState
): boolean {
  // Terima jika versi lebih tinggi secara monotonik
  if (incomingState.version > currentState.version) {
    return true;
  }

  // Terima jika terjadi reset (versi reset ke 1, atau state bersih)
  if (
    incomingState.version === 1 ||
    (incomingState.events.length === 0 &&
      incomingState.red.score === 0 &&
      incomingState.blue.score === 0)
  ) {
    return true;
  }

  return false;
}

export class ScoreboardSyncChannel {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(msg: SyncMessage) => void> = new Set();
  private storageListener: ((e: StorageEvent) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
        this.notify(event.data);
      };
    }

    if (typeof window !== 'undefined') {
      this.storageListener = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY && event.newValue) {
          try {
            const parsed = JSON.parse(event.newValue) as MatchState;
            this.notify({ type: 'STATE_UPDATE', payload: parsed });
          } catch {
            // Ignore parse errors from concurrent writes
          }
        } else if (event.key === SCHEDULE_STORAGE_KEY && event.newValue) {
          try {
            const parsedSchedule = JSON.parse(event.newValue) as ScheduleSnapshot;
            this.notify({ type: 'SCHEDULE_UPDATE', payload: parsedSchedule });
          } catch {
            // Ignore parse errors from concurrent writes
          }
        }
      };
      window.addEventListener('storage', this.storageListener);
    }
  }

  public postMessage(msg: SyncMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch (err) {
        console.error('Failed to postMessage on BroadcastChannel:', err);
      }
    }
  }

  public subscribe(handler: (msg: SyncMessage) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private notify(msg: SyncMessage): void {
    this.listeners.forEach((listener) => {
      try {
        listener(msg);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    });
  }

  public close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.storageListener && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageListener);
      this.storageListener = null;
    }
    this.listeners.clear();
  }
}

export const syncChannel = new ScoreboardSyncChannel();
