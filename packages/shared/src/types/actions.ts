export type ParsedAction =
  | DiplomacyAction
  | MilitaryAction
  | EconomyAction
  | InternalAction
  | EspionageAction;

export interface DiplomacyAction {
  type: "diplomacy";
  subtype:
    | "declare_war"
    | "propose_alliance"
    | "propose_peace"
    | "propose_trade"
    | "break_alliance"
    | "send_message"
    | "insult"
    | "improve_relations"
    | "royal_marriage";
  target: string;
  terms?: Record<string, unknown>;
}

export interface MilitaryAction {
  type: "military";
  subtype: "move_army" | "recruit" | "disband" | "siege" | "merge" | "split";
  armyId?: string;
  target?: string;
  units?: Partial<{
    infantry: number;
    cavalry: number;
    artillery: number;
  }>;
}

export interface EconomyAction {
  type: "economy";
  subtype:
    | "set_tax"
    | "build"
    | "invest"
    | "trade_route"
    | "embargo"
    | "nationalize";
  province?: string;
  value?: number;
  building?: string;
}

export interface InternalAction {
  type: "internal";
  subtype:
    | "reform"
    | "suppress_revolt"
    | "change_government"
    | "enact_policy"
    | "research";
  target?: string;
  value?: string;
}

export interface EspionageAction {
  type: "espionage";
  subtype:
    | "spy_on"
    | "sabotage"
    | "steal_tech"
    | "sow_discord"
    | "assassinate"
    | "counter_intel";
  target: string;
  province?: string;
}

export interface PlayerCommand {
  playerId: string;
  nationId: string;
  rawCommand: string;
  timestamp: number;
}

export interface CommandInterpreterResult {
  actions: ParsedAction[];
  confidence: number;
  clarification?: string;
  warnings?: string[];
}
