import type { GameDate, TurnDuration } from "./game-state.js";
import type { Nation } from "./nation.js";
import type { MapConfig, Province } from "./map.js";
import type { CausalGraph } from "./events.js";

export interface Scenario {
  meta: ScenarioMeta;
  config: ScenarioConfig;
  map: ScenarioMap;
  nations: Nation[];
  events: ScenarioEvents;
  narrative: ScenarioNarrative;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  era: Era;
  startDate: GameDate;
  tags: string[];
  difficultySuggestion: Difficulty;
  recommendedPlayers: { min: number; max: number };
  thumbnail?: string;
}

export type Era =
  | "ancient"
  | "medieval"
  | "early_modern"
  | "industrial"
  | "modern"
  | "contemporary"
  | "fantasy"
  | "custom";

export type Difficulty = "easy" | "normal" | "hard" | "extreme";

export interface ScenarioConfig {
  determinism: DeterminismConfig;
  turnDuration: {
    default: TurnDuration;
    options: TurnDuration[];
  };
  victoryConditions: VictoryCondition[];
}

export interface DeterminismConfig {
  simulationIntensity: number;
  historicalConstraint: number;
  fantasyFreedom: number;
}

export interface VictoryCondition {
  type: "score" | "domination" | "technology" | "diplomacy" | "custom";
  description: string;
  endDate?: GameDate;
  threshold?: number;
}

export interface ScenarioMap extends MapConfig {
  provinces: Province[];
}

export interface ScenarioEvents {
  causalGraph: CausalGraph;
}

export interface ScenarioNarrative {
  introduction: string;
  style: NarrativeStyle;
  tone: "formal" | "casual" | "dramatic" | "humorous";
  vocabularyEra: string;
}

export type NarrativeStyle =
  | "historical_chronicle"
  | "news_broadcast"
  | "royal_court"
  | "war_report"
  | "diplomatic_cable";

/** Entry in the cross-scenario country index (for country-first lobby). */
export interface CountryIndexEntry {
  id: string;
  name: string;
  tag: string;
  color: string;
  capitalName: string;
  government: string;
  region: CountryRegion;
  eras: CountryEraInfo[];
}

export interface CountryEraInfo {
  scenarioId: string;
  scenarioName: string;
  era: Era;
  startYear: number;
  provinceCount: number;
  color: string;
}

export type CountryRegion =
  | "europe"
  | "middle_east"
  | "africa"
  | "central_asia"
  | "east_asia"
  | "south_asia"
  | "southeast_asia"
  | "americas"
  | "oceania"
  | "other";
