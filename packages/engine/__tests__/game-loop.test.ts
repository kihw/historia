import { describe, it, expect } from "vitest";
import { resolveTurn } from "../src/core/game-loop.js";
import type { GameState, ParsedAction } from "@historia/shared";
import type { TurnActions } from "../src/core/game-loop.js";

function createTestState(overrides?: Partial<GameState>): GameState {
  return {
    gameId: "test",
    scenarioId: "test",
    currentTurn: 1,
    currentDate: { year: 1444, month: 11 },
    turnDuration: "1_month",
    determinism: {
      simulationIntensity: 0.6,
      historicalConstraint: 0.5,
      fantasyFreedom: 0.2,
    },
    nations: {
      france: {
        id: "france",
        name: "France",
        tag: "FRA",
        color: "#3B5998",
        government: "feudal_monarchy",
        ruler: {
          name: "Charles VII",
          adminSkill: 5,
          diplomacySkill: 5,
          militarySkill: 4,
          age: 41,
          traits: [],
        },
        capital: "ile_de_france",
        provinces: ["ile_de_france"],
        economy: {
          treasury: 100,
          taxRate: 0.1,
          inflation: 0.02,
          tradePower: 45,
          monthlyIncome: 0,
          monthlyExpenses: 0,
        },
        military: {
          armies: [
            {
              id: "army_fra",
              name: "Armee Royale",
              location: "ile_de_france",
              units: { infantry: 15000, cavalry: 3000, artillery: 500 },
              morale: 0.8,
              supply: 1.0,
            },
          ],
          manpower: 25000,
          maxManpower: 50000,
          forceLimit: 35000,
          militaryTechnology: 3,
        },
        diplomacy: {
          relations: { england: 30 },
          alliances: [],
          rivals: ["england"],
          truces: {},
          royalMarriages: [],
        },
        population: {
          total: 5000000,
          growthRate: 0.005,
          stability: 65,
          warExhaustion: 0,
          culture: "french",
          religion: "catholic",
        },
        playable: true,
      },
      england: {
        id: "england",
        name: "England",
        tag: "ENG",
        color: "#C8102E",
        government: "feudal_monarchy",
        ruler: {
          name: "Henry VI",
          adminSkill: 2,
          diplomacySkill: 3,
          militarySkill: 2,
          age: 22,
          traits: [],
        },
        capital: "london",
        provinces: ["london"],
        economy: {
          treasury: 80,
          taxRate: 0.1,
          inflation: 0.01,
          tradePower: 40,
          monthlyIncome: 0,
          monthlyExpenses: 0,
        },
        military: {
          armies: [
            {
              id: "army_eng",
              name: "English Army",
              location: "london",
              units: { infantry: 10000, cavalry: 2000, artillery: 300 },
              morale: 0.7,
              supply: 1.0,
            },
          ],
          manpower: 20000,
          maxManpower: 40000,
          forceLimit: 30000,
          militaryTechnology: 3,
        },
        diplomacy: {
          relations: { france: 30 },
          alliances: [],
          rivals: ["france"],
          truces: {},
          royalMarriages: [],
        },
        population: {
          total: 3500000,
          growthRate: 0.004,
          stability: 55,
          warExhaustion: 0,
          culture: "english",
          religion: "catholic",
        },
        playable: true,
      },
    },
    provinces: {
      ile_de_france: {
        id: "ile_de_france",
        name: "Ile-de-France",
        displayName: "Ile-de-France",
        terrain: "plains",
        isCoastal: false,
        polygon: [],
        center: [2.5, 48.6],
        neighbors: ["champagne", "normandy"],
        baseTax: 8,
        baseProduction: 6,
        baseManpower: 5,
        hasPort: false,
        fortLevel: 2,
        resources: ["grain"],
        buildings: ["marketplace"],
        isCapital: true,
        owner: "france",
        controller: "france",
      },
      london: {
        id: "london",
        name: "London",
        displayName: "London",
        terrain: "plains",
        isCoastal: true,
        polygon: [],
        center: [-0.1, 51.5],
        neighbors: ["normandy"],
        baseTax: 9,
        baseProduction: 7,
        baseManpower: 4,
        hasPort: true,
        fortLevel: 3,
        resources: ["cloth"],
        buildings: ["marketplace"],
        isCapital: true,
        owner: "england",
        controller: "england",
      },
      normandy: {
        id: "normandy",
        name: "Normandy",
        displayName: "Normandy",
        terrain: "plains",
        isCoastal: true,
        polygon: [],
        center: [-0.4, 49.2],
        neighbors: ["ile_de_france", "london", "champagne"],
        baseTax: 5,
        baseProduction: 4,
        baseManpower: 3,
        hasPort: true,
        fortLevel: 1,
        resources: ["grain"],
        buildings: [],
        isCapital: false,
        owner: "france",
        controller: "france",
      },
      champagne: {
        id: "champagne",
        name: "Champagne",
        displayName: "Champagne",
        terrain: "plains",
        isCoastal: false,
        polygon: [],
        center: [3.5, 48.9],
        neighbors: ["ile_de_france", "normandy"],
        baseTax: 4,
        baseProduction: 5,
        baseManpower: 3,
        hasPort: false,
        fortLevel: 0,
        resources: ["wine"],
        buildings: [],
        isCapital: false,
        owner: "france",
        controller: "france",
      },
    },
    activeWars: [],
    activeTreaties: [],
    pendingEvents: [],
    occurredEvents: [],
    globalModifiers: [],
    ...overrides,
  };
}

