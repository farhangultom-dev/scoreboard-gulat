import { create } from 'zustand';
import {
  MatchState,
  Corner,
  PointValue,
  MatchEvent,
  MatchEventType,
  MatchMetadata,
  MatchPhase,
  WrestlerState,
  VictoryType,
  SyncMessage,
  WrestlingStyle,
  AgeCategory,
  IntermissionState,
} from '../types/match';
import {
  loadPersistedState,
  savePersistedState,
  syncChannel,
  isStateAcceptedByDisplay,
} from './syncChannel';
import {
  recalculateStatsFromEvents,
  evaluateTieBreaker,
  checkTechnicalSuperiority,
  checkDisqualification,
  suggestEndOfMatchVictory,
  getPeriodDurationMs,
  TieBreakerResult,
  TechSuperiorityResult,
  DisqualificationResult,
  EndOfMatchVictoryResult,
} from '../engine/uwwRules';
import { computeRemainingMs } from '../engine/timerEngine';
import { audioEngine } from '../engine/audioEngine';
import { saveMatchToHistory } from '../engine/historyEngine';
import {
  completeBoutApi,
  recordBoutEventApi,
  undoBoutEventApi,
  updateBoutClockApi,
  updateBoutSessionDetailsApi,
} from '../api/client';
import {
  emitMatIntermission,
  joinMatSocketRoom,
  subscribeSocketBuzzer,
  subscribeSocketIntermission,
  subscribeSocketMatchState,
} from './socketClient';

