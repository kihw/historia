export interface TechTree {
  categories: TechCategory[];
}

export interface TechCategory {
  id: string;
  name: string;
  techs: Technology[];
}

export interface Technology {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: number;
  cost: number;
  prerequisites: string[];
  effects: TechEffect[];
}

export type TechEffect =
  | { type: "military_bonus"; stat: "infantry" | "cavalry" | "artillery" | "morale" | "supply"; value: number }
  | { type: "economy_bonus"; stat: "tax" | "production" | "trade" | "inflation"; value: number }
  | { type: "diplomacy_bonus"; stat: "relations" | "alliance_acceptance"; value: number }
  | { type: "population_bonus"; stat: "growth" | "stability" | "unrest_reduction"; value: number }
  | { type: "unlock_building"; building: string }
  | { type: "unlock_unit"; unit: string };

export interface NationTechState {
  researched: string[];
  currentResearch: string | null;
  researchProgress: number;
  researchPerTurn: number;
}

/**
 * Default tech tree covering the major eras.
 */
export const DEFAULT_TECH_TREE: TechTree = {
  categories: [
    {
      id: "military",
      name: "Military",
      techs: [
        {
          id: "mil_1", name: "Professional Soldiers", description: "Organized standing armies replace feudal levies.",
          category: "military", tier: 1, cost: 100, prerequisites: [],
          effects: [{ type: "military_bonus", stat: "infantry", value: 0.1 }],
        },
        {
          id: "mil_2", name: "Pike and Shot", description: "Combined infantry tactics with pikes and firearms.",
          category: "military", tier: 2, cost: 200, prerequisites: ["mil_1"],
          effects: [{ type: "military_bonus", stat: "infantry", value: 0.15 }, { type: "military_bonus", stat: "morale", value: 0.05 }],
        },
        {
          id: "mil_3", name: "Siege Engineering", description: "Advanced siege weaponry and fortification techniques.",
          category: "military", tier: 2, cost: 250, prerequisites: ["mil_1"],
          effects: [{ type: "military_bonus", stat: "artillery", value: 0.2 }],
        },
        {
          id: "mil_4", name: "Cavalry Doctrine", description: "Refined cavalry maneuvers and shock tactics.",
          category: "military", tier: 2, cost: 200, prerequisites: ["mil_1"],
          effects: [{ type: "military_bonus", stat: "cavalry", value: 0.2 }],
        },
        {
          id: "mil_5", name: "Line Infantry", description: "Disciplined formations with coordinated musket fire.",
          category: "military", tier: 3, cost: 350, prerequisites: ["mil_2"],
          effects: [{ type: "military_bonus", stat: "infantry", value: 0.2 }, { type: "military_bonus", stat: "morale", value: 0.1 }],
        },
      ],
    },
    {
      id: "economy",
      name: "Economy",
      techs: [
        {
          id: "eco_1", name: "Centralized Taxation", description: "Efficient tax collection across the realm.",
          category: "economy", tier: 1, cost: 100, prerequisites: [],
          effects: [{ type: "economy_bonus", stat: "tax", value: 0.1 }],
        },
        {
          id: "eco_2", name: "Guilds and Workshops", description: "Organized production boosting manufacturing output.",
          category: "economy", tier: 2, cost: 200, prerequisites: ["eco_1"],
          effects: [{ type: "economy_bonus", stat: "production", value: 0.15 }, { type: "unlock_building", building: "workshop" }],
        },
        {
          id: "eco_3", name: "Mercantile Networks", description: "Expanded trade routes and merchant guilds.",
          category: "economy", tier: 2, cost: 200, prerequisites: ["eco_1"],
          effects: [{ type: "economy_bonus", stat: "trade", value: 0.2 }],
        },
        {
          id: "eco_4", name: "Banking", description: "Financial institutions that reduce inflation and stabilize the economy.",
          category: "economy", tier: 3, cost: 300, prerequisites: ["eco_2", "eco_3"],
          effects: [{ type: "economy_bonus", stat: "inflation", value: -0.02 }, { type: "economy_bonus", stat: "tax", value: 0.1 }],
        },
      ],
    },
    {
      id: "governance",
      name: "Governance",
      techs: [
        {
          id: "gov_1", name: "Bureaucratic Reforms", description: "Professional administrators improve state efficiency.",
          category: "governance", tier: 1, cost: 100, prerequisites: [],
          effects: [{ type: "population_bonus", stat: "stability", value: 5 }],
        },
        {
          id: "gov_2", name: "Legal Code", description: "Written laws reduce unrest and improve stability.",
          category: "governance", tier: 2, cost: 200, prerequisites: ["gov_1"],
          effects: [{ type: "population_bonus", stat: "unrest_reduction", value: 0.1 }, { type: "population_bonus", stat: "stability", value: 3 }],
        },
        {
          id: "gov_3", name: "Diplomatic Corps", description: "Trained diplomats improve foreign relations.",
          category: "governance", tier: 2, cost: 200, prerequisites: ["gov_1"],
          effects: [{ type: "diplomacy_bonus", stat: "relations", value: 10 }, { type: "diplomacy_bonus", stat: "alliance_acceptance", value: -5 }],
        },
        {
          id: "gov_4", name: "National Census", description: "Accurate population tracking boosts growth and manpower.",
          category: "governance", tier: 3, cost: 300, prerequisites: ["gov_2"],
          effects: [{ type: "population_bonus", stat: "growth", value: 0.001 }],
        },
      ],
    },
  ],
};
