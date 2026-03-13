import { describe, it, expect } from "vitest";
import { evaluateAction } from "../src/modular-determinism/intensity.js";
import type { GameState, DeterminismConfig, ParsedAction } from "@historia/shared";

function createMinimalState(
  determinism: DeterminismConfig,
  year = 1444
): GameState {
  return {
    gameId: "test",
    scenarioId: "test",
    currentTurn: 1,
    currentDate: { year, month: 1 },
    turnDuration: "1_month",
    determinism,
    nations: {},
    provinces: {},
    activeWars: [],
    activeTreaties: [],
    pendingEvents: [],
    occurredEvents: [],
    globalModifiers: [],
  };
}

describe("DeterminismGate", () => {
  it("should reject anachronistic actions when fantasy_freedom is low", () => {
    const config: DeterminismConfig = {
      simulationIntensity: 0.8,
      historicalConstraint: 0.5,
      fantasyFreedom: 0.1,
    };
    const action: ParsedAction = {
      type: "internal",
      subtype: "research",
      value: "nuclear_weapons",
    };
    const state = createMinimalState(config, 1444);

    const decision = evaluateAction(action, state, config);
    expect(decision.verdict).toBe("reject");
  });

  it("should allow anachronistic actions when fantasy_freedom is high", () => {
    const config: DeterminismConfig = {
      simulationIntensity: 0.3,
      historicalConstraint: 0.0,
      fantasyFreedom: 0.9,
    };
    const action: ParsedAction = {
      type: "internal",
      subtype: "research",
      value: "nuclear_weapons",
    };
    const state = createMinimalState(config, 1444);

    const decision = evaluateAction(action, state, config);
    expect(decision.verdict).not.toBe("reject");
  });

  it("should defer to LLM when simulation_intensity is low", () => {
    const config: DeterminismConfig = {
      simulationIntensity: 0.2,
      historicalConstraint: 0.0,
      fantasyFreedom: 0.5,
    };
    const action: ParsedAction = {
      type: "diplomacy",
      subtype: "declare_war",
      target: "england",
    };
    const state = createMinimalState(config);

    const decision = evaluateAction(action, state, config);
    expect(decision.verdict).toBe("defer_to_llm");
  });

  it("should strictly validate when simulation_intensity is high", () => {
    const config: DeterminismConfig = {
      simulationIntensity: 0.9,
      historicalConstraint: 0.9,
      fantasyFreedom: 0.0,
    };
    const action: ParsedAction = {
      type: "economy",
      subtype: "set_tax",
      value: 0.3,
    };
    const state = createMinimalState(config);

    const decision = evaluateAction(action, state, config);
    expect(decision.verdict).toBe("allow");
  });

  it("should allow modern tech in modern era even with low fantasy freedom", () => {
    const config: DeterminismConfig = {
      simulationIntensity: 0.8,
      historicalConstraint: 0.9,
      fantasyFreedom: 0.0,
    };
    const action: ParsedAction = {
      type: "internal",
      subtype: "research",
      value: "nuclear_weapons",
    };
    const state = createMinimalState(config, 1960);

    const decision = evaluateAction(action, state, config);
    expect(decision.verdict).not.toBe("reject");
  });
});
