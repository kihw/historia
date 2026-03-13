import type { GameState, ParsedAction, GameEvent, TurnHistoryEntry, DiplomaticMessage, TurnDuration, CountryIndexEntry } from "@historia/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export interface CommandResult {
  message: string;
  actions: ParsedAction[];
  warnings: string[];
  pendingCount: number;
}

export interface TurnResult {
  turn: number;
  date: { year: number; month: number };
  events: GameEvent[];
  narrative: string;
  game: GameState;
  history: TurnHistoryEntry[];
}

export const api = {
  listScenarios: () =>
    request<{
      scenarios: { id: string; name: string; era: string; description: string }[];
    }>("/scenarios"),

  listGames: () =>
    request<{
      games: { id: string; turn: number; date: { year: number; month: number }; nations: string[]; scenarioId: string }[];
    }>("/games"),

  getGame: (id: string, nationId?: string) =>
    request<{ game: GameState }>(`/games/${id}${nationId ? `?nationId=${encodeURIComponent(nationId)}` : ""}`),

  deleteGame: (id: string) =>
    request<{ success: boolean }>(`/games/${id}`, { method: "DELETE" }),

  createGame: (scenarioId: string, nationId?: string) =>
    request<{ gameId: string; game: GameState; nationId?: string }>("/games", {
      method: "POST",
      body: JSON.stringify({ scenarioId, nationId }),
    }),

  submitCommand: (gameId: string, nationId: string, command: string) =>
    request<CommandResult>(`/games/${gameId}/command`, {
      method: "POST",
      body: JSON.stringify({ nationId, command }),
    }),

  submitTurn: (gameId: string, nationId: string, actions?: ParsedAction[]) =>
    request<TurnResult>(`/games/${gameId}/turn`, {
      method: "POST",
      body: JSON.stringify({ nationId, actions: actions ?? [] }),
    }),

  getAdvice: (gameId: string, nationId: string, question: string) =>
    request<{ advice: string }>(`/games/${gameId}/advice`, {
      method: "POST",
      body: JSON.stringify({ nationId, question }),
    }),

  getHistory: (gameId: string) =>
    request<{ history: TurnHistoryEntry[] }>(`/games/${gameId}/history`),

  // LLM configuration
  getLLMStatus: () =>
    request<{ configured: boolean; provider: string | null; name: string | null }>("/llm/status"),

  configureLLM: (config: { provider: string; apiKey?: string; model?: string; baseUrl?: string }) =>
    request<{ success: boolean; provider: string; name: string }>("/llm/configure", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  testLLM: (config: { provider: string; apiKey?: string; model?: string; baseUrl?: string }) =>
    request<{ success: boolean; provider: string; name: string; response: string }>("/llm/test", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  // Country index (lobby)
  listCountries: () =>
    request<{ countries: CountryIndexEntry[] }>("/countries"),

  // Game settings
  setGameSpeed: (gameId: string, turnDuration: TurnDuration) =>
    request<{ success: boolean; turnDuration: TurnDuration }>(`/games/${gameId}/settings`, {
      method: "PATCH",
      body: JSON.stringify({ turnDuration }),
    }),

  // Diplomatic chat
  getDiplomacyChat: (gameId: string, nationA: string, nationB: string) =>
    request<{ messages: DiplomaticMessage[] }>(
      `/games/${gameId}/diplomacy/chat?nationA=${encodeURIComponent(nationA)}&nationB=${encodeURIComponent(nationB)}`
    ),

  sendDiplomacyMessage: (gameId: string, playerNationId: string, targetNationId: string, message: string) =>
    request<{ playerMessage: DiplomaticMessage; response: DiplomaticMessage }>(
      `/games/${gameId}/diplomacy/chat`,
      {
        method: "POST",
        body: JSON.stringify({ playerNationId, targetNationId, message }),
      }
    ),
};
