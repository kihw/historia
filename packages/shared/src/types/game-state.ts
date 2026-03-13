import type { Nation } from "./nation.js";
import type { Province } from "./map.js";
import type { DeterminismConfig } from "./scenario.js";
import type { GameEvent, CausalGraph } from "./events.js";

export interface GameDate {
  year: number;
  month: number;
  day?: number;
}

export interface GameState {
  gameId: string;
  scenarioId: string;
  currentTurn: number;
  currentDate: GameDate;
  turnDuration: TurnDuration;
  determinism: DeterminismConfig;
  nations: Record<string, Nation>;
  provinces: Record<string, Province>;
  activeWars: War[];
  activeTreaties: Treaty[];
  pendingEvents: string[];
  occurredEvents: string[];
  causalGraph?: CausalGraph;
  globalModifiers: GlobalModifier[];
}

export type TurnDuration =
  | "1_week"
  | "1_month"
  | "3_months"
  | "6_months"
  | "1_year";

export interface War {
  id: string;
  name: string;
  attackers: string[];
  defenders: string[];
  startTurn: number;
  startDate: GameDate;
  warScore: number;
  battles: BattleRecord[];
}

export interface BattleRecord {
  id: string;
  turn: number;
  province: string;
  attacker: string;
  defender: string;
  attackerLosses: number;
  defenderLosses: number;
  winner: string;
}

export interface Treaty {
  id: string;
  type: TreatyType;
  parties: string[];
  startTurn: number;
  endTurn?: number;
  terms: Record<string, unknown>;
}

export type TreatyType =
  | "alliance"
  | "defensive_pact"
  | "trade_agreement"
  | "non_aggression"
  | "peace"
  | "vassalage"
  | "royal_marriage";

export interface GlobalModifier {
  id: string;
  name: string;
  effects: Record<string, number>;
  startTurn: number;
  endTurn?: number;
}

export interface StateDelta {
  turn: number;
  nationChanges: Record<string, Partial<Nation>>;
  provinceChanges: Record<string, Partial<Province>>;
  newWars: War[];
  endedWars: string[];
  newTreaties: Treaty[];
  endedTreaties: string[];
  events: GameEvent[];
}

export interface TurnResult {
  newState: GameState;
  delta: StateDelta;
  events: GameEvent[];
  narratives: Record<string, string>;
  globalNarrative: string;
}

export interface TurnHistoryEntry {
  turn: number;
  date: GameDate;
  delta: StateDelta;
  narrative: string;
  events: GameEvent[];
}
