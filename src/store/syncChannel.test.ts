import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CHANNEL_NAME,
  STORAGE_KEY,
  SCHEDULE_STORAGE_KEY,
  loadPersistedState,
  savePersistedState,
  loadPersistedSchedule,
  savePersistedSchedule,
  isStateAcceptedByDisplay,
} from './syncChannel';
import { initialMatchState, useMatchStore } from './useMatchStore';
import { MatchState, SyncMessage } from '../types/match';
import { ScheduleSnapshot } from '../types/tournament';

describe('Phase 1: Dual-Screen Sync Engine & Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useMatchStore.setState({
      match: JSON.parse(JSON.stringify(initialMatchState)),
      isDisplayConnected: false,
      isControllerConnected: false,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('LocalStorage Persistence (F5 Recovery)', () => {
    it('persists match state to localStorage with exact key and structure', () => {
      const sampleState: MatchState = {
        ...initialMatchState,
        version: 5,
        red: { ...initialMatchState.red, score: 7 },
        blue: { ...initialMatchState.blue, score: 3 },
      };

      savePersistedState(sampleState);

      const loaded = loadPersistedState();
      expect(loaded).not.toBeNull();
      expect(loaded?.version).toBe(5);
      expect(loaded?.red.score).toBe(7);
      expect(loaded?.blue.score).toBe(3);
      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    });

    it('recovers last state after simulated Controller refresh (F5)', () => {
      // 1. Controller updates score
      const store = useMatchStore.getState();
      store.addScore('RED', 1);
      store.addScore('RED', 1);
      store.addScore('BLUE', 1);

      expect(useMatchStore.getState().match.red.score).toBe(2);
      expect(useMatchStore.getState().match.blue.score).toBe(1);

      // 2. Simulate browser reload (F5) - reset in-memory state, re-init controller
      useMatchStore.setState({
        match: initialMatchState,
      });
      expect(useMatchStore.getState().match.red.score).toBe(0);

      const cleanup = useMatchStore.getState().initController();
      expect(useMatchStore.getState().match.red.score).toBe(2);
      expect(useMatchStore.getState().match.blue.score).toBe(1);
      cleanup();
    });

    it('recovers last state on Display refresh (F5) without returning to 0', () => {
      // 1. Existing persisted match with score 4 - 2
      const persistedState: MatchState = {
        ...initialMatchState,
        version: 6,
        red: { ...initialMatchState.red, score: 4 },
        blue: { ...initialMatchState.blue, score: 2 },
      };
      savePersistedState(persistedState);

      // 2. Display mounts and initializes
      const cleanup = useMatchStore.getState().initDisplay();
      expect(useMatchStore.getState().match.red.score).toBe(4);
      expect(useMatchStore.getState().match.blue.score).toBe(2);
      expect(useMatchStore.getState().isControllerConnected).toBe(true);
      cleanup();
    });
  });

  describe('Display Read-Only & Monotonic Version Checks', () => {
    it('accepts higher version state update', () => {
      const current: MatchState = { ...initialMatchState, version: 2 };
      const incoming: MatchState = { ...initialMatchState, version: 3 };

      expect(isStateAcceptedByDisplay(current, incoming)).toBe(true);
    });

    it('ignores stale/out-of-order version state update', () => {
      const current: MatchState = {
        ...initialMatchState,
        version: 5,
        red: { ...initialMatchState.red, score: 6 },
      };
      const staleIncoming: MatchState = {
        ...initialMatchState,
        version: 4,
        red: { ...initialMatchState.red, score: 2 },
      };

      expect(isStateAcceptedByDisplay(current, staleIncoming)).toBe(false);
    });

    it('accepts reset state even when incoming version <= current version', () => {
      const current: MatchState = {
        ...initialMatchState,
        version: 12,
        red: { ...initialMatchState.red, score: 10 },
      };
      const resetIncoming: MatchState = {
        ...initialMatchState,
        version: 1,
        red: { ...initialMatchState.red, score: 0 },
        blue: { ...initialMatchState.blue, score: 0 },
        events: [],
      };

      expect(isStateAcceptedByDisplay(current, resetIncoming)).toBe(true);
    });
  });

  describe('BroadcastChannel Real-Time Sync & Handshake', () => {
    it('broadcasts state updates instantly (< 16ms)', async () => {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      const testState: MatchState = {
        ...initialMatchState,
        version: 8,
        red: { ...initialMatchState.red, score: 5 },
      };

      const startTime = performance.now();
      const messagePromise = new Promise<{ latency: number; data: SyncMessage }>(
        (resolve) => {
          channel.onmessage = (evt) => {
            const latency = performance.now() - startTime;
            resolve({ latency, data: evt.data });
          };
        }
      );

      // Trigger update from another BroadcastChannel (simulating Controller)
      const sender = new BroadcastChannel(CHANNEL_NAME);
      sender.postMessage({ type: 'STATE_UPDATE', payload: testState });

      const result = await messagePromise;
      expect(result.data.type).toBe('STATE_UPDATE');
      if (result.data.type === 'STATE_UPDATE') {
        expect(result.data.payload.red.score).toBe(5);
      }
      expect(result.latency).toBeLessThan(16); // < 16ms requirement

      channel.close();
      sender.close();
    });

    it('handshake: responds with currentState when REQUEST_STATE is received', async () => {
      const cleanup = useMatchStore.getState().initController();
      useMatchStore.getState().addScore('RED', 1);

      const clientChannel = new BroadcastChannel(CHANNEL_NAME);
      const responsePromise = new Promise<SyncMessage>((resolve) => {
        clientChannel.onmessage = (evt) => {
          if (evt.data.type === 'STATE_UPDATE') {
            resolve(evt.data);
          }
        };
      });

      clientChannel.postMessage({ type: 'REQUEST_STATE' });

      const response = await responsePromise;
      expect(response.type).toBe('STATE_UPDATE');
      if (response.type === 'STATE_UPDATE') {
        expect(response.payload.red.score).toBe(1);
      }

      clientChannel.close();
      cleanup();
    });
  });

  describe('Phase 11: Schedule Snapshot & SCHEDULE_UPDATE Sync', () => {
    it('persists and loads schedule snapshot to/from localStorage', () => {
      const mockSnapshot: ScheduleSnapshot = {
        updatedAt: Date.now(),
        activeMats: [
          {
            matName: 'MAT A',
            boutNumber: 10,
            divisionLabel: 'FS • 74 KG • SENIOR',
            redName: 'EKO',
            redRegion: 'INA',
            redScore: 4,
            blueName: 'KEN',
            blueRegion: 'JPN',
            blueScore: 2,
            periodLabel: 'P1',
            remainingMs: 105000,
            isRunning: true,
            lastSyncedAt: Date.now(),
          },
        ],
        upcomingBouts: [
          {
            id: 'bout-11',
            matName: 'MAT A',
            boutNumber: 11,
            divisionLabel: 'FS • 74 KG • SENIOR',
            roundLabel: 'SEMI FINAL',
            redName: 'AHMAD',
            redRegion: 'LPG',
            blueName: 'RIZKY',
            blueRegion: 'JBR',
            queueBadge: 'ON_DECK',
          },
        ],
      };

      savePersistedSchedule(mockSnapshot);
      const loaded = loadPersistedSchedule();
      expect(loaded).not.toBeNull();
      expect(loaded?.activeMats.length).toBe(1);
      expect(loaded?.activeMats[0].matName).toBe('MAT A');
      expect(loaded?.activeMats[0].redName).toBe('EKO');
      expect(loaded?.upcomingBouts[0].queueBadge).toBe('ON_DECK');
      expect(localStorage.getItem(SCHEDULE_STORAGE_KEY)).toBeTruthy();
    });

    it('broadcasts and receives SCHEDULE_UPDATE message across channels', async () => {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      const mockSchedule: ScheduleSnapshot = {
        updatedAt: 123456789,
        activeMats: [],
        upcomingBouts: [],
      };

      const messagePromise = new Promise<SyncMessage>((resolve) => {
        channel.onmessage = (evt) => {
          if (evt.data.type === 'SCHEDULE_UPDATE') {
            resolve(evt.data);
          }
        };
      });

      const sender = new BroadcastChannel(CHANNEL_NAME);
      sender.postMessage({
        type: 'SCHEDULE_UPDATE',
        payload: mockSchedule,
      });

      const received = await messagePromise;
      expect(received.type).toBe('SCHEDULE_UPDATE');
      if (received.type === 'SCHEDULE_UPDATE') {
        expect(received.payload.updatedAt).toBe(123456789);
      }

      channel.close();
      sender.close();
    });

    it('clears activeChallengeCorner permanently when challenge is cancelled (Batal) across F5 reload', () => {
      const store = useMatchStore.getState();
      store.openChallenge('RED');
      expect(useMatchStore.getState().match.activeChallengeCorner).toBe('RED');

      store.resolveChallenge('CANCEL');
      expect(useMatchStore.getState().match.activeChallengeCorner).toBeNull();
      expect(useMatchStore.getState().match.red.hasChallenge).toBe(true);
      expect(useMatchStore.getState().match.blue.score).toBe(0);

      // Simulasi refresh browser (F5)
      useMatchStore.setState({ match: initialMatchState });
      const cleanup = useMatchStore.getState().initController();
      expect(useMatchStore.getState().match.activeChallengeCorner).toBeNull();
      cleanup();
    });

    it('restores hasChallenge and reverts penalty point when undoing CHALLENGE_LOST_POINT', () => {
      const store = useMatchStore.getState();
      store.openChallenge('RED');
      store.resolveChallenge('LOST');

      expect(useMatchStore.getState().match.red.hasChallenge).toBe(false);
      expect(useMatchStore.getState().match.blue.score).toBe(1);
      expect(useMatchStore.getState().match.events).toHaveLength(1);

      useMatchStore.getState().undoLastEvent();

      expect(useMatchStore.getState().match.red.hasChallenge).toBe(true);
      expect(useMatchStore.getState().match.blue.score).toBe(0);
      expect(useMatchStore.getState().match.events).toHaveLength(0);
    });
  });
});
