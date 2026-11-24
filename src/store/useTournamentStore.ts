import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  Athlete,
  CategoryDivision,
  DivisionFormat,
  TournamentBout,
  BoutResult,
  BoutStatus,
  BoutRound,
} from '../types/tournament';
import { detectRecommendedFormat } from '../engine/excelImporter';
import { generateOfficialDraw } from '../engine/uwwDrawEngine';
import {
  generateDivisionBouts,
  advanceBoutResult,
} from '../engine/uwwBracketEngine';
import { getClassificationPoints } from '../engine/uwwClassification';
import { saveMatchToHistory } from '../engine/historyEngine';
import { useMatchStore } from './useMatchStore';
import {
  ApiBoutRecord,
  bulkImportAthletesApi,
  completeBoutApi,
  createAthleteApi,
  createTournamentApi,
  deleteAthleteApi,
  deleteDivisionApi,
  deleteTournamentApi,
  exportTournamentBackupApi,
  fetchTournamentBoutsApi,
  fetchTournamentDivisionsApi,
  fetchTournamentsApi,
  generateBracketApi,
  generateScheduleApi,
  loadBoutToSessionApi,
  manualSwapDrawApi,
  performDrawApi,
  reorderBoutsApi,
  restoreTournamentBackupApi,
  unlockBracketApi,
  updateAthleteApi,
  updateDivisionApi,
  updateTournamentApi,
} from '../api/client';
import {
  joinScheduleSocketRoom,
  subscribeSocketBracket,
  subscribeSocketSchedule,
} from './socketClient';

