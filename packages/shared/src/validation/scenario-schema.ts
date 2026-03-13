import { z } from "zod";

const gameDateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31).optional(),
});

const determinismConfigSchema = z.object({
  simulationIntensity: z.number().min(0).max(1),
  historicalConstraint: z.number().min(0).max(1),
  fantasyFreedom: z.number().min(0).max(1),
});

const victoryConditionSchema = z.object({
  type: z.enum(["score", "domination", "technology", "diplomacy", "custom"]),
  description: z.string(),
  endDate: gameDateSchema.optional(),
  threshold: z.number().optional(),
});

const armyUnitsSchema = z.object({
  infantry: z.number().int().min(0),
  cavalry: z.number().int().min(0),
  artillery: z.number().int().min(0),
});

const armySchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  units: armyUnitsSchema,
  morale: z.number().min(0).max(1),
  supply: z.number().min(0).max(1),
});

const rulerSchema = z.object({
  name: z.string(),
  adminSkill: z.number().int().min(0).max(10),
  diplomacySkill: z.number().int().min(0).max(10),
  militarySkill: z.number().int().min(0).max(10),
  age: z.number().int().min(0),
  traits: z.array(z.string()),
});

const coordPair = z.tuple([z.number(), z.number()]);
const polygonRing = z.array(coordPair);
const multiPolygonSchema = z.array(z.array(polygonRing));

const provinceSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  terrain: z.enum([
    "plains", "hills", "mountains", "forest", "desert",
    "marsh", "ocean", "coastal", "arctic", "jungle",
  ]),
  isCoastal: z.boolean(),
  polygon: z.array(coordPair),
  multiPolygon: multiPolygonSchema.optional(),
  center: coordPair,
  neighbors: z.array(z.string()),
  baseTax: z.number().min(0),
  baseProduction: z.number().min(0),
  baseManpower: z.number().min(0),
  hasPort: z.boolean(),
  fortLevel: z.number().int().min(0),
  resources: z.array(z.string()),
  buildings: z.array(z.string()),
  isCapital: z.boolean(),
  owner: z.string(),
  controller: z.string(),
});

const nationSchema = z.object({
  id: z.string(),
  name: z.string(),
  tag: z.string().length(3),
  color: z.string(),
  flag: z.string().optional(),
  government: z.enum([
    "feudal_monarchy", "absolute_monarchy", "constitutional_monarchy",
    "republic", "theocracy", "dictatorship", "communist_state", "tribal",
  ]),
  ruler: rulerSchema,
  capital: z.string(),
  provinces: z.array(z.string()).min(1),
  economy: z.object({
    treasury: z.number(),
    taxRate: z.number().min(0).max(1),
    inflation: z.number().min(0),
    tradePower: z.number().min(0),
    monthlyIncome: z.number(),
    monthlyExpenses: z.number(),
  }),
  military: z.object({
    armies: z.array(armySchema),
    manpower: z.number().int().min(0),
    maxManpower: z.number().int().min(0),
    forceLimit: z.number().int().min(0),
    militaryTechnology: z.number().int().min(0),
  }),
  diplomacy: z.object({
    relations: z.record(z.string(), z.number()),
    alliances: z.array(z.string()),
    rivals: z.array(z.string()),
    truces: z.record(z.string(), z.number()),
    royalMarriages: z.array(z.string()),
  }),
  population: z.object({
    total: z.number().int().min(0),
    growthRate: z.number(),
    stability: z.number().min(0).max(100),
    warExhaustion: z.number().min(0),
    culture: z.string(),
    religion: z.string(),
  }),
  aiPersonality: z.object({
    aggressiveness: z.number().min(0).max(1),
    diplomacyFocus: z.number().min(0).max(1),
    expansionDesire: z.number().min(0).max(1),
    historicalGoals: z.array(z.string()),
  }).optional(),
  playable: z.boolean(),
});

const eventConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nation_exists"), nation: z.string() }),
  z.object({ type: z.literal("relation_below"), nationA: z.string(), nationB: z.string(), threshold: z.number() }),
  z.object({ type: z.literal("relation_above"), nationA: z.string(), nationB: z.string(), threshold: z.number() }),
  z.object({ type: z.literal("stability_below"), nation: z.string(), threshold: z.number() }),
  z.object({ type: z.literal("at_war"), nation: z.string() }),
  z.object({ type: z.literal("not_at_war"), nation: z.string() }),
  z.object({ type: z.literal("event_occurred"), event: z.string() }),
  z.object({ type: z.literal("date_reached"), date: gameDateSchema }),
  z.object({ type: z.literal("province_owned_by"), province: z.string(), nation: z.string() }),
  z.object({ type: z.literal("alliance_includes"), nations: z.array(z.string()), minMembers: z.number().int() }),
  z.object({ type: z.literal("army_in_province"), province: z.string(), minStrength: z.number(), ownerNot: z.string().optional() }),
]);

const causalGraphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(["historical", "conditional", "consequence", "random"]),
  scheduledDate: gameDateSchema.optional(),
  triggerWindow: z.object({
    earliest: gameDateSchema,
    latest: gameDateSchema,
  }).optional(),
  conditions: z.array(eventConditionSchema),
  preventionConditions: z.array(z.object({
    description: z.string(),
    conditions: z.array(eventConditionSchema),
    difficulty: z.number().min(0).max(1),
  })).optional(),
  effects: z.array(z.object({
    type: z.string(),
  }).passthrough()),
  narrativePrompt: z.string().optional(),
});

export const scenarioSchema = z.object({
  meta: z.object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    author: z.string(),
    description: z.string(),
    era: z.enum(["ancient", "medieval", "early_modern", "industrial", "modern", "contemporary", "fantasy", "custom"]),
    startDate: gameDateSchema,
    tags: z.array(z.string()),
    difficultySuggestion: z.enum(["easy", "normal", "hard", "extreme"]),
    recommendedPlayers: z.object({ min: z.number().int(), max: z.number().int() }),
    thumbnail: z.string().optional(),
  }),
  config: z.object({
    determinism: determinismConfigSchema,
    turnDuration: z.object({
      default: z.enum(["1_week", "1_month", "3_months", "6_months", "1_year"]),
      options: z.array(z.enum(["1_week", "1_month", "3_months", "6_months", "1_year"])),
    }),
    victoryConditions: z.array(victoryConditionSchema),
  }),
  map: z.object({
    type: z.literal("province"),
    projection: z.enum(["mercator", "equirectangular", "custom"]),
    bounds: z.object({
      north: z.number(), south: z.number(), west: z.number(), east: z.number(),
    }),
    terrainTypes: z.array(z.string()),
    provinces: z.array(provinceSchema),
  }),
  nations: z.array(nationSchema),
  events: z.object({
    causalGraph: z.object({
      nodes: z.array(causalGraphNodeSchema),
      edges: z.array(z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(["triggers", "enables", "blocks"]),
        delay: z.object({ months: z.number() }).optional(),
      })),
    }),
  }),
  narrative: z.object({
    introduction: z.string(),
    style: z.enum(["historical_chronicle", "news_broadcast", "royal_court", "war_report", "diplomatic_cable"]),
    tone: z.enum(["formal", "casual", "dramatic", "humorous"]),
    vocabularyEra: z.string(),
  }),
});

export type ScenarioInput = z.infer<typeof scenarioSchema>;

export function validateScenario(data: unknown): ScenarioInput {
  return scenarioSchema.parse(data);
}
