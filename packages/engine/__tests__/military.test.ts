import { describe, it, expect } from "vitest";
import { resolveMilitary } from "../src/systems/military.js";
import type { GameState, MilitaryAction } from "@historia/shared";

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

describe("Military System", () => {
  it("should move army to adjacent province", () => {
    const state = createTestState();
    const actions: MilitaryAction[] = [
      {
        type: "military",
        subtype: "move_army",
        armyId: "army_fra",
        target: "normandy",
      },
    ];

    const result = resolveMilitary(state, actions, "france", 42);

    const updatedArmies = result.nationUpdates.france?.military?.armies;
    expect(updatedArmies).toBeDefined();
    const movedArmy = updatedArmies!.find((a) => a.id === "army_fra");
    expect(movedArmy).toBeDefined();
    expect(movedArmy!.location).toBe("normandy");
  });

  it("should reject move to non-adjacent province", () => {
    const state = createTestState();
    // london is not a neighbor of ile_de_france, so this move should be rejected
    const actions: MilitaryAction[] = [
      {
        type: "military",
        subtype: "move_army",
        armyId: "army_fra",
        target: "london",
      },
    ];

    const result = resolveMilitary(state, actions, "france", 42);

    // No nation update should be produced for an invalid move
    const updatedArmies = result.nationUpdates.france?.military?.armies;
    expect(updatedArmies).toBeUndefined();
  });

  it("should recruit new army at capital", () => {
    const state = createTestState();
    const actions: MilitaryAction[] = [
      {
        type: "military",
        subtype: "recruit",
        units: { infantry: 5000 },
      },
    ];

    const result = resolveMilitary(state, actions, "france", 42);

    const updatedArmies = result.nationUpdates.france?.military?.armies;
    expect(updatedArmies).toBeDefined();
    // Should have original army + newly recruited army
    expect(updatedArmies!.length).toBe(2);

    const newArmy = updatedArmies!.find((a) => a.id !== "army_fra");
    expect(newArmy).toBeDefined();
    expect(newArmy!.units.infantry).toBe(5000);
    expect(newArmy!.location).toBe("ile_de_france");
  });

  it("should deduct treasury when recruiting", () => {
    const state = createTestState();
    const actions: MilitaryAction[] = [
      {
        type: "military",
        subtype: "recruit",
        units: { infantry: 5000 },
      },
    ];

    const result = resolveMilitary(state, actions, "france", 42);

    // Cost is totalRequested * 0.01 = 5000 * 0.01 = 50
    const updatedTreasury = result.nationUpdates.france?.economy?.treasury;
    expect(updatedTreasury).toBeDefined();
    expect(updatedTreasury).toBe(100 - 50);
  });

  it("should reject recruitment when insufficient manpower", () => {
    const state = createTestState();
    state.nations.france.military.manpower = 0;

    const actions: MilitaryAction[] = [
      {
        type: "military",
        subtype: "recruit",
        units: { infantry: 5000 },
      },
    ];

    const result = resolveMilitary(state, actions, "france", 42);

    // No armies should be added because manpower is 0
    const updatedArmies = result.nationUpdates.france?.military?.armies;
    expect(updatedArmies).toBeUndefined();
    expect(result.events.length).toBe(0);
  });

  it("should resolve battle when armies in same province at war", () => {
    const state = createTestState();

    // Move English army to normandy so both armies can be there
    state.nations.england.military.armies[0].location = "normandy";
    state.nations.france.military.armies[0].location = "normandy";

    // Create an active war between france and england
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

    const result = resolveMilitary(state, [], "france", 42);

    expect(result.battles.length).toBeGreaterThan(0);
    expect(result.battles[0].province).toBe("normandy");
    expect(result.battles[0].winner).toBeDefined();

    // A battle_fought event should be generated
    const battleEvent = result.events.find((e) => e.type === "battle_fought");
    expect(battleEvent).toBeDefined();
  });

  it("should apply losses to armies after battle", () => {
    const state = createTestState();

    // Place both armies in the same province
    state.nations.england.military.armies[0].location = "normandy";
    state.nations.france.military.armies[0].location = "normandy";

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

    const originalFrenchInfantry =
      state.nations.france.military.armies[0].units.infantry;
    const originalEnglishInfantry =
      state.nations.england.military.armies[0].units.infantry;

    const result = resolveMilitary(state, [], "france", 42);

    // At least one nation should have updated (reduced) armies
    const franceArmies = result.nationUpdates.france?.military?.armies;
    const englandArmies = result.nationUpdates.england?.military?.armies;

    // Both should have updated armies after a battle
    expect(franceArmies).toBeDefined();
    expect(englandArmies).toBeDefined();

    // Check that losses were applied (at least one side should have fewer troops)
    const frenchArmy = franceArmies?.find((a) => a.id === "army_fra");
    const englishArmy = englandArmies?.find((a) => a.id === "army_eng");

    if (frenchArmy) {
      expect(frenchArmy.units.infantry).toBeLessThan(originalFrenchInfantry);
    }
    if (englishArmy) {
      expect(englishArmy.units.infantry).toBeLessThan(originalEnglishInfantry);
    }
  });

  it("should calculate army strength correctly", () => {
    const state = createTestState();

    // Set up armies with known values for predictable strength:
    // infantry: 10000 * 1 = 10000
    // cavalry: 2000 * 2.5 = 5000
    // artillery: 500 * 4 = 2000
    // total raw = 17000, * morale(1.0) * supply(1.0) = 17000
    state.nations.france.military.armies[0] = {
      id: "army_fra",
      name: "Test Army",
      location: "normandy",
      units: { infantry: 10000, cavalry: 2000, artillery: 500 },
      morale: 1.0,
      supply: 1.0,
    };

    // Set up a weaker enemy with exactly half the strength
    // infantry: 5000 * 1 = 5000
    // cavalry: 1000 * 2.5 = 2500
    // artillery: 250 * 4 = 1000
    // total raw = 8500, * morale(1.0) * supply(1.0) = 8500
    // defender bonus: 8500 * 1.1 = 9350
    state.nations.england.military.armies[0] = {
      id: "army_eng",
      name: "Weak Army",
      location: "normandy",
      units: { infantry: 5000, cavalry: 1000, artillery: 250 },
      morale: 1.0,
      supply: 1.0,
    };

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

    const result = resolveMilitary(state, [], "france", 42);

    // The stronger army (France with 17000 strength) should generally win
    // against the weaker army (England with 9350 effective strength including defender bonus)
    expect(result.battles.length).toBe(1);
    // Both sides should have recorded losses
    expect(result.battles[0].attackerLosses).toBeGreaterThan(0);
    expect(result.battles[0].defenderLosses).toBeGreaterThan(0);
  });
});
