import type { NationTechState } from "./technology.js";

export interface Nation {
  id: string;
  name: string;
  tag: string;
  color: string;
  flag?: string;
  government: GovernmentType;
  ruler: Ruler;
  capital: string;
  provinces: string[];
  economy: NationEconomy;
  military: NationMilitary;
  diplomacy: NationDiplomacy;
  population: NationPopulation;
  technology?: NationTechState;
  aiPersonality?: AIPersonality;
  playable: boolean;
}

export type GovernmentType =
  | "feudal_monarchy"
  | "absolute_monarchy"
  | "constitutional_monarchy"
  | "republic"
  | "theocracy"
  | "dictatorship"
  | "communist_state"
  | "tribal";

export interface Ruler {
  name: string;
  adminSkill: number;
  diplomacySkill: number;
  militarySkill: number;
  age: number;
  traits: string[];
}

export interface NationEconomy {
  treasury: number;
  taxRate: number;
  inflation: number;
  tradePower: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

export interface NationMilitary {
  armies: Army[];
  manpower: number;
  maxManpower: number;
  forceLimit: number;
  militaryTechnology: number;
}

export interface Army {
  id: string;
  name: string;
  location: string;
  units: ArmyUnits;
  morale: number;
  supply: number;
}

export interface ArmyUnits {
  infantry: number;
  cavalry: number;
  artillery: number;
}

export interface NationDiplomacy {
  relations: Record<string, number>;
  alliances: string[];
  rivals: string[];
  truces: Record<string, number>;
  royalMarriages: string[];
}

export interface NationPopulation {
  total: number;
  growthRate: number;
  stability: number;
  warExhaustion: number;
  culture: string;
  religion: string;
}

export interface AIPersonality {
  aggressiveness: number;
  diplomacyFocus: number;
  expansionDesire: number;
  historicalGoals: string[];
}