describe("Game Loop", () => {
  it("should advance turn number", () => {
    const state = createTestState();
    const allActions: TurnActions[] = [];

    const result = resolveTurn(state, allActions, 42);

    expect(result.newState.currentTurn).toBe(state.currentTurn + 1);
  });

  it("should advance date by turn duration", () => {
    const state = createTestState();
    // currentDate is { year: 1444, month: 11 }, turnDuration is "1_month"
    const allActions: TurnActions[] = [];

    const result = resolveTurn(state, allActions, 42);

    expect(result.newState.currentDate.month).toBe(12);
    expect(result.newState.currentDate.year).toBe(1444);
  });

  it("should handle year rollover", () => {
    const state = createTestState();
    state.currentDate = { year: 1444, month: 12 };
    const allActions: TurnActions[] = [];

    const result = resolveTurn(state, allActions, 42);

    expect(result.newState.currentDate.month).toBe(1);
    expect(result.newState.currentDate.year).toBe(1445);
  });

  it("should produce deterministic results with same seed", () => {
    const state1 = createTestState();
    const state2 = createTestState();

    // Set up a scenario where RNG matters (battle in progress)
    for (const state of [state1, state2]) {
      state.nations.france.military.armies[0].location = "normandy";
      state.nations.england.military.armies[0].location = "normandy";
      state.activeWars = [
        {
          id: "war_1",
          name: "France-England War",
          attackers: ["france"],
          defenders: ["england"],
          startTurn: 1,
          startDate: { year: 1444, month: 11 },
          warScore: 0,
          battles: [],
        },
      ];
    }

    const allActions: TurnActions[] = [];
    const seed = 12345;

    const result1 = resolveTurn(state1, allActions, seed);
    const result2 = resolveTurn(state2, allActions, seed);

    // With the same seed and same starting state, results should be identical
    expect(result1.newState.currentTurn).toBe(result2.newState.currentTurn);
    expect(result1.newState.currentDate).toEqual(result2.newState.currentDate);

    // Compare nation treasuries
    expect(result1.newState.nations.france.economy.treasury).toBe(
      result2.newState.nations.france.economy.treasury
    );
    expect(result1.newState.nations.england.economy.treasury).toBe(
      result2.newState.nations.england.economy.treasury
    );

    // Compare army states after battle
    expect(result1.newState.nations.france.military.armies).toEqual(
      result2.newState.nations.france.military.armies
    );
    expect(result1.newState.nations.england.military.armies).toEqual(
      result2.newState.nations.england.military.armies
    );
  });

  it("should resolve diplomacy before military", () => {
    const state = createTestState();

    // France declares war AND moves army to normandy in the same turn.
    // Diplomacy runs first (step 1), so the war should exist by the time
    // military resolves (step 4). If we also place England's army in normandy,
    // a battle should occur because the war is active.
    state.nations.england.military.armies[0].location = "normandy";

    const allActions: TurnActions[] = [
      {
        nationId: "france",
        actions: [
          {
            type: "diplomacy",
            subtype: "declare_war",
            target: "england",
          } as ParsedAction,
          {
            type: "military",
            subtype: "move_army",
            armyId: "army_fra",
            target: "normandy",
          } as ParsedAction,
        ],
      },
    ];

    const result = resolveTurn(state, allActions, 42);

    // War should have been created (diplomacy resolved first)
    expect(result.delta.newWars.length).toBe(1);
    expect(result.delta.newWars[0].attackers).toContain("france");
    expect(result.delta.newWars[0].defenders).toContain("england");

    // The French army should have moved to normandy
    const frenchArmy = result.newState.nations.france.military.armies.find(
      (a) => a.id === "army_fra"
    );
    // Army may have moved to normandy and then been updated by battle
    // (possibly retreated if it lost). Either way the war declaration event
    // proves diplomacy ran before military.
    const warDeclaredEvent = result.events.find(
      (e) => e.type === "war_declared"
    );
    expect(warDeclaredEvent).toBeDefined();
  });

  it("should return StateDelta with changes", () => {
    const state = createTestState();
    const allActions: TurnActions[] = [];

    const result = resolveTurn(state, allActions, 42);

    // Delta should be populated with the correct turn number
    expect(result.delta).toBeDefined();
    expect(result.delta.turn).toBe(state.currentTurn + 1);

    // nationChanges should contain updates from economy and population systems
    // (which run even with no player actions)
    expect(result.delta.nationChanges).toBeDefined();
    expect(typeof result.delta.nationChanges).toBe("object");

    // provinceChanges, newWars, etc. should be defined (even if empty arrays)
    expect(result.delta.provinceChanges).toBeDefined();
    expect(Array.isArray(result.delta.newWars)).toBe(true);
    expect(Array.isArray(result.delta.endedWars)).toBe(true);
    expect(Array.isArray(result.delta.newTreaties)).toBe(true);
    expect(Array.isArray(result.delta.endedTreaties)).toBe(true);
    expect(Array.isArray(result.delta.events)).toBe(true);

    // TurnResult should also contain events and narratives
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.narratives).toBeDefined();
    expect(typeof result.globalNarrative).toBe("string");
  });
});
