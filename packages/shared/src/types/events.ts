import type { GameDate } from "./game-state.js";

export interface GameEvent {
  id: string;
  type: GameEventType;
  turn: number;
  date: GameDate;
  source: EventSource;
  data: Record<string, unknown>;
  description: string;
  descriptionKey?: string;
  descriptionParams?: Record<string, string | number>;
  affectedNations: string[];
}

export type GameEventType =
  | "war_declared"
  | "peace_signed"
  | "treaty_signed"
  | "treaty_broken"
  | "alliance_formed"
  | "battle_fought"
  | "province_conquered"
  | "revolt"
  | "revolution"
  | "election"
  | "leader_death"
  | "economy_crisis"
  | "economy_boom"
  | "trade_agreement"
  | "embargo_imposed"
  | "embargo_lifted"
  | "diplomacy_failed"
  | "natural_disaster"
  | "technology_discovered"
  | "building_completed"
  | "espionage"
  | "historical_event"
  | "custom";

export type EventSource = "engine" | "llm" | "player" | "scenario";

export interface CausalGraphNode {
  id: string;
  name: string;
  description: string;
  type: "historical" | "conditional" | "consequence" | "random";
  scheduledDate?: GameDate;
  triggerWindow?: {
    earliest: GameDate;
    latest: GameDate;
  };
  conditions: EventCondition[];
  preventionConditions?: PreventionCondition[];
  effects: EventEffect[];
  narrativePrompt?: string;
}

export interface CausalGraphEdge {
  from: string;
  to: string;
  type: "triggers" | "enables" | "blocks";
  delay?: { months: number };
}

export interface CausalGraph {
  nodes: CausalGraphNode[];
  edges: CausalGraphEdge[];
}

export type EventCondition =
  | { type: "nation_exists"; nation: string }
  | { type: "relation_below"; nationA: string; nationB: string; threshold: number }
  | { type: "relation_above"; nationA: string; nationB: string; threshold: number }
  | { type: "stability_below"; nation: string; threshold: number }
  | { type: "at_war"; nation: string }
  | { type: "not_at_war"; nation: string }
  | { type: "event_occurred"; event: string }
  | { type: "date_reached"; date: GameDate }
  | { type: "province_owned_by"; province: string; nation: string }
  | { type: "alliance_includes"; nations: string[]; minMembers: number }
  | { type: "army_in_province"; province: string; minStrength: number; ownerNot?: string };

export interface PreventionCondition {
  description: string;
  conditions: EventCondition[];
  difficulty: number;
}

export type EventEffect =
  | { type: "annex_province"; from: string; to: string; provinces: string[] }
  | { type: "annex"; annexer: string; annexed: string }
  | { type: "annex_nation"; annexer: string; annexed: string }
  | { type: "start_war"; attacker: string; defender: string; warName?: string }
  | { type: "end_war"; warId: string }
  | { type: "destroy_nation"; nation: string }
  | { type: "modify_relation"; nations: string[]; target: string; delta: number }
  | { type: "modify_stat"; nations: string[]; stat: string; delta: number }
  | { type: "trigger_event"; event: string }
  | { type: "spawn_army"; nation: string; province: string; units: Record<string, number> }
  | { type: "change_government"; nation: string; government: string }
  | { type: "create_nation"; nation: Record<string, unknown> };
