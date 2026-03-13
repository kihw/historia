import { describe, it, expect } from "vitest";
import { resolveEconomy } from "../src/systems/economy.js";
import type { GameState } from "@historia/shared";

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
              id: "army_1",
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
          relations: {},
          alliances: [],
          rivals: [],
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
        neighbors: ["champagne"],
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
    },
    activeWars: [],
    activeTreaties: [],
    pendingEvents: [],
    occurredEvents: [],
    globalModifiers: [],
    ...overrides,
  };
}

describe("Economy System", () => {
  it("should calculate tax income from provinces", () => {
    const state = createTestState();
    const result = resolveEconomy(state);

    const franceUpdate = result.nationUpdates.france;
    expect(franceUpdate).toBeDefined();
    expect(franceUpdate?.economy?.monthlyIncome).toBeGreaterThan(0);
  });

  it("should deduct military upkeep", () => {
    const state = createTestState();
    const result = resolveEconomy(state);

    const franceUpdate = result.nationUpdates.france;
    expect(franceUpdate?.economy?.monthlyExpenses).toBeGreaterThan(0);
  });

  it("should generate bankruptcy event when treasury goes negative", () => {
    const state = createTestState();
    state.nations.france.economy.treasury = 0;
    state.nations.france.military.armies[0].units.infantry = 500000;

    const result = resolveEconomy(state);
    const bankruptcyEvent = result.events.find(
      (e) => e.type === "economy_crisis"
    );
    expect(bankruptcyEvent).toBeDefined();
  });

  it("should increase treasury by net income", () => {
    const state = createTestState();
    const initialTreasury = state.nations.france.economy.treasury;
    const result = resolveEconomy(state);

    const newTreasury = result.nationUpdates.france?.economy?.treasury ?? 0;
    expect(newTreasury).not.toBe(initialTreasury);
  });
});