const isVitest = Boolean(
  (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITEST
);

export const initialMatchState: MatchState = {
  version: 1,
  metadata: {
    matName: 'MAT A',
    boutNumber: 'BOUT 14',
    style: 'FS',
    ageCategory: 'SENIOR',
    weightClass: '74 KG',
  },
  phase: 'PRE_MATCH',
  mainClock: {
    remainingMs: 180_000,
    isRunning: false,
    lastSyncedAt: null,
  },
  breakClock: {
    remainingMs: 30_000,
    isRunning: false,
    lastSyncedAt: null,
  },
  activityClock: {
    remainingMs: 30_000,
    isRunning: false,
    lastSyncedAt: null,
    activeCorner: null,
  },
  red: {
    name: 'RED WRESTLER',
    countryOrTeam: 'INA',
    score: 0,
    cautions: 0,
    passivityCount: 0,
    hasChallenge: true,
    injuryTimer: {
      remainingMs: 120_000,
      isRunning: false,
      lastSyncedAt: null,
    },
    bloodTimer: {
      remainingMs: 240_000,
      isRunning: false,
      lastSyncedAt: null,
    },
  },
  blue: {
    name: 'BLUE WRESTLER',
    countryOrTeam: 'JPN',
    score: 0,
    cautions: 0,
    passivityCount: 0,
    hasChallenge: true,
    injuryTimer: {
      remainingMs: 120_000,
      isRunning: false,
      lastSyncedAt: null,
    },
    bloodTimer: {
      remainingMs: 240_000,
      isRunning: false,
      lastSyncedAt: null,
    },
  },
  events: [],
  activeChallengeCorner: null,
  winner: null,
  activeBoutId: null,
  intermission: null,
  nextBoutPreview: null,
};

function helperIncrementBout(boutStr: string): string {
  const match = boutStr.match(/^(.*?)(\d+)(.*?)$/);
  if (!match) return boutStr;
  const num = parseInt(match[2], 10) + 1;
  return `${match[1]}${num}${match[3]}`;
}

interface MatchStore {
  match: MatchState;
  isDisplayConnected: boolean;
  isControllerConnected: boolean;

  // Metadata & Wrestlers
  updateMetadata: (metadata: Partial<MatchMetadata>) => void;
  updateWrestlers: (
    redInfo?: Partial<WrestlerState>,
    blueInfo?: Partial<WrestlerState>
  ) => void;

  // Actions Peraturan UWW (Phase 2)
  addPoints: (
    corner: Corner,
    points: PointValue,
    type?: MatchEventType,
    note?: string
  ) => void;
  addScore: (corner: Corner, points: PointValue) => void;
  addCaution: (penalizedCorner: Corner, opponentPoints?: 0 | 1 | 2) => void;
  addPassivity: (penalizedCorner: Corner) => void;
  startActivityClock: (corner: Corner) => void;
  cancelActivityClock: () => void;
  openChallenge: (corner: Corner) => void;
  resolveChallenge: (outcome: 'WON' | 'LOST' | 'CANCEL') => void;
  undoLastEvent: () => void;
  declareWinner: (corner: Corner, type: VictoryType) => void;
  clearWinner: () => void;
  resetMatch: (options?: { keepMetadata?: boolean; incrementBout?: boolean }) => void;
  saveAndNextBout: () => void;
  loadBoutData: (params: {
    boutId: string;
    matName: string;
    boutNumber: string;
    style: WrestlingStyle;
    ageCategory: AgeCategory;
    weightClass: string;
    round?: string;
    redName: string;
    redRegion: string;
    blueName: string;
    blueRegion: string;
    nextBoutPreview?: {
      boutNumber: number | null;
      divisionLabel: string;
      redName: string;
      redRegion: string;
      blueName: string;
      blueRegion: string;
    } | null;
  }) => void;
  setMatchState: (state: MatchState) => void;

  // Actions Kontrol Waktu (Phase 3)
  toggleMainClock: () => void;
  adjustMainClock: (deltaMs: number) => void;
  setMainClock: (ms: number) => void;
  toggleBreakClock: () => void;
  switchPhase: (phase: MatchPhase) => void;
  toggleMedicalTimer: (corner: Corner, kind: 'injury' | 'blood') => void;

  // Mode Istirahat Sesi / Intermission TV
  startIntermission: (options: {
    durationMs: number;
    title?: string;
    subtitle?: string;
    autoStart?: boolean;
  }) => void;
  toggleIntermissionClock: () => void;
  adjustIntermissionClock: (deltaMs: number) => void;
  stopIntermission: () => void;

  // Handler Transisi Waktu Master (/controller)
  handleMainClockExpired: () => void;
  handleBreakClockExpired: () => void;
  handleActivityClockExpired: () => void;

  // Pure Queries & Selectors
  getTieBreaker: () => TieBreakerResult;
  getTechSuperiority: () => TechSuperiorityResult;
  getDisqualification: () => DisqualificationResult;
  getSuggestedVictory: () => EndOfMatchVictoryResult | null;

  // Sync Lifecycles
  initController: () => () => void;
  initDisplay: () => () => void;
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  match: loadPersistedState() ?? initialMatchState,
  isDisplayConnected: false,
  isControllerConnected: false,

  updateMetadata: (metadata) => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        metadata: { ...state.match.metadata, ...metadata },
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      if (!isVitest && metadata.matName) {
        joinMatSocketRoom(metadata.matName);
      }
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutSessionDetailsApi(activeBoutId, {
        metadata: {
          ...(metadata.matName !== undefined ? { matName: metadata.matName } : {}),
          ...(metadata.boutNumber !== undefined ? { boutNumber: metadata.boutNumber } : {}),
          ...(metadata.style !== undefined ? { style: metadata.style } : {}),
          ...(metadata.ageCategory !== undefined ? { ageCategory: metadata.ageCategory } : {}),
          ...(metadata.weightClass !== undefined ? { weightClass: metadata.weightClass } : {}),
        },
      }).catch(() => {});
    }
  },

  updateWrestlers: (redInfo, blueInfo) => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        red: redInfo ? { ...state.match.red, ...redInfo } : state.match.red,
        blue: blueInfo ? { ...state.match.blue, ...blueInfo } : state.match.blue,
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutSessionDetailsApi(activeBoutId, {
        ...(redInfo
          ? {
              red: {
                ...(redInfo.name !== undefined ? { name: redInfo.name } : {}),
                ...(redInfo.countryOrTeam !== undefined
                  ? { countryOrTeam: redInfo.countryOrTeam }
                  : {}),
              },
            }
          : {}),
        ...(blueInfo
          ? {
              blue: {
                ...(blueInfo.name !== undefined ? { name: blueInfo.name } : {}),
                ...(blueInfo.countryOrTeam !== undefined
                  ? { countryOrTeam: blueInfo.countryOrTeam }
                  : {}),
              },
            }
          : {}),
      }).catch(() => {});
    }
  },

  addPoints: (corner, points, type = 'POINT', note) => {
    const activeBoutId = get().match.activeBoutId;
    const currentPeriod = get().match.phase === 'PERIOD_2' ? 2 : 1;
    const matchClockMs = computeRemainingMs(get().match.mainClock);

    set((state) => {
      const newEvent: MatchEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        period: currentPeriod,
        matchClockMs,
        corner,
        type,
        points,
        note,
      };

      const newEvents = [...state.match.events, newEvent];
      const redStats = recalculateStatsFromEvents(newEvents, 'RED');
      const blueStats = recalculateStatsFromEvents(newEvents, 'BLUE');

      const updatedActivityClock = {
        ...state.match.activityClock,
        remainingMs: 30_000,
        isRunning: false,
        lastSyncedAt: null,
        activeCorner: null,
      };

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        red: {
          ...state.match.red,
          score: redStats.score,
          cautions: redStats.cautions,
          passivityCount: redStats.passivityCount,
        },
        blue: {
          ...state.match.blue,
          score: blueStats.score,
          cautions: blueStats.cautions,
          passivityCount: blueStats.passivityCount,
        },
        activityClock: updatedActivityClock,
        events: newEvents,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      recordBoutEventApi(activeBoutId, {
        corner,
        type,
        points,
        period: currentPeriod,
        matchClockMs,
        note,
      }).catch(() => {});
    }
  },

  addScore: (corner, points) => {
    get().addPoints(corner, points);
  },

  addCaution: (penalizedCorner, opponentPoints = 0) => {
    const activeBoutId = get().match.activeBoutId;
    const currentPeriod = get().match.phase === 'PERIOD_2' ? 2 : 1;
    const matchClockMs = computeRemainingMs(get().match.mainClock);

    set((state) => {
      const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const opponentCorner: Corner = penalizedCorner === 'RED' ? 'BLUE' : 'RED';

      const cautionEvent: MatchEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        period: currentPeriod,
        matchClockMs,
        corner: penalizedCorner,
        type: 'CAUTION',
        points: 0,
        groupId,
      };

      const newEvents = [...state.match.events, cautionEvent];

      if (opponentPoints > 0) {
        const pointEvent: MatchEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          period: currentPeriod,
          matchClockMs,
          corner: opponentCorner,
          type: 'POINT',
          points: opponentPoints,
          groupId,
        };
        newEvents.push(pointEvent);
      }

      const redStats = recalculateStatsFromEvents(newEvents, 'RED');
      const blueStats = recalculateStatsFromEvents(newEvents, 'BLUE');

      const updatedActivityClock =
        opponentPoints > 0
          ? {
              ...state.match.activityClock,
              remainingMs: 30_000,
              isRunning: false,
              lastSyncedAt: null,
              activeCorner: null,
            }
          : state.match.activityClock;

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        red: {
          ...state.match.red,
          score: redStats.score,
          cautions: redStats.cautions,
          passivityCount: redStats.passivityCount,
        },
        blue: {
          ...state.match.blue,
          score: blueStats.score,
          cautions: blueStats.cautions,
          passivityCount: blueStats.passivityCount,
        },
        activityClock: updatedActivityClock,
        events: newEvents,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      recordBoutEventApi(activeBoutId, {
        corner: penalizedCorner,
        type: 'CAUTION',
        points: 0,
        opponentPoints,
        period: currentPeriod,
        matchClockMs,
      }).catch(() => {});
    }
  },

  addPassivity: (penalizedCorner) => {
    const activeBoutId = get().match.activeBoutId;
    const currentPeriod = get().match.phase === 'PERIOD_2' ? 2 : 1;
    const matchClockMs = computeRemainingMs(get().match.mainClock);
    const isGrecoRoman = get().match.metadata.style === 'GR';
    const opponentCorner: Corner = penalizedCorner === 'RED' ? 'BLUE' : 'RED';
    let startedActivity = false;

    set((state) => {
      const passivityEvent: MatchEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        period: currentPeriod,
        matchClockMs,
        corner: penalizedCorner,
        type: 'PASSIVITY',
        points: 0,
      };

      let newEvents = [...state.match.events, passivityEvent];
      let updatedActivityClock = state.match.activityClock;

      if (isGrecoRoman) {
        const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        passivityEvent.groupId = groupId;

        const opponentPointEvent: MatchEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          period: currentPeriod,
          matchClockMs,
          corner: opponentCorner,
          type: 'POINT',
          points: 1,
          groupId,
        };
        newEvents = [...state.match.events, passivityEvent, opponentPointEvent];
      } else {
        const prevPassivity =
          penalizedCorner === 'RED'
            ? state.match.red.passivityCount
            : state.match.blue.passivityCount;

        if (prevPassivity + 1 >= 2 && state.match.activityClock.activeCorner === null) {
          startedActivity = true;
          updatedActivityClock = {
            remainingMs: 30_000,
            isRunning: state.match.mainClock.isRunning,
            lastSyncedAt: state.match.mainClock.isRunning ? Date.now() : null,
            activeCorner: penalizedCorner,
          };
        }
      }

      const redStats = recalculateStatsFromEvents(newEvents, 'RED');
      const blueStats = recalculateStatsFromEvents(newEvents, 'BLUE');

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        red: {
          ...state.match.red,
          score: redStats.score,
          cautions: redStats.cautions,
          passivityCount: redStats.passivityCount,
        },
        blue: {
          ...state.match.blue,
          score: blueStats.score,
          cautions: blueStats.cautions,
          passivityCount: blueStats.passivityCount,
        },
        activityClock: updatedActivityClock,
        events: newEvents,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      recordBoutEventApi(activeBoutId, {
        corner: penalizedCorner,
        type: 'PASSIVITY',
        points: 0,
        period: currentPeriod,
        matchClockMs,
      })
        .then(() => {
          if (isGrecoRoman) {
            return recordBoutEventApi(activeBoutId, {
              corner: opponentCorner,
              type: 'POINT',
              points: 1,
              period: currentPeriod,
              matchClockMs,
            });
          } else if (startedActivity) {
            return updateBoutClockApi(activeBoutId, {
              action: 'START_ACTIVITY',
              corner: penalizedCorner,
            });
          }
        })
        .catch(() => {});
    }
  },

  startActivityClock: (corner) => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        activityClock: {
          remainingMs: 30_000,
          isRunning: state.match.mainClock.isRunning,
          lastSyncedAt: state.match.mainClock.isRunning ? Date.now() : null,
          activeCorner: corner,
        },
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, { action: 'START_ACTIVITY', corner }).catch(
        () => {}
      );
    }
  },

  cancelActivityClock: () => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        activityClock: {
          remainingMs: 30_000,
          isRunning: false,
          lastSyncedAt: null,
          activeCorner: null,
        },
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, { action: 'CANCEL_ACTIVITY' }).catch(() => {});
    }
  },

  openChallenge: (corner) => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      const pausedMainRemaining = computeRemainingMs(state.match.mainClock);
      const pausedActivityRemaining = computeRemainingMs(state.match.activityClock);
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        mainClock: {
          remainingMs: pausedMainRemaining,
          isRunning: false,
          lastSyncedAt: null,
        },
        activityClock: state.match.activityClock.isRunning
          ? {
              ...state.match.activityClock,
              remainingMs: pausedActivityRemaining,
              isRunning: false,
              lastSyncedAt: null,
            }
          : state.match.activityClock,
        activeChallengeCorner: corner,
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, { action: 'OPEN_CHALLENGE', corner }).catch(
        () => {}
      );
    }
  },

  resolveChallenge: (outcome) => {
    const activeBoutId = get().match.activeBoutId;
    const challengingCorner = get().match.activeChallengeCorner;
    if (!challengingCorner) return;

    set((state) => {
      let newEvents = [...state.match.events];
      let redChallenge = state.match.red.hasChallenge;
      let blueChallenge = state.match.blue.hasChallenge;

      if (outcome === 'LOST') {
        const opponent: Corner = challengingCorner === 'RED' ? 'BLUE' : 'RED';
        if (challengingCorner === 'RED') {
          redChallenge = false;
        } else {
          blueChallenge = false;
        }

        const currentPeriod = state.match.phase === 'PERIOD_2' ? 2 : 1;
        const lostEvent: MatchEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          period: currentPeriod,
          matchClockMs: computeRemainingMs(state.match.mainClock),
          corner: opponent,
          type: 'CHALLENGE_LOST_POINT',
          points: 1,
        };
        newEvents.push(lostEvent);
      }

      const redStats = recalculateStatsFromEvents(newEvents, 'RED');
      const blueStats = recalculateStatsFromEvents(newEvents, 'BLUE');

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        activeChallengeCorner: null,
        red: {
          ...state.match.red,
          score: redStats.score,
          cautions: redStats.cautions,
          passivityCount: redStats.passivityCount,
          hasChallenge: redChallenge,
        },
        blue: {
          ...state.match.blue,
          score: blueStats.score,
          cautions: blueStats.cautions,
          passivityCount: blueStats.passivityCount,
          hasChallenge: blueChallenge,
        },
        events: newEvents,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, {
        action: 'RESOLVE_CHALLENGE',
        corner: challengingCorner,
        won: outcome !== 'LOST',
        outcome,
      }).catch(() => {});
    }
  },

  undoLastEvent: () => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      if (state.match.events.length === 0) return state;

      const events = [...state.match.events];
      const lastEvent = events[events.length - 1];

      let undoneEvents: MatchEvent[];
      let newEvents: MatchEvent[];
      if (lastEvent.groupId) {
        undoneEvents = events.filter((e) => e.groupId === lastEvent.groupId);
        newEvents = events.filter((e) => e.groupId !== lastEvent.groupId);
      } else {
        undoneEvents = [lastEvent];
        newEvents = events.slice(0, -1);
      }

      const redStats = recalculateStatsFromEvents(newEvents, 'RED');
      const blueStats = recalculateStatsFromEvents(newEvents, 'BLUE');

      // Kembalikan kartu challenge jika event yang di-undo adalah penalti CHALLENGE_LOST_POINT
      const challengeLostUndone = undoneEvents.find(
        (e) => e.type === 'CHALLENGE_LOST_POINT'
      );
      const restoredChallengeCorner: Corner | null = challengeLostUndone
        ? challengeLostUndone.corner === 'RED'
          ? 'BLUE'
          : 'RED'
        : null;

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        red: {
          ...state.match.red,
          score: redStats.score,
          cautions: redStats.cautions,
          passivityCount: redStats.passivityCount,
          ...(restoredChallengeCorner === 'RED' ? { hasChallenge: true } : {}),
        },
        blue: {
          ...state.match.blue,
          score: blueStats.score,
          cautions: blueStats.cautions,
          passivityCount: blueStats.passivityCount,
          ...(restoredChallengeCorner === 'BLUE' ? { hasChallenge: true } : {}),
        },
        events: newEvents,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      undoBoutEventApi(activeBoutId).catch(() => {});
    }
  },

  declareWinner: (corner, type) => {
    const activeBoutId = get().match.activeBoutId;
    const redScore = get().match.red.score;
    const blueScore = get().match.blue.score;

    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        phase: 'FINISHED',
        winner: { corner, type },
      };
      savePersistedState(updatedMatch);
      saveMatchToHistory(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      completeBoutApi(activeBoutId, {
        winnerCorner: corner,
        victoryType: type,
        redScore,
        blueScore,
      }).catch(() => {});
    }
  },

  clearWinner: () => {
    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        winner: null,
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });
  },

  saveAndNextBout: () => {
    set((state) => {
      if (
        !state.match.winner &&
        (state.match.red.score > 0 ||
          state.match.blue.score > 0 ||
          state.match.events.length > 0)
      ) {
        saveMatchToHistory(state.match);
      }

      const nextBout = helperIncrementBout(state.match.metadata.boutNumber);
      const periodDuration = getPeriodDurationMs(state.match.metadata.ageCategory);

      const nextMatch: MatchState = {
        ...initialMatchState,
        version: state.match.version + 1,
        metadata: {
          ...state.match.metadata,
          boutNumber: nextBout,
        },
        phase: 'PRE_MATCH',
        mainClock: {
          remainingMs: periodDuration,
          isRunning: false,
          lastSyncedAt: null,
        },
        red: {
          ...initialMatchState.red,
          name: '',
          countryOrTeam: '',
        },
        blue: {
          ...initialMatchState.blue,
          name: '',
          countryOrTeam: '',
        },
        events: [],
        winner: null,
        activeChallengeCorner: null,
      };

      savePersistedState(nextMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: nextMatch });
      return { match: nextMatch };
    });
  },

  resetMatch: (options) => {
    set((state) => {
      const nextMetadata: MatchMetadata = options?.keepMetadata
        ? {
            ...state.match.metadata,
            boutNumber: options?.incrementBout
              ? helperIncrementBout(state.match.metadata.boutNumber)
              : state.match.metadata.boutNumber,
          }
        : initialMatchState.metadata;

      const resetState: MatchState = {
        ...initialMatchState,
        version: state.match.version + 1,
        metadata: nextMetadata,
      };

      savePersistedState(resetState);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: resetState });
      return { match: resetState };
    });
  },

  loadBoutData: (params) => {
    set((state) => {
      const periodDuration = getPeriodDurationMs(params.ageCategory);

      const loadedMatch: MatchState = {
        ...initialMatchState,
        version: state.match.version + 1,
        metadata: {
          matName: params.matName,
          boutNumber: params.boutNumber,
          style: params.style,
          ageCategory: params.ageCategory,
          weightClass: params.weightClass,
          round: params.round,
          activeBoutId: params.boutId,
        },
        phase: 'PRE_MATCH',
        mainClock: {
          remainingMs: periodDuration,
          isRunning: false,
          lastSyncedAt: null,
        },
        red: {
          ...initialMatchState.red,
          name: params.redName,
          countryOrTeam: params.redRegion,
          score: 0,
          cautions: 0,
          passivityCount: 0,
          hasChallenge: true,
        },
        blue: {
          ...initialMatchState.blue,
          name: params.blueName,
          countryOrTeam: params.blueRegion,
          score: 0,
          cautions: 0,
          passivityCount: 0,
          hasChallenge: true,
        },
        events: [],
        winner: null,
        activeChallengeCorner: null,
        activeBoutId: params.boutId,
        intermission: state.match.intermission ?? null,
        nextBoutPreview: params.nextBoutPreview || null,
      };

      savePersistedState(loadedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: loadedMatch });
      return { match: loadedMatch };
    });

    if (!isVitest && params.matName) {
      joinMatSocketRoom(params.matName);
    }
  },

  setMatchState: (incoming) => {
    set((state) => ({
      match: {
        ...incoming,
        intermission:
          incoming.intermission !== undefined
            ? incoming.intermission
            : state.match.intermission ?? null,
      },
    }));
  },

  toggleMainClock: () => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      const now = Date.now();
      const willRun = !state.match.mainClock.isRunning;
      const nextPhase: MatchPhase =
        state.match.phase === 'PRE_MATCH' && willRun ? 'PERIOD_1' : state.match.phase;

      let nextMainClock = { ...state.match.mainClock };
      let nextActivityClock = { ...state.match.activityClock };

      let nextRed = { ...state.match.red };
      let nextBlue = { ...state.match.blue };

      if (willRun) {
        nextMainClock.isRunning = true;
        nextMainClock.lastSyncedAt = now;

        if (nextActivityClock.activeCorner !== null) {
          nextActivityClock.isRunning = true;
          nextActivityClock.lastSyncedAt = now;
        }

        if (nextRed.injuryTimer.isRunning) {
          nextRed.injuryTimer = {
            ...nextRed.injuryTimer,
            remainingMs: computeRemainingMs(nextRed.injuryTimer, now),
            isRunning: false,
            lastSyncedAt: null,
          };
        }
        if (nextRed.bloodTimer.isRunning) {
          nextRed.bloodTimer = {
            ...nextRed.bloodTimer,
            remainingMs: computeRemainingMs(nextRed.bloodTimer, now),
            isRunning: false,
            lastSyncedAt: null,
          };
        }
        if (nextBlue.injuryTimer.isRunning) {
          nextBlue.injuryTimer = {
            ...nextBlue.injuryTimer,
            remainingMs: computeRemainingMs(nextBlue.injuryTimer, now),
            isRunning: false,
            lastSyncedAt: null,
          };
        }
        if (nextBlue.bloodTimer.isRunning) {
          nextBlue.bloodTimer = {
            ...nextBlue.bloodTimer,
            remainingMs: computeRemainingMs(nextBlue.bloodTimer, now),
            isRunning: false,
            lastSyncedAt: null,
          };
        }
      } else {
        nextMainClock.remainingMs = computeRemainingMs(nextMainClock, now);
        nextMainClock.isRunning = false;
        nextMainClock.lastSyncedAt = null;

        if (nextActivityClock.activeCorner !== null) {
          nextActivityClock.remainingMs = computeRemainingMs(nextActivityClock, now);
          nextActivityClock.isRunning = false;
          nextActivityClock.lastSyncedAt = null;
        }
      }

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        phase: nextPhase,
        mainClock: nextMainClock,
        activityClock: nextActivityClock,
        red: nextRed,
        blue: nextBlue,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, { action: 'TOGGLE_MAIN' }).catch(() => {});
    }
  },

  adjustMainClock: (deltaMs) => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      if (state.match.mainClock.isRunning) return state;
      const newMs = Math.max(0, state.match.mainClock.remainingMs + deltaMs);

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        mainClock: {
          ...state.match.mainClock,
          remainingMs: newMs,
        },
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, { action: 'ADJUST_MAIN', deltaMs }).catch(
        () => {}
      );
    }
  },

  setMainClock: (ms) => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      if (state.match.mainClock.isRunning) return state;
      const newMs = Math.max(0, ms);

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        mainClock: {
          ...state.match.mainClock,
          remainingMs: newMs,
        },
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, {
        action: 'SET_MAIN',
        remainingMs: Math.max(0, ms),
      }).catch(() => {});
    }
  },

  toggleBreakClock: () => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      const now = Date.now();
      const willRun = !state.match.breakClock.isRunning;
      const nextBreak = { ...state.match.breakClock };

      if (willRun) {
        nextBreak.isRunning = true;
        nextBreak.lastSyncedAt = now;
      } else {
        nextBreak.remainingMs = computeRemainingMs(nextBreak, now);
        nextBreak.isRunning = false;
        nextBreak.lastSyncedAt = null;
      }

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        breakClock: nextBreak,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, { action: 'TOGGLE_BREAK' }).catch(() => {});
    }
  },

  switchPhase: (phase) => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      const periodDuration = getPeriodDurationMs(state.match.metadata.ageCategory);

      let nextMain = { ...state.match.mainClock };
      let nextBreak = { ...state.match.breakClock };
      let nextActivity = { ...state.match.activityClock };

      if (phase === 'PERIOD_1' || phase === 'PERIOD_2') {
        nextMain = {
          remainingMs: periodDuration,
          isRunning: false,
          lastSyncedAt: null,
        };
        nextBreak = {
          remainingMs: 30_000,
          isRunning: false,
          lastSyncedAt: null,
        };
        nextActivity = {
          remainingMs: 30_000,
          isRunning: false,
          lastSyncedAt: null,
          activeCorner: null,
        };
      } else if (phase === 'BREAK') {
        nextMain.isRunning = false;
        nextMain.lastSyncedAt = null;
        nextBreak = {
          remainingMs: 30_000,
          isRunning: true,
          lastSyncedAt: Date.now(),
        };
        nextActivity = {
          remainingMs: 30_000,
          isRunning: false,
          lastSyncedAt: null,
          activeCorner: null,
        };
      }

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        phase,
        mainClock: nextMain,
        breakClock: nextBreak,
        activityClock: nextActivity,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, { action: 'CHANGE_PHASE', phase }).catch(
        () => {}
      );
    }
  },

  toggleMedicalTimer: (corner, kind) => {
    const activeBoutId = get().match.activeBoutId;
    set((state) => {
      const now = Date.now();
      const wrestler = corner === 'RED' ? state.match.red : state.match.blue;
      const targetTimer = kind === 'injury' ? wrestler.injuryTimer : wrestler.bloodTimer;
      const willRun = !targetTimer.isRunning;

      const nextMain = { ...state.match.mainClock };
      const nextActivity = { ...state.match.activityClock };

      if (willRun) {
        if (nextMain.isRunning) {
          nextMain.remainingMs = computeRemainingMs(nextMain, now);
          nextMain.isRunning = false;
          nextMain.lastSyncedAt = null;
        }
        if (nextActivity.isRunning) {
          nextActivity.remainingMs = computeRemainingMs(nextActivity, now);
          nextActivity.isRunning = false;
          nextActivity.lastSyncedAt = null;
        }
      }

      const updatedTargetTimer = willRun
        ? { ...targetTimer, isRunning: true, lastSyncedAt: now }
        : {
            ...targetTimer,
            remainingMs: computeRemainingMs(targetTimer, now),
            isRunning: false,
            lastSyncedAt: null,
          };

      const updatedWrestler: WrestlerState = {
        ...wrestler,
        [kind === 'injury' ? 'injuryTimer' : 'bloodTimer']: updatedTargetTimer,
      };

      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        mainClock: nextMain,
        activityClock: nextActivity,
        [corner === 'RED' ? 'red' : 'blue']: updatedWrestler,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, {
        action: 'TOGGLE_MEDICAL',
        corner,
        timerType: kind === 'injury' ? 'INJURY' : 'BLOOD',
      }).catch(() => {});
    }
  },

  startIntermission: ({ durationMs, title, subtitle, autoStart = true }) => {
    const safeDurationMs = Math.max(1000, durationMs);
    const now = Date.now();
    const intermission: IntermissionState = {
      isActive: true,
      title: (title || 'ISTIRAHAT PERTANDINGAN').trim() || 'ISTIRAHAT PERTANDINGAN',
      subtitle:
        subtitle?.trim() || 'Pertandingan akan dilanjutkan kembali dalam:',
      timer: {
        remainingMs: safeDurationMs,
        isRunning: autoStart,
        lastSyncedAt: autoStart ? now : null,
      },
    };

    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        intermission,
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest) {
      emitMatIntermission(get().match.metadata.matName, intermission);
    }
  },

  toggleIntermissionClock: () => {
    const currentIntermission = get().match.intermission;
    if (!currentIntermission || !currentIntermission.isActive) return;

    const now = Date.now();
    const isRunning = currentIntermission.timer.isRunning;
    const nextTimer = isRunning
      ? {
          remainingMs: computeRemainingMs(currentIntermission.timer, now),
          isRunning: false,
          lastSyncedAt: null,
        }
      : {
          remainingMs: Math.max(0, currentIntermission.timer.remainingMs),
          isRunning: true,
          lastSyncedAt: now,
        };

    const nextIntermission: IntermissionState = {
      ...currentIntermission,
      timer: nextTimer,
    };

    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        intermission: nextIntermission,
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest) {
      emitMatIntermission(get().match.metadata.matName, nextIntermission);
    }
  },

  adjustIntermissionClock: (deltaMs) => {
    const currentIntermission = get().match.intermission;
    if (!currentIntermission || !currentIntermission.isActive) return;

    const now = Date.now();
    const liveMs = computeRemainingMs(currentIntermission.timer, now);
    const nextRemaining = Math.max(0, liveMs + deltaMs);

    const nextIntermission: IntermissionState = {
      ...currentIntermission,
      timer: {
        remainingMs: nextRemaining,
        isRunning: currentIntermission.timer.isRunning && nextRemaining > 0,
        lastSyncedAt:
          currentIntermission.timer.isRunning && nextRemaining > 0 ? now : null,
      },
    };

    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        intermission: nextIntermission,
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest) {
      emitMatIntermission(get().match.metadata.matName, nextIntermission);
    }
  },

  stopIntermission: () => {
    set((state) => {
      const updatedMatch: MatchState = {
        ...state.match,
        version: state.match.version + 1,
        intermission: null,
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest) {
      emitMatIntermission(get().match.metadata.matName, null);
    }
  },

  handleMainClockExpired: () => {
    const state = get().match;
    if (!state.mainClock.isRunning) return;
    const activeBoutId = state.activeBoutId;

    audioEngine.playPeriodEndBuzzer();
    syncChannel.postMessage({ type: 'TRIGGER_BUZZER', sound: 'PERIOD_END' });

    if (state.phase === 'PERIOD_1') {
      set((s) => {
        const updatedMatch: MatchState = {
          ...s.match,
          version: s.match.version + 1,
          phase: 'BREAK',
          mainClock: {
            remainingMs: 0,
            isRunning: false,
            lastSyncedAt: null,
          },
          breakClock: {
            remainingMs: 30_000,
            isRunning: true,
            lastSyncedAt: Date.now(),
          },
          activityClock: {
            remainingMs: 30_000,
            isRunning: false,
            lastSyncedAt: null,
            activeCorner: null,
          },
        };
        savePersistedState(updatedMatch);
        syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
        return { match: updatedMatch };
      });

      if (!isVitest && activeBoutId) {
        updateBoutClockApi(activeBoutId, {
          action: 'CHANGE_PHASE',
          phase: 'BREAK',
        }).catch(() => {});
      }
    } else if (state.phase === 'PERIOD_2') {
      set((s) => {
        const updatedMatch: MatchState = {
          ...s.match,
          version: s.match.version + 1,
          mainClock: {
            remainingMs: 0,
            isRunning: false,
            lastSyncedAt: null,
          },
          activityClock: {
            remainingMs: 30_000,
            isRunning: false,
            lastSyncedAt: null,
            activeCorner: null,
          },
        };
        savePersistedState(updatedMatch);
        syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
        return { match: updatedMatch };
      });

      if (!isVitest && activeBoutId) {
        updateBoutClockApi(activeBoutId, {
          action: 'SET_MAIN',
          remainingMs: 0,
        }).catch(() => {});
      }
    }
  },

  handleBreakClockExpired: () => {
    const state = get().match;
    if (!state.breakClock.isRunning) return;
    const activeBoutId = state.activeBoutId;

    audioEngine.playActivityEndBeep();
    syncChannel.postMessage({ type: 'TRIGGER_BUZZER', sound: 'ACTIVITY_END' });

    set((s) => {
      const periodDuration = getPeriodDurationMs(s.match.metadata.ageCategory);
      const updatedMatch: MatchState = {
        ...s.match,
        version: s.match.version + 1,
        phase: 'PERIOD_2',
        breakClock: {
          remainingMs: 0,
          isRunning: false,
          lastSyncedAt: null,
        },
        mainClock: {
          remainingMs: periodDuration,
          isRunning: false,
          lastSyncedAt: null,
        },
      };
      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, {
        action: 'CHANGE_PHASE',
        phase: 'PERIOD_2',
      }).catch(() => {});
    }
  },

  handleActivityClockExpired: () => {
    const state = get().match;
    if (!state.activityClock.isRunning || state.activityClock.activeCorner === null) return;
    const activeBoutId = state.activeBoutId;

    audioEngine.playActivityEndBeep();
    syncChannel.postMessage({ type: 'TRIGGER_BUZZER', sound: 'ACTIVITY_END' });

    const passiveCorner = state.activityClock.activeCorner;
    const opponentCorner: Corner = passiveCorner === 'RED' ? 'BLUE' : 'RED';
    const currentPeriod = state.phase === 'PERIOD_2' ? 2 : 1;

    set((s) => {
      const newEvent: MatchEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        period: currentPeriod,
        matchClockMs: computeRemainingMs(s.match.mainClock),
        corner: opponentCorner,
        type: 'ACTIVITY_POINT',
        points: 1,
      };

      const newEvents = [...s.match.events, newEvent];
      const redStats = recalculateStatsFromEvents(newEvents, 'RED');
      const blueStats = recalculateStatsFromEvents(newEvents, 'BLUE');

      const updatedMatch: MatchState = {
        ...s.match,
        version: s.match.version + 1,
        activityClock: {
          remainingMs: 30_000,
          isRunning: false,
          lastSyncedAt: null,
          activeCorner: null,
        },
        red: {
          ...s.match.red,
          score: redStats.score,
          cautions: redStats.cautions,
          passivityCount: redStats.passivityCount,
        },
        blue: {
          ...s.match.blue,
          score: blueStats.score,
          cautions: blueStats.cautions,
          passivityCount: blueStats.passivityCount,
        },
        events: newEvents,
      };

      savePersistedState(updatedMatch);
      syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
      return { match: updatedMatch };
    });

    if (!isVitest && activeBoutId) {
      updateBoutClockApi(activeBoutId, {
        action: 'COMPLETE_ACTIVITY_TIMEOUT',
        corner: passiveCorner,
      }).catch(() => {});
    }
  },

  getTieBreaker: () => {
    const { red, blue, events } = get().match;
    return evaluateTieBreaker(red, blue, events);
  },

  getTechSuperiority: () => {
    return checkTechnicalSuperiority(get().match);
  },

  getDisqualification: () => {
    return checkDisqualification(get().match);
  },

  getSuggestedVictory: () => {
    return suggestEndOfMatchVictory(get().match);
  },

  initController: () => {
    const saved = loadPersistedState();
    if (saved) {
      set({ match: saved });
    }

    const unsubscribe = syncChannel.subscribe((msg: SyncMessage) => {
      if (msg.type === 'REQUEST_STATE') {
        const current = get().match;
        syncChannel.postMessage({ type: 'STATE_UPDATE', payload: current });
      } else if (msg.type === 'DISPLAY_PING') {
        set({ isDisplayConnected: true });
      }
    });

    let unsubSocketState = () => {};
    let unsubSocketIntermission = () => {};
    if (!isVitest) {
      joinMatSocketRoom(get().match.metadata.matName);
      unsubSocketState = subscribeSocketMatchState((incomingState) => {
        const merged: MatchState = {
          ...incomingState,
          intermission:
            incomingState.intermission !== undefined
              ? incomingState.intermission
              : get().match.intermission ?? null,
        };
        set({ match: merged });
        savePersistedState(merged);
        syncChannel.postMessage({ type: 'STATE_UPDATE', payload: merged });
      });
      unsubSocketIntermission = subscribeSocketIntermission((intermission) => {
        set((state) => {
          const updatedMatch: MatchState = {
            ...state.match,
            version: state.match.version + 1,
            intermission,
          };
          savePersistedState(updatedMatch);
          syncChannel.postMessage({ type: 'STATE_UPDATE', payload: updatedMatch });
          return { match: updatedMatch };
        });
      });
    }

    syncChannel.postMessage({ type: 'STATE_UPDATE', payload: get().match });

    return () => {
      unsubscribe();
      unsubSocketState();
      unsubSocketIntermission();
    };
  },

  initDisplay: () => {
    const saved = loadPersistedState();
    if (saved) {
      set({ match: saved, isControllerConnected: true });
    }

    syncChannel.postMessage({ type: 'REQUEST_STATE' });
    syncChannel.postMessage({ type: 'DISPLAY_PING' });

    const unsubscribe = syncChannel.subscribe((msg: SyncMessage) => {
      if (msg.type === 'STATE_UPDATE') {
        const current = get().match;
        if (isStateAcceptedByDisplay(current, msg.payload)) {
          set({ match: msg.payload, isControllerConnected: true });
          savePersistedState(msg.payload);
        }
      } else if (msg.type === 'TRIGGER_BUZZER') {
        if (msg.sound === 'PERIOD_END') {
          audioEngine.playPeriodEndBuzzer();
        } else if (msg.sound === 'ACTIVITY_END') {
          audioEngine.playActivityEndBeep();
        }
      }
    });

    let unsubSocketState = () => {};
    let unsubSocketBuzzer = () => {};
    let unsubSocketIntermission = () => {};
    if (!isVitest) {
      joinMatSocketRoom(get().match.metadata.matName);
      unsubSocketState = subscribeSocketMatchState((incomingState) => {
        const merged: MatchState = {
          ...incomingState,
          intermission:
            incomingState.intermission !== undefined
              ? incomingState.intermission
              : get().match.intermission ?? null,
        };
        set({ match: merged, isControllerConnected: true });
        savePersistedState(merged);
      });
      unsubSocketIntermission = subscribeSocketIntermission((intermission) => {
        set((state) => {
          const updatedMatch: MatchState = {
            ...state.match,
            intermission,
          };
          savePersistedState(updatedMatch);
          return { match: updatedMatch, isControllerConnected: true };
        });
      });
      unsubSocketBuzzer = subscribeSocketBuzzer((payload) => {
        if (payload.sound === 'PERIOD_END') {
          audioEngine.playPeriodEndBuzzer();
        } else if (payload.sound === 'ACTIVITY_END') {
          audioEngine.playActivityEndBeep();
        }
      });
    }

    return () => {
      unsubscribe();
      unsubSocketState();
      unsubSocketBuzzer();
      unsubSocketIntermission();
    };
  },
}));