const isIdbAvailable = typeof indexedDB !== 'undefined';
const isVitest = Boolean(
  (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITEST
);

const get = async <T>(key: string): Promise<T | undefined> => {
  if (!isIdbAvailable) return undefined;
  try {
    return await idbGet<T>(key);
  } catch {
    return undefined;
  }
};

const set = async (key: string, val: unknown): Promise<void> => {
  if (!isIdbAvailable) return;
  try {
    await idbSet(key, val);
  } catch {
    // ignore
  }
};

const del = async (key: string): Promise<void> => {
  if (!isIdbAvailable) return;
  try {
    await idbDel(key);
  } catch {
    // ignore
  }
};

const IDB_KEY_ATHLETES = 'uww_tournament_athletes';
const IDB_KEY_DIVISIONS = 'uww_tournament_divisions';
const IDB_KEY_SELECTED_DIV = 'uww_tournament_selected_division';
const IDB_KEY_BOUTS = 'uww_tournament_bouts';
const IDB_KEY_ORDER_OF_BOUTS = 'uww_tournament_order_of_bouts';
const IDB_KEY_TOURNAMENT_ID = 'uww_tournament_active_id';
const IDB_KEY_TOURNAMENT_NAME = 'uww_tournament_name';
const DEFAULT_TOURNAMENT_NAME = 'PORPROV X LAMPUNG 2026';
const LEGACY_PLACEHOLDER_NAMES = new Set([
  'Kejurnas Gulat UWW Lokal',
  'Kejurnas Gulat UWW Lokal 2026',
]);

function mapApiBoutToTournamentBout(b: ApiBoutRecord): TournamentBout {
  const hasResult =
    b.status === 'COMPLETED' &&
    b.winnerCorner !== null &&
    b.winnerAthleteId !== null &&
    b.victoryType !== null;

  const loserAthleteId =
    b.winnerCorner === 'RED' ? b.blueAthleteId || '' : b.redAthleteId || '';

  return {
    id: b.id,
    divisionId: b.divisionId || '',
    boutNumber: b.boutNumber,
    matName: b.matName,
    round: b.round as BoutRound,
    roundOrder: b.roundOrder,
    bracketPosition: b.bracketPosition,
    bracketSide: b.bracketSide ?? undefined,
    redAthleteId: b.redAthleteId,
    blueAthleteId: b.blueAthleteId,
    redSourceLabel: b.redSourceLabel ?? undefined,
    blueSourceLabel: b.blueSourceLabel ?? undefined,
    nextWinBoutId: b.nextWinBoutId ?? undefined,
    nextWinSlot: b.nextWinSlot ?? undefined,
    nextLoseBoutId: b.nextLoseBoutId ?? undefined,
    nextLoseSlot: b.nextLoseSlot ?? undefined,
    status: b.status,
    result: hasResult
      ? {
          winnerCorner: b.winnerCorner!,
          winnerAthleteId: b.winnerAthleteId!,
          loserAthleteId,
          redScore: b.redScore,
          blueScore: b.blueScore,
          victoryType: b.victoryType!,
          redClassificationPts: b.redClassificationPts,
          blueClassificationPts: b.blueClassificationPts,
          completedAt: b.completedAt ? new Date(b.completedAt).getTime() : Date.now(),
        }
      : undefined,
  };
}

function getOrderedBoutsForMat(
  boutsMap: Record<string, TournamentBout>,
  orderOfBouts: string[],
  matName: string
): TournamentBout[] {
  const seen = new Set<string>();
  const ordered: TournamentBout[] = [];

  for (const id of orderOfBouts) {
    const b = boutsMap[id];
    if (b && (b.matName || 'MAT A') === matName) {
      seen.add(id);
      ordered.push(b);
    }
  }

  const remaining = Object.values(boutsMap)
    .filter((b) => !seen.has(b.id) && (b.matName || 'MAT A') === matName)
    .sort((a, b) => {
      const numA = a.boutNumber ?? 999999;
      const numB = b.boutNumber ?? 999999;
      if (numA !== numB) return numA - numB;
      if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
      return a.bracketPosition - b.bracketPosition;
    });

  return [...ordered, ...remaining];
}

let socketListenersBound = false;

interface TournamentStoreState {
  activeTournamentId: string | null;
  tournamentName: string;
  athletes: Record<string, Athlete>;
  divisions: Record<string, CategoryDivision>;
  bouts: Record<string, TournamentBout>;
  orderOfBouts: string[];
  activeMat: string;
  selectedDivisionId: string | null;
  isLoading: boolean;

  // Actions
  syncFromMySql: () => Promise<boolean>;
  loadFromIndexedDB: () => Promise<void>;
  setTournamentName: (name: string) => Promise<void>;
  setActiveMat: (matName: string) => void;
  importAthletes: (
    newAthletes: Omit<Athlete, 'id'>[],
    mode: 'MERGE' | 'REPLACE'
  ) => Promise<void>;
  addAthlete: (athleteData: Omit<Athlete, 'id'>) => Promise<Athlete>;
  updateAthlete: (id: string, updates: Partial<Athlete>) => Promise<void>;
  deleteAthlete: (id: string) => Promise<void>;
  selectDivision: (divisionId: string | null) => void;
  setDivisionMat: (divisionId: string, matName: string) => Promise<void>;
  setDivisionFormat: (divisionId: string, format: DivisionFormat) => Promise<void>;
  clearDivision: (divisionId: string) => Promise<void>;
  resetTournament: () => Promise<void>;

  // Phase 9 Bracket & Draw Actions
  performDrawOnly: (
    divisionId: string,
    options?: { separateSameRegion?: boolean }
  ) => Promise<void>;
  setAthleteDrawNumber: (
    athleteId: string,
    drawNumber: number | undefined
  ) => Promise<void>;
  setDivisionDrawDraft: (
    assignments: Array<{ athleteId: string; drawNumber: number | null }>
  ) => Promise<void>;
  saveDivisionDrawAssignments: (
    divisionId: string,
    assignments: Array<{ athleteId: string; drawNumber: number | null }>
  ) => Promise<{
    ok: boolean;
    target: 'MYSQL' | 'LOCAL';
    error?: string;
  }>;
  clearDivisionDrawNumbers: (divisionId: string) => Promise<void>;
  swapDrawNumbers: (athleteId1: string, athleteId2: string) => Promise<void>;
  lockAndGenerateBracket: (
    divisionId: string,
    options?: { separateSameRegion?: boolean }
  ) => Promise<void>;
  unlockAndResetBracket: (divisionId: string) => Promise<void>;
  recordBoutResult: (boutId: string, result: BoutResult) => Promise<void>;
  getDivisionBouts: (divisionId: string) => TournamentBout[];

  // Phase 10 Bout Queue Management
  generateMasterOrderOfBouts: () => Promise<void>;
  reorderBout: (sourceIndex: number, destinationIndex: number) => Promise<void>;
  setBoutMat: (boutId: string, matName: string) => Promise<void>;
  setBoutStatus: (boutId: string, status: BoutStatus) => Promise<void>;
  loadBoutToMatch: (boutId: string) => void;
  completeBout: (boutId: string, result: BoutResult) => Promise<void>;
  saveAndLoadNextBout: () => Promise<{ loadedNext: boolean; nextBoutId?: string }>;
  cancelCurrentBout: (boutId: string) => Promise<void>;

  // Phase 15 Backup & Restore JSON Lokal
  exportTournamentBackup: () => Promise<void>;
  restoreTournamentBackup: (backupPayload: unknown) => Promise<void>;
}

export const useTournamentStore = create<TournamentStoreState>((setStore, getStore) => ({
  activeTournamentId: null,
  tournamentName: DEFAULT_TOURNAMENT_NAME,
  athletes: {},
  divisions: {},
  bouts: {},
  orderOfBouts: [],
  activeMat: 'MAT A',
  selectedDivisionId: null,
  isLoading: true,

  setTournamentName: async (name) => {
    const cleanName = name.trim() || DEFAULT_TOURNAMENT_NAME;
    setStore({ tournamentName: cleanName });
    await set(IDB_KEY_TOURNAMENT_NAME, cleanName);

    const activeTournamentId = getStore().activeTournamentId;
    if (!isVitest && activeTournamentId) {
      try {
        await updateTournamentApi(activeTournamentId, { name: cleanName });
      } catch (err) {
        console.warn('Gagal memperbarui nama turnamen di MySQL:', err);
      }
    }
  },

  setActiveMat: (matName) => {
    setStore({ activeMat: matName });
  },

  syncFromMySql: async () => {
    if (isVitest) return false;
    try {
      const { tournaments } = await fetchTournamentsApi();
      let activeTournament = tournaments.find((t) => t.status === 'ACTIVE') || tournaments[0];

      if (!activeTournament) {
        const created = await createTournamentApi({
          name: DEFAULT_TOURNAMENT_NAME,
          location: 'Lampung',
        });
        activeTournament = created.tournament;
      } else if (LEGACY_PLACEHOLDER_NAMES.has(activeTournament.name.trim())) {
        // Migrasi otomatis nama placeholder lama ke default event aktif
        activeTournament = { ...activeTournament, name: DEFAULT_TOURNAMENT_NAME };
        updateTournamentApi(activeTournament.id, {
          name: DEFAULT_TOURNAMENT_NAME,
        }).catch(() => {});
      }

      const [divData, boutData] = await Promise.all([
        fetchTournamentDivisionsApi(activeTournament.id),
        fetchTournamentBoutsApi(activeTournament.id),
      ]);

      const athletes: Record<string, Athlete> = {};
      const divisions: Record<string, CategoryDivision> = {};
      const bouts: Record<string, TournamentBout> = {};

      for (const div of divData.divisions) {
        divisions[div.id] = {
          id: div.id,
          style: div.style,
          ageCategory: div.ageCategory,
          weightClass: div.weightClass,
          athleteIds: div.athletes.map((a) => a.id),
          format: div.format,
          assignedMat: div.assignedMat || 'MAT A',
          isDrawLocked: div.isDrawLocked,
        };

        for (const ath of div.athletes) {
          athletes[ath.id] = {
            id: ath.id,
            name: ath.name,
            region: ath.region,
            regionCode: ath.regionCode,
            style: div.style,
            ageCategory: div.ageCategory,
            weightClass: div.weightClass,
            seed: ath.seed ?? undefined,
            drawNumber: ath.drawNumber ?? undefined,
          };
        }
      }

      const orderOfBouts: string[] = [];
      for (const b of boutData.bouts) {
        const mapped = mapApiBoutToTournamentBout(b);
        bouts[mapped.id] = mapped;
        orderOfBouts.push(mapped.id);
      }

      const currentSelected = getStore().selectedDivisionId;
      const nextSelected =
        currentSelected && divisions[currentSelected]
          ? currentSelected
          : Object.keys(divisions)[0] || null;

      setStore({
        activeTournamentId: activeTournament.id,
        tournamentName: activeTournament.name,
        athletes,
        divisions,
        bouts,
        orderOfBouts,
        selectedDivisionId: nextSelected,
        isLoading: false,
      });

      await Promise.all([
        set(IDB_KEY_TOURNAMENT_ID, activeTournament.id),
        set(IDB_KEY_TOURNAMENT_NAME, activeTournament.name),
        set(IDB_KEY_ATHLETES, athletes),
        set(IDB_KEY_DIVISIONS, divisions),
        set(IDB_KEY_BOUTS, bouts),
        set(IDB_KEY_ORDER_OF_BOUTS, orderOfBouts),
        set(IDB_KEY_SELECTED_DIV, nextSelected),
      ]);

      return true;
    } catch {
      return false;
    }
  },

  loadFromIndexedDB: async () => {
    if (!isVitest && !socketListenersBound) {
      socketListenersBound = true;
      joinScheduleSocketRoom();
      subscribeSocketBracket(() => {
        getStore().syncFromMySql();
      });
      subscribeSocketSchedule(() => {
        getStore().syncFromMySql();
      });
    }

    if (!isVitest) {
      const synced = await getStore().syncFromMySql();
      if (synced) return;
    }

    try {
      const [
        savedTournamentId,
        savedTournamentName,
        savedAthletes,
        savedDivisions,
        savedSelectedDiv,
        savedBouts,
        savedOrder,
      ] = await Promise.all([
        get<string>(IDB_KEY_TOURNAMENT_ID),
        get<string>(IDB_KEY_TOURNAMENT_NAME),
        get<Record<string, Athlete>>(IDB_KEY_ATHLETES),
        get<Record<string, CategoryDivision>>(IDB_KEY_DIVISIONS),
        get<string>(IDB_KEY_SELECTED_DIV),
        get<Record<string, TournamentBout>>(IDB_KEY_BOUTS),
        get<string[]>(IDB_KEY_ORDER_OF_BOUTS),
      ]);

      const athletes = savedAthletes || {};
      const divisions = savedDivisions || {};
      const bouts = savedBouts || {};
      const orderOfBouts = savedOrder || [];
      const selectedDivisionId =
        savedSelectedDiv && divisions[savedSelectedDiv]
          ? savedSelectedDiv
          : Object.keys(divisions)[0] || null;
      const resolvedName =
        savedTournamentName && !LEGACY_PLACEHOLDER_NAMES.has(savedTournamentName.trim())
          ? savedTournamentName
          : DEFAULT_TOURNAMENT_NAME;

      setStore({
        activeTournamentId: savedTournamentId || null,
        tournamentName: resolvedName,
        athletes,
        divisions,
        bouts,
        orderOfBouts,
        selectedDivisionId,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load tournament data from IndexedDB:', err);
      setStore({ isLoading: false });
    }
  },

  importAthletes: async (newAthletes, mode) => {
    const state = getStore();
    if (!isVitest && state.activeTournamentId) {
      try {
        await bulkImportAthletesApi(state.activeTournamentId, {
          mode,
          athletes: newAthletes,
        });
        await getStore().syncFromMySql();
        return;
      } catch (err) {
        console.warn('Fallback ke penyimpanan lokal untuk importAthletes:', err);
      }
    }

    const athletes: Record<string, Athlete> =
      mode === 'REPLACE' ? {} : { ...state.athletes };
    const divisions: Record<string, CategoryDivision> =
      mode === 'REPLACE' ? {} : { ...state.divisions };
    const bouts: Record<string, TournamentBout> =
      mode === 'REPLACE' ? {} : { ...state.bouts };

    let counter = 0;
    for (const raw of newAthletes) {
      counter++;
      const id = `ath_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 7)}`;
      const divisionId = `${raw.style}_${raw.ageCategory}_${raw.weightClass}`;

      const athlete: Athlete = {
        ...raw,
        id,
      };
      athletes[id] = athlete;

      if (!divisions[divisionId]) {
        divisions[divisionId] = {
          id: divisionId,
          style: raw.style,
          ageCategory: raw.ageCategory,
          weightClass: raw.weightClass,
          athleteIds: [],
          format: 'SINGLE_BOUT',
          assignedMat: 'MAT A',
          isDrawLocked: false,
        };
      }

      if (!divisions[divisionId].athleteIds.includes(id)) {
        divisions[divisionId].athleteIds.push(id);
      }
    }

    Object.values(divisions).forEach((div) => {
      div.format = detectRecommendedFormat(div.athleteIds.length);
    });

    const activeDiv =
      state.selectedDivisionId && divisions[state.selectedDivisionId]
        ? state.selectedDivisionId
        : Object.keys(divisions)[0] || null;

    setStore({
      athletes,
      divisions,
      bouts,
      selectedDivisionId: activeDiv,
    });

    await Promise.all([
      set(IDB_KEY_ATHLETES, athletes),
      set(IDB_KEY_DIVISIONS, divisions),
      set(IDB_KEY_BOUTS, bouts),
      set(IDB_KEY_SELECTED_DIV, activeDiv),
    ]);
  },

  addAthlete: async (athleteData) => {
    const state = getStore();
    if (!isVitest && state.activeTournamentId) {
      try {
        const { athlete: dbAth } = await createAthleteApi({
          ...athleteData,
          tournamentId: state.activeTournamentId,
        });
        await getStore().syncFromMySql();
        setStore({ selectedDivisionId: dbAth.divisionId });
        return (
          getStore().athletes[dbAth.id] || {
            ...athleteData,
            id: dbAth.id,
          }
        );
      } catch (err) {
        console.warn('Fallback ke penyimpanan lokal untuk addAthlete:', err);
      }
    }

    const athletes = { ...state.athletes };
    const divisions = { ...state.divisions };

    const id = `ath_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const divisionId = `${athleteData.style}_${athleteData.ageCategory}_${athleteData.weightClass}`;

    const newAthlete: Athlete = {
      ...athleteData,
      id,
    };
    athletes[id] = newAthlete;

    if (!divisions[divisionId]) {
      divisions[divisionId] = {
        id: divisionId,
        style: athleteData.style,
        ageCategory: athleteData.ageCategory,
        weightClass: athleteData.weightClass,
        athleteIds: [],
        format: 'SINGLE_BOUT',
        assignedMat: 'MAT A',
        isDrawLocked: false,
      };
    }

    divisions[divisionId].athleteIds.push(id);
    divisions[divisionId].format = detectRecommendedFormat(
      divisions[divisionId].athleteIds.length
    );

    setStore({ athletes, divisions, selectedDivisionId: divisionId });

    await Promise.all([
      set(IDB_KEY_ATHLETES, athletes),
      set(IDB_KEY_DIVISIONS, divisions),
      set(IDB_KEY_SELECTED_DIV, divisionId),
    ]);

    return newAthlete;
  },

  updateAthlete: async (id, updates) => {
    const state = getStore();
    if (!isVitest && state.activeTournamentId) {
      try {
        await updateAthleteApi(id, updates);
        await getStore().syncFromMySql();
        return;
      } catch (err) {
        console.warn('Fallback ke penyimpanan lokal untuk updateAthlete:', err);
      }
    }

    const current = state.athletes[id];
    if (!current) return;

    const athletes = { ...state.athletes };
    const divisions = { ...state.divisions };

    const oldDivisionId = `${current.style}_${current.ageCategory}_${current.weightClass}`;
    const updatedAthlete: Athlete = { ...current, ...updates };
    const newDivisionId = `${updatedAthlete.style}_${updatedAthlete.ageCategory}_${updatedAthlete.weightClass}`;

    athletes[id] = updatedAthlete;

    if (oldDivisionId !== newDivisionId) {
      if (divisions[oldDivisionId]) {
        divisions[oldDivisionId].athleteIds = divisions[oldDivisionId].athleteIds.filter(
          (athId) => athId !== id
        );
        divisions[oldDivisionId].format = detectRecommendedFormat(
          divisions[oldDivisionId].athleteIds.length
        );
        if (divisions[oldDivisionId].athleteIds.length === 0) {
          delete divisions[oldDivisionId];
        }
      }

      if (!divisions[newDivisionId]) {
        divisions[newDivisionId] = {
          id: newDivisionId,
          style: updatedAthlete.style,
          ageCategory: updatedAthlete.ageCategory,
          weightClass: updatedAthlete.weightClass,
          athleteIds: [],
          format: 'SINGLE_BOUT',
          assignedMat: 'MAT A',
          isDrawLocked: false,
        };
      }

      if (!divisions[newDivisionId].athleteIds.includes(id)) {
        divisions[newDivisionId].athleteIds.push(id);
      }
      divisions[newDivisionId].format = detectRecommendedFormat(
        divisions[newDivisionId].athleteIds.length
      );
    }

    const nextSelected =
      state.selectedDivisionId && divisions[state.selectedDivisionId]
        ? state.selectedDivisionId
        : Object.keys(divisions)[0] || null;

    setStore({ athletes, divisions, selectedDivisionId: nextSelected });

    await Promise.all([
      set(IDB_KEY_ATHLETES, athletes),
      set(IDB_KEY_DIVISIONS, divisions),
      set(IDB_KEY_SELECTED_DIV, nextSelected),
    ]);
  },

  deleteAthlete: async (id) => {
    const state = getStore();
    if (!isVitest && state.activeTournamentId) {
      try {
        await deleteAthleteApi(id);
        await getStore().syncFromMySql();
        return;
      } catch (err) {
        console.warn('Fallback ke penyimpanan lokal untuk deleteAthlete:', err);
      }
    }

    const current = state.athletes[id];
    if (!current) return;

    const athletes = { ...state.athletes };
    const divisions = { ...state.divisions };
    const divisionId = `${current.style}_${current.ageCategory}_${current.weightClass}`;

    delete athletes[id];

    if (divisions[divisionId]) {
      divisions[divisionId].athleteIds = divisions[divisionId].athleteIds.filter(
        (athId) => athId !== id
      );
      divisions[divisionId].format = detectRecommendedFormat(
        divisions[divisionId].athleteIds.length
      );
      if (divisions[divisionId].athleteIds.length === 0) {
        delete divisions[divisionId];
      }
    }

    const nextSelected =
      state.selectedDivisionId && divisions[state.selectedDivisionId]
        ? state.selectedDivisionId
        : Object.keys(divisions)[0] || null;

    setStore({ athletes, divisions, selectedDivisionId: nextSelected });

    await Promise.all([
      set(IDB_KEY_ATHLETES, athletes),
      set(IDB_KEY_DIVISIONS, divisions),
      set(IDB_KEY_SELECTED_DIV, nextSelected),
    ]);
  },

  selectDivision: (divisionId) => {
    setStore({ selectedDivisionId: divisionId });
    if (divisionId) {
      set(IDB_KEY_SELECTED_DIV, divisionId).catch(() => {});
    }
  },

  setDivisionMat: async (divisionId, matName) => {
    const state = getStore();
    const div = state.divisions[divisionId];
    if (!div) return;

    const normalizedMat = matName.trim().toUpperCase();

    const divisions = {
      ...state.divisions,
      [divisionId]: {
        ...div,
        assignedMat: normalizedMat,
      },
    };

    const bouts = { ...state.bouts };
    Object.keys(bouts).forEach((boutId) => {
      const b = bouts[boutId];
      if (
        b.divisionId === divisionId &&
        (b.status === 'TBD' || b.status === 'SCHEDULED' || b.status === 'ON_DECK')
      ) {
        bouts[boutId] = { ...b, matName: normalizedMat };
      }
    });

    setStore({ divisions, bouts });
    await Promise.all([set(IDB_KEY_DIVISIONS, divisions), set(IDB_KEY_BOUTS, bouts)]);

    if (!isVitest && state.activeTournamentId) {
      try {
        await updateDivisionApi(divisionId, { assignedMat: normalizedMat });
        await getStore().syncFromMySql();
      } catch (err) {
        console.warn('Gagal menyinkronkan matras divisi ke MySQL:', err);
      }
    }
  },

  setDivisionFormat: async (divisionId, format) => {
    const state = getStore();
    const div = state.divisions[divisionId];
    if (!div) return;

    const divisions = {
      ...state.divisions,
      [divisionId]: {
        ...div,
        format,
      },
    };

    setStore({ divisions });
    await set(IDB_KEY_DIVISIONS, divisions);

    if (!isVitest && state.activeTournamentId) {
      try {
        await updateDivisionApi(divisionId, { format });
        await getStore().syncFromMySql();
      } catch (err) {
        console.warn('Gagal menyinkronkan format divisi ke MySQL:', err);
      }
    }
  },

  clearDivision: async (divisionId) => {
    const state = getStore();
    const div = state.divisions[divisionId];
    if (!div) return;

    const athletes = { ...state.athletes };
    div.athleteIds.forEach((athId) => {
      delete athletes[athId];
    });

    const bouts = { ...state.bouts };
    Object.keys(bouts).forEach((boutId) => {
      if (bouts[boutId].divisionId === divisionId) {
        delete bouts[boutId];
      }
    });

    const divisions = { ...state.divisions };
    delete divisions[divisionId];

    const nextSelected = Object.keys(divisions)[0] || null;

    setStore({ athletes, divisions, bouts, selectedDivisionId: nextSelected });

    await Promise.all([
      set(IDB_KEY_ATHLETES, athletes),
      set(IDB_KEY_DIVISIONS, divisions),
      set(IDB_KEY_BOUTS, bouts),
      set(IDB_KEY_SELECTED_DIV, nextSelected),
    ]);

    if (!isVitest && state.activeTournamentId) {
      try {
        await deleteDivisionApi(divisionId);
        await getStore().syncFromMySql();
      } catch (err) {
        console.warn('Gagal menghapus divisi dari MySQL:', err);
      }
    }
  },

  resetTournament: async () => {
    const state = getStore();
    if (!isVitest && state.activeTournamentId) {
      try {
        await deleteTournamentApi(state.activeTournamentId);
        await getStore().syncFromMySql();
        return;
      } catch (err) {
        console.warn('Fallback ke reset lokal:', err);
      }
    }

    setStore({
      athletes: {},
      divisions: {},
      bouts: {},
      orderOfBouts: [],
      selectedDivisionId: null,
    });

    await Promise.all([
      del(IDB_KEY_ATHLETES),
      del(IDB_KEY_DIVISIONS),
      del(IDB_KEY_BOUTS),
      del(IDB_KEY_ORDER_OF_BOUTS),
      del(IDB_KEY_SELECTED_DIV),
    ]);
  },

  performDrawOnly: async (divisionId, options) => {
    const state = getStore();
    if (!isVitest && state.activeTournamentId) {
      try {
        await performDrawApi(divisionId, options);
        await getStore().syncFromMySql();
        return;
      } catch (err) {
        console.warn('Fallback ke draw lokal:', err);
      }
    }

    const div = state.divisions[divisionId];
    if (!div) return;

    const divAthletes = div.athleteIds
      .map((id) => state.athletes[id])
      .filter((a): a is Athlete => Boolean(a));

    const drawn = generateOfficialDraw(divAthletes, options);

    const athletes = { ...state.athletes };
    drawn.forEach((d) => {
      athletes[d.id] = d;
    });

    setStore({ athletes });
    await set(IDB_KEY_ATHLETES, athletes);
  },

  setAthleteDrawNumber: async (athleteId, drawNumber) => {
    const state = getStore();
    const current = state.athletes[athleteId];
    if (!current) return;

    const updatedAthlete: Athlete = {
      ...current,
      drawNumber,
    };

    const athletes = {
      ...state.athletes,
      [athleteId]: updatedAthlete,
    };

    setStore({ athletes });
    await set(IDB_KEY_ATHLETES, athletes);
  },

  setDivisionDrawDraft: async (assignments) => {
    const state = getStore();
    const athletes = { ...state.athletes };
    for (const item of assignments) {
      const current = athletes[item.athleteId];
      if (current) {
        athletes[item.athleteId] = {
          ...current,
          drawNumber: item.drawNumber === null ? undefined : item.drawNumber,
        };
      }
    }
    setStore({ athletes });
    await set(IDB_KEY_ATHLETES, athletes);
  },

  saveDivisionDrawAssignments: async (divisionId, assignments) => {
    const state = getStore();
    const div = state.divisions[divisionId];
    if (!div) {
      return { ok: false, target: 'LOCAL', error: 'Divisi tidak ditemukan' };
    }

    const athletes = { ...state.athletes };
    for (const item of assignments) {
      const current = athletes[item.athleteId];
      if (current) {
        athletes[item.athleteId] = {
          ...current,
          drawNumber: item.drawNumber === null ? undefined : item.drawNumber,
        };
      }
    }

    setStore({ athletes });
    await set(IDB_KEY_ATHLETES, athletes);

    if (!isVitest && state.activeTournamentId) {
      try {
        const res = await manualSwapDrawApi(divisionId, { assignments });
        // Sinkronkan tepat sesuai nilai yang dikembalikan MySQL
        const latestAthletes = { ...getStore().athletes };
        for (const srvAth of res.athletes) {
          if (latestAthletes[srvAth.id]) {
            latestAthletes[srvAth.id] = {
              ...latestAthletes[srvAth.id],
              drawNumber: srvAth.drawNumber ?? undefined,
            };
          }
        }
        setStore({ athletes: latestAthletes });
        await set(IDB_KEY_ATHLETES, latestAthletes);
        return { ok: true, target: 'MYSQL' };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Gagal menghubungi server MySQL';
        console.warn('Gagal menyimpan undian manual ke MySQL:', err);
        return { ok: false, target: 'LOCAL', error: message };
      }
    }

    return { ok: true, target: 'LOCAL' };
  },

  clearDivisionDrawNumbers: async (divisionId) => {
    const state = getStore();
    const div = state.divisions[divisionId];
    if (!div || div.isDrawLocked) return;

    const clearAssignments = div.athleteIds.map((athleteId) => ({
      athleteId,
      drawNumber: null,
    }));

    await getStore().saveDivisionDrawAssignments(divisionId, clearAssignments);
  },

  swapDrawNumbers: async (athId1, athId2) => {
    const state = getStore();
    const a1 = state.athletes[athId1];
    const a2 = state.athletes[athId2];
    if (!a1 || !a2) return;

    const divisionId =
      state.selectedDivisionId ||
      Object.values(state.divisions).find((d) =>
        d.athleteIds.includes(athId1)
      )?.id;

    if (divisionId) {
      await getStore().saveDivisionDrawAssignments(divisionId, [
        { athleteId: athId1, drawNumber: a2.drawNumber ?? null },
        { athleteId: athId2, drawNumber: a1.drawNumber ?? null },
      ]);
      return;
    }

    const tempDraw = a1.drawNumber;
    const athletes = {
      ...state.athletes,
      [athId1]: { ...a1, drawNumber: a2.drawNumber },
      [athId2]: { ...a2, drawNumber: tempDraw },
    };

    setStore({ athletes });
    await set(IDB_KEY_ATHLETES, athletes);
  },

  lockAndGenerateBracket: async (divisionId, options) => {
    const state = getStore();
    const div = state.divisions[divisionId];
    if (!div) return;

    if (!isVitest && state.activeTournamentId) {
      try {
        await generateBracketApi(divisionId, {
          separateSameRegion: options?.separateSameRegion,
          format: div.format,
        });
        await getStore().syncFromMySql();
        return;
      } catch (err) {
        console.warn('Fallback ke lockAndGenerateBracket lokal:', err);
      }
    }

    let divAthletes = div.athleteIds
      .map((id) => state.athletes[id])
      .filter((a): a is Athlete => Boolean(a));

    const hasDraw = divAthletes.every((a) => a.drawNumber && a.drawNumber > 0);
    if (!hasDraw) {
      divAthletes = generateOfficialDraw(divAthletes, options);
    }

    const athletes = { ...state.athletes };
    divAthletes.forEach((d) => {
      athletes[d.id] = d;
    });

    const generatedBouts = generateDivisionBouts(div, divAthletes);

    const bouts = { ...state.bouts };
    Object.keys(bouts).forEach((bId) => {
      if (bouts[bId].divisionId === divisionId) {
        delete bouts[bId];
      }
    });

    generatedBouts.forEach((b) => {
      bouts[b.id] = b;
    });

    const divisions = {
      ...state.divisions,
      [divisionId]: {
        ...div,
        isDrawLocked: true,
      },
    };

    setStore({ athletes, divisions, bouts });

    await Promise.all([
      set(IDB_KEY_ATHLETES, athletes),
      set(IDB_KEY_DIVISIONS, divisions),
      set(IDB_KEY_BOUTS, bouts),
    ]);
  },

  unlockAndResetBracket: async (divisionId) => {
    const state = getStore();
    if (!isVitest && state.activeTournamentId) {
      try {
        await unlockBracketApi(divisionId, true);
        await getStore().syncFromMySql();
        return;
      } catch (err) {
        console.warn('Fallback ke unlockAndResetBracket lokal:', err);
      }
    }

    const div = state.divisions[divisionId];
    if (!div) return;

    const bouts = { ...state.bouts };
    Object.keys(bouts).forEach((bId) => {
      if (bouts[bId].divisionId === divisionId) {
        delete bouts[bId];
      }
    });

    const divisions = {
      ...state.divisions,
      [divisionId]: {
        ...div,
        isDrawLocked: false,
      },
    };

    setStore({ divisions, bouts });

    await Promise.all([
      set(IDB_KEY_DIVISIONS, divisions),
      set(IDB_KEY_BOUTS, bouts),
    ]);
  },

  recordBoutResult: async (boutId, result) => {
    const state = getStore();
    if (!isVitest && state.activeTournamentId) {
      try {
        await completeBoutApi(boutId, {
          winnerCorner: result.winnerCorner,
          victoryType: result.victoryType,
          redScore: result.redScore,
          blueScore: result.blueScore,
        });
        await getStore().syncFromMySql();
        return;
      } catch (err) {
        console.warn('Fallback ke recordBoutResult lokal:', err);
      }
    }

    const currentBout = state.bouts[boutId];
    if (!currentBout) return;

    const divisionId = currentBout.divisionId;
    const allDivBouts = Object.values(state.bouts).filter(
      (b) => b.divisionId === divisionId
    );

    const advancedBouts = advanceBoutResult(allDivBouts, boutId, result);

    const bouts = { ...state.bouts };
    advancedBouts.forEach((b) => {
      bouts[b.id] = b;
    });

    setStore({ bouts });
    await set(IDB_KEY_BOUTS, bouts);
  },

  getDivisionBouts: (divisionId) => {
    const state = getStore();
    return Object.values(state.bouts)
      .filter((b) => b.divisionId === divisionId)
      .sort((a, b) => {
        if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
        return a.bracketPosition - b.bracketPosition;
      });
  },

  generateMasterOrderOfBouts: async () => {
    const state = getStore();
    if (!isVitest && state.activeTournamentId) {
      try {
        await generateScheduleApi(state.activeTournamentId);
        await getStore().syncFromMySql();
        return;
      } catch (err) {
        console.warn('Fallback ke generateMasterOrderOfBouts lokal:', err);
      }
    }

    const allBouts = Object.values(state.bouts);
    if (allBouts.length === 0) return;

    const sorted = [...allBouts].sort((a, b) => {
      if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
      const matCompare = (a.matName || 'MAT A').localeCompare(b.matName || 'MAT A');
      if (matCompare !== 0) return matCompare;
      return a.bracketPosition - b.bracketPosition;
    });

    const orderOfBouts = sorted.map((b) => b.id);
    const bouts = { ...state.bouts };

    const matCounters: Record<string, number> = {};
    orderOfBouts.forEach((id) => {
      const b = bouts[id];
      if (!b) return;
      const m = b.matName || 'MAT A';
      matCounters[m] = (matCounters[m] || 0) + 1;
      b.boutNumber = matCounters[m];
    });

    setStore({ bouts, orderOfBouts });
    await Promise.all([
      set(IDB_KEY_BOUTS, bouts),
      set(IDB_KEY_ORDER_OF_BOUTS, orderOfBouts),
    ]);
  },

  reorderBout: async (sourceIndex, destinationIndex) => {
    const state = getStore();
    const newOrder = [...state.orderOfBouts];
    if (
      sourceIndex < 0 ||
      sourceIndex >= newOrder.length ||
      destinationIndex < 0 ||
      destinationIndex >= newOrder.length
    ) {
      return;
    }

    const [removed] = newOrder.splice(sourceIndex, 1);
    newOrder.splice(destinationIndex, 0, removed);

    const bouts = { ...state.bouts };
    const matCounters: Record<string, number> = {};
    newOrder.forEach((id) => {
      const b = bouts[id];
      if (!b) return;
      const m = b.matName || 'MAT A';
      matCounters[m] = (matCounters[m] || 0) + 1;
      b.boutNumber = matCounters[m];
    });

    setStore({ bouts, orderOfBouts: newOrder });
    await Promise.all([
      set(IDB_KEY_BOUTS, bouts),
      set(IDB_KEY_ORDER_OF_BOUTS, newOrder),
    ]);

    if (!isVitest && state.activeTournamentId) {
      reorderBoutsApi(state.activeTournamentId, {
        bouts: newOrder.map((id) => ({
          id,
          boutNumber: bouts[id]?.boutNumber ?? null,
          matName: bouts[id]?.matName,
        })),
      }).catch(() => {});
    }
  },

  setBoutMat: async (boutId, matName) => {
    const state = getStore();
    const b = state.bouts[boutId];
    if (!b) return;

    const bouts = {
      ...state.bouts,
      [boutId]: { ...b, matName },
    };

    const matCounters: Record<string, number> = {};
    state.orderOfBouts.forEach((id) => {
      const bout = bouts[id];
      if (!bout) return;
      const m = bout.matName || 'MAT A';
      matCounters[m] = (matCounters[m] || 0) + 1;
      bout.boutNumber = matCounters[m];
    });

    setStore({ bouts });
    await set(IDB_KEY_BOUTS, bouts);

    if (!isVitest && state.activeTournamentId) {
      reorderBoutsApi(state.activeTournamentId, {
        bouts: [
          {
            id: boutId,
            matName,
            boutNumber: bouts[boutId]?.boutNumber ?? null,
          },
        ],
      }).catch(() => {});
    }
  },

  setBoutStatus: async (boutId, status) => {
    const state = getStore();
    const b = state.bouts[boutId];
    if (!b) return;

    const bouts = {
      ...state.bouts,
      [boutId]: { ...b, status },
    };

    setStore({ bouts });
    await set(IDB_KEY_BOUTS, bouts);

    if (!isVitest && state.activeTournamentId) {
      reorderBoutsApi(state.activeTournamentId, {
        bouts: [{ id: boutId, status }],
      }).catch(() => {});
    }
  },

  loadBoutToMatch: (boutId) => {
    const state = getStore();
    const bout = state.bouts[boutId];
    if (!bout) return;

    const div = state.divisions[bout.divisionId];
    const redAth = bout.redAthleteId ? state.athletes[bout.redAthleteId] : null;
    const blueAth = bout.blueAthleteId ? state.athletes[bout.blueAthleteId] : null;

    const mat = bout.matName || state.activeMat || 'MAT A';
    const remainingOnMat = getOrderedBoutsForMat(state.bouts, state.orderOfBouts, mat);

    const currentIndex = remainingOnMat.findIndex((b) => b.id === boutId);
    let nextBoutOnDeck: TournamentBout | null = null;

    if (currentIndex >= 0 && currentIndex + 1 < remainingOnMat.length) {
      for (let i = currentIndex + 1; i < remainingOnMat.length; i++) {
        const candidate = remainingOnMat[i];
        if (candidate.status === 'SCHEDULED' || candidate.status === 'ON_DECK') {
          nextBoutOnDeck = candidate;
          break;
        }
      }
    }

    const effectiveBoutNumber =
      bout.boutNumber && bout.boutNumber > 0
        ? bout.boutNumber
        : Math.max(1, currentIndex + 1);

    const bouts = { ...state.bouts };
    bouts[boutId] = {
      ...bout,
      boutNumber: effectiveBoutNumber,
      status: 'IN_PROGRESS',
    };

    if (nextBoutOnDeck && nextBoutOnDeck.status === 'SCHEDULED') {
      bouts[nextBoutOnDeck.id] = { ...nextBoutOnDeck, status: 'ON_DECK' };
    }

    setStore({ bouts });
    set(IDB_KEY_BOUTS, bouts).catch(() => {});

    let nextPreview = null;
    if (nextBoutOnDeck) {
      const nextDiv = state.divisions[nextBoutOnDeck.divisionId];
      const nextRed = nextBoutOnDeck.redAthleteId
        ? state.athletes[nextBoutOnDeck.redAthleteId]
        : null;
      const nextBlue = nextBoutOnDeck.blueAthleteId
        ? state.athletes[nextBoutOnDeck.blueAthleteId]
        : null;

      nextPreview = {
        boutNumber: nextBoutOnDeck.boutNumber,
        divisionLabel: `${nextDiv?.style || ''} ${nextDiv?.weightClass || ''} • ${nextBoutOnDeck.round.replace('_', ' ')}`,
        redName: nextRed?.name || nextBoutOnDeck.redSourceLabel || 'TBD',
        redRegion: nextRed?.regionCode || 'RED',
        blueName: nextBlue?.name || nextBoutOnDeck.blueSourceLabel || 'TBD',
        blueRegion: nextBlue?.regionCode || 'BLUE',
      };
    }

    const formattedBoutNumber = `BOUT ${effectiveBoutNumber}`;
    useMatchStore.getState().loadBoutData({
      boutId,
      matName: mat,
      boutNumber: formattedBoutNumber,
      style: div?.style || 'FS',
      ageCategory: div?.ageCategory || 'SENIOR',
      weightClass: div?.weightClass || '74 KG',
      round: bout.round,
      redName: redAth?.name || 'RED WRESTLER',
      redRegion: redAth?.regionCode || 'RED',
      blueName: blueAth?.name || 'BLUE WRESTLER',
      blueRegion: blueAth?.regionCode || 'BLUE',
      nextBoutPreview: nextPreview,
    });

    if (!isVitest && state.activeTournamentId) {
      loadBoutToSessionApi(boutId, { matName: mat, forceReplace: true })
        .then(({ matchState }) => {
          const hasDigits = /\d/.test(matchState.metadata.boutNumber || '');
          useMatchStore.getState().setMatchState(
            hasDigits
              ? matchState
              : {
                  ...matchState,
                  metadata: {
                    ...matchState.metadata,
                    boutNumber: formattedBoutNumber,
                  },
                }
          );
        })
        .catch(() => {});
    }
  },

  completeBout: async (boutId, result) => {
    const state = getStore();
    const bout = state.bouts[boutId];
    if (!bout) return;

    await getStore().recordBoutResult(boutId, result);

    const updatedState = getStore();
    const completedBout = updatedState.bouts[boutId];
    if (!completedBout) return;

    const mat = completedBout.matName || 'MAT A';
    const boutsOnMat = getOrderedBoutsForMat(
      updatedState.bouts,
      updatedState.orderOfBouts,
      mat
    );

    const bouts = { ...updatedState.bouts };
    const nextScheduled = boutsOnMat.find((b) => b.status === 'SCHEDULED');
    if (nextScheduled) {
      bouts[nextScheduled.id] = { ...nextScheduled, status: 'ON_DECK' };
      setStore({ bouts });
      await set(IDB_KEY_BOUTS, bouts);
    }
  },

  saveAndLoadNextBout: async () => {
    const matchStore = useMatchStore.getState();
    const match = matchStore.match;
    const state = getStore();
    const mat = match.metadata.matName || state.activeMat || 'MAT A';
    const activeBoutId = match.activeBoutId || null;

    if (activeBoutId && state.bouts[activeBoutId]) {
      const currentBout = state.bouts[activeBoutId];
      if (currentBout.status !== 'COMPLETED') {
        const hasOutcomeOrActivity =
          Boolean(match.winner) ||
          match.red.score !== match.blue.score ||
          match.events.length > 0;

        if (hasOutcomeOrActivity) {
          if (!match.winner) {
            saveMatchToHistory(match);
          }

          const suggested = matchStore.getSuggestedVictory();
          const winnerCorner =
            match.winner?.corner ||
            suggested?.corner ||
            (match.red.score >= match.blue.score ? 'RED' : 'BLUE');
          const victoryType =
            match.winner?.type ||
            suggested?.type ||
            ((winnerCorner === 'RED' ? match.blue.score : match.red.score) === 0
              ? 'VPO'
              : 'VPO1');

          const winnerAthleteId =
            winnerCorner === 'RED'
              ? currentBout.redAthleteId || 'RED'
              : currentBout.blueAthleteId || 'BLUE';
          const loserAthleteId =
            winnerCorner === 'RED'
              ? currentBout.blueAthleteId || 'BLUE'
              : currentBout.redAthleteId || 'RED';

          const cp = getClassificationPoints(victoryType);
          const result: BoutResult = {
            winnerCorner,
            winnerAthleteId,
            loserAthleteId,
            redScore: match.red.score,
            blueScore: match.blue.score,
            victoryType,
            redClassificationPts: winnerCorner === 'RED' ? cp.winner : cp.loser,
            blueClassificationPts: winnerCorner === 'BLUE' ? cp.winner : cp.loser,
            completedAt: Date.now(),
          };

          await getStore().completeBout(activeBoutId, result);
        } else {
          // Partai 0-0 tanpa event dan belum ada pemenang: kembalikan ke SCHEDULED agar tidak hilang
          await getStore().cancelCurrentBout(activeBoutId);
        }
      }
    }

    const freshState = getStore();
    const matQueue = getOrderedBoutsForMat(
      freshState.bouts,
      freshState.orderOfBouts,
      mat
    ).filter(
      (b) =>
        b.id !== activeBoutId &&
        b.status !== 'COMPLETED' &&
        b.status !== 'TBD' &&
        Boolean(b.redAthleteId && b.blueAthleteId)
    );

    const nextBout =
      matQueue.find((b) => b.status === 'ON_DECK') ||
      matQueue.find((b) => b.status === 'SCHEDULED') ||
      matQueue[0];

    if (nextBout) {
      getStore().loadBoutToMatch(nextBout.id);
      return { loadedNext: true, nextBoutId: nextBout.id };
    }

    // Jika tidak ada lagi partai antrean pada matras ini, gunakan fallback standalone
    matchStore.saveAndNextBout();
    return { loadedNext: false };
  },

  cancelCurrentBout: async (boutId) => {
    const state = getStore();
    const bout = state.bouts[boutId];
    if (!bout) return;

    const bouts = {
      ...state.bouts,
      [boutId]: { ...bout, status: 'SCHEDULED' as BoutStatus },
    };

    setStore({ bouts });
    await set(IDB_KEY_BOUTS, bouts);

    if (!isVitest && state.activeTournamentId) {
      reorderBoutsApi(state.activeTournamentId, {
        bouts: [{ id: boutId, status: 'SCHEDULED' }],
      }).catch(() => {});
    }
  },

  exportTournamentBackup: async () => {
    const state = getStore();
    let backupData: unknown;

    if (!isVitest && state.activeTournamentId) {
      backupData = await exportTournamentBackupApi(state.activeTournamentId);
    } else {
      backupData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        tournament: {
          id: state.activeTournamentId || 'local-tournament',
          name: state.tournamentName,
          status: 'ACTIVE',
        },
        divisions: Object.values(state.divisions),
        athletes: Object.values(state.athletes),
        bouts: Object.values(state.bouts),
      };
    }

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uww-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  restoreTournamentBackup: async (backupPayload) => {
    await restoreTournamentBackupApi(backupPayload);
    await getStore().syncFromMySql();
  },
}));
