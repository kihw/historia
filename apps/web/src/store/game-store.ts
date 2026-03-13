import { create } from "zustand";
import type { GameState, GameEvent, TurnHistoryEntry } from "@historia/shared";

interface GameStore {
  game: GameState | null;
  gameId: string | null;
  playerNation: string | null;
  selectedProvince: string | null;
  eventLog: EventLogEntry[];
  turnHistory: TurnHistoryEntry[];
  loading: boolean;
  error: string | null;

  setGame: (gameId: string, game: GameState, playerNation: string) => void;
  updateGame: (game: GameState) => void;
  selectProvince: (provinceId: string | null) => void;
  addEvents: (events: GameEvent[]) => void;
  addLogEntry: (entry: EventLogEntry) => void;
  setTurnHistory: (history: TurnHistoryEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export interface EventLogEntry {
  id: string;
  type: "command" | "narrative" | "event" | "system";
  text: string;
  descriptionKey?: string;
  descriptionParams?: Record<string, string | number>;
  turn?: number;
  timestamp: number;
}

export const useGameStore = create<GameStore>((set) => ({
  game: null,
  gameId: null,
  playerNation: null,
  selectedProvince: null,
  eventLog: [],
  turnHistory: [],
  loading: false,
  error: null,

  setGame: (gameId, game, playerNation) =>
    set({
      gameId,
      game,
      playerNation,
      turnHistory: [],
      eventLog: [
        {
          id: "init",
          type: "system",
          text: `Game started. Playing as ${game.nations[playerNation]?.name ?? playerNation}.`,
          descriptionKey: "game.game_started_as",
          descriptionParams: { nation: game.nations[playerNation]?.name ?? playerNation },
          turn: 0,
          timestamp: Date.now(),
        },
      ],
    }),

  updateGame: (game) => set({ game }),

  selectProvince: (provinceId) => set({ selectedProvince: provinceId }),

  addEvents: (events) =>
    set((state) => ({
      eventLog: [
        ...state.eventLog,
        ...events.map((e) => ({
          id: e.id,
          type: "event" as const,
          text: e.description,
          descriptionKey: e.descriptionKey,
          descriptionParams: e.descriptionParams,
          turn: e.turn,
          timestamp: Date.now(),
        })),
      ],
    })),

  addLogEntry: (entry) =>
    set((state) => ({ eventLog: [...state.eventLog, entry] })),

  setTurnHistory: (history) => set({ turnHistory: history }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),
}));
