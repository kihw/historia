import { describe, it, expect } from "vitest";
import { resolveDiplomacy } from "../src/systems/diplomacy.js";
import type { GameState, DiplomacyAction } from "@historia/shared";

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

describe("Diplomacy System", () => {
  it("should declare war creating a new War", () => {
    const state = createTestState();
    const actions: DiplomacyAction[] = [
      {
        type: "diplomacy",
        subtype: "declare_war",
        target: "england",
      },
    ];

    const result = resolveDiplomacy(state, actions, "france");

    expect(result.newWars.length).toBe(1);
    expect(result.newWars[0].attackers).toContain("france");
    expect(result.newWars[0].defenders).toContain("england");
    expect(result.newWars[0].name).toBe("France-England War");
    expect(result.newWars[0].startTurn).toBe(1);
    expect(result.newWars[0].warScore).toBe(0);

    // A war_declared event should be emitted
    const warEvent = result.events.find((e) => e.type === "war_declared");
    expect(warEvent).toBeDefined();
    expect(warEvent!.affectedNations).toContain("france");
    expect(warEvent!.affectedNations).toContain("england");
  });

  it("should break alliance when declaring war on ally", () => {
    const state = createTestState();

    // Set up an existing alliance treaty between france and england
    state.activeTreaties = [
      {
        id: "treaty_alliance_1",
        type: "alliance",
        parties: ["france", "england"],
        startTurn: 1,
        terms: {},
      },
    ];

    const actions: DiplomacyAction[] = [
      {
        type: "diplomacy",
        subtype: "declare_war",
        target: "england",
      },
    ];

    const result = resolveDiplomacy(state, actions, "france");

    // The alliance should be ended
    expect(result.endedTreaties).toContain("treaty_alliance_1");
    // War should still be declared
    expect(result.newWars.length).toBe(1);
  });

  it("should pull allies into war", () => {
    const state = createTestState();

    // Add a third nation (Burgundy) that is allied with England
    state.nations.burgundy = {
      id: "burgundy",
      name: "Burgundy",
      tag: "BUR",
      color: "#8B4513",
      government: "feudal_monarchy",
      ruler: {
        name: "Philip the Good",
        adminSkill: 4,
        diplomacySkill: 5,
        militarySkill: 4,
        age: 48,
        traits: [],
      },
      capital: "champagne",
      provinces: ["champagne"],
      economy: {
        treasury: 60,
        taxRate: 0.1,
        inflation: 0.01,
        tradePower: 30,
        monthlyIncome: 0,
        monthlyExpenses: 0,
      },
      military: {
        armies: [],
        manpower: 15000,
        maxManpower: 30000,
        forceLimit: 20000,
        militaryTechnology: 3,
      },
      diplomacy: {
        relations: { england: 80 },
        alliances: ["england"],
        rivals: [],
        truces: {},
        royalMarriages: [],
      },
      population: {
        total: 2000000,
        growthRate: 0.004,
        stability: 60,
        warExhaustion: 0,
        culture: "burgundian",
        religion: "catholic",
      },
      playable: true,
    };

    // England lists Burgundy as an ally
    state.nations.england.diplomacy.alliances = ["burgundy"];

    const actions: DiplomacyAction[] = [
      {
        type: "diplomacy",
        subtype: "declare_war",
        target: "england",
      },
    ];

    const result = resolveDiplomacy(state, actions, "france");

    expect(result.newWars.length).toBe(1);
    // Burgundy should be pulled in as a defender alongside England
    expect(result.newWars[0].defenders).toContain("england");
    expect(result.newWars[0].defenders).toContain("burgundy");
  });

  it("should form alliance when relations > 50", () => {
    const state = createTestState();
    // Set relations above 50 so alliance is accepted
    state.nations.france.diplomacy.relations.england = 75;

    const actions: DiplomacyAction[] = [
      {
        type: "diplomacy",
        subtype: "propose_alliance",
        target: "england",
      },
    ];

    const result = resolveDiplomacy(state, actions, "france");

    expect(result.newTreaties.length).toBe(1);
    expect(result.newTreaties[0].type).toBe("alliance");
    expect(result.newTreaties[0].parties).toContain("france");
    expect(result.newTreaties[0].parties).toContain("england");

    // An alliance_formed event should be emitted
    const allianceEvent = result.events.find(
      (e) => e.type === "alliance_formed"
    );
    expect(allianceEvent).toBeDefined();
  });

  it("should reject alliance when relations <= 50", () => {
    const state = createTestState();
    // Relations are 30 by default, which is <= 50
    state.nations.france.diplomacy.relations.england = 30;

    const actions: DiplomacyAction[] = [
      {
        type: "diplomacy",
        subtype: "propose_alliance",
        target: "england",
      },
    ];

    const result = resolveDiplomacy(state, actions, "france");

    // No treaties should be created
    expect(result.newTreaties.length).toBe(0);
    // No alliance_formed event
    const allianceEvent = result.events.find(
      (e) => e.type === "alliance_formed"
    );
    expect(allianceEvent).toBeUndefined();
  });

  it("should sign peace ending active war", () => {
    const state = createTestState();

    // Set up an active war
    state.activeWars = [
      {
        id: "war_fra_eng",
        name: "France-England War",
        attackers: ["france"],
        defenders: ["england"],
        startTurn: 1,
        startDate: { year: 1444, month: 11 },
        warScore: 20,
        battles: [],
      },
    ];

    const actions: DiplomacyAction[] = [
      {
        type: "diplomacy",
        subtype: "propose_peace",
        target: "england",
      },
    ];

    const result = resolveDiplomacy(state, actions, "france");

    // The war should be ended
    expect(result.endedWars).toContain("war_fra_eng");
    // A peace treaty should be created
    expect(result.newTreaties.length).toBe(1);
    expect(result.newTreaties[0].type).toBe("peace");
    expect(result.newTreaties[0].parties).toContain("france");
    expect(result.newTreaties[0].parties).toContain("england");
    // Peace treaty should set a truce end turn (60 turns = 5 years)
    expect(result.newTreaties[0].endTurn).toBe(state.currentTurn + 60);

    // A peace_signed event should be emitted
    const peaceEvent = result.events.find((e) => e.type === "peace_signed");
    expect(peaceEvent).toBeDefined();
  });

  it("should improve relations", () => {
    const state = createTestState();
    const initialRelation = state.nations.france.diplomacy.relations.england;

    const actions: DiplomacyAction[] = [
      {
        type: "diplomacy",
        subtype: "improve_relations",
        target: "england",
      },
    ];

    const result = resolveDiplomacy(state, actions, "france");

    const updatedRelations =
      result.nationUpdates.france?.diplomacy?.relations?.england;
    expect(updatedRelations).toBeDefined();
    expect(updatedRelations!).toBeGreaterThan(initialRelation);
  });
});
