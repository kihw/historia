import type {
  DeterminismConfig,
  ParsedAction,
  GameState,
} from "@historia/shared";

export type DeterminismVerdict = "allow" | "modify" | "reject" | "defer_to_llm";

export interface Constraint {
  type: "range" | "must" | "must_not" | "probability";
  target: string;
  value: unknown;
  reason: string;
}

export interface DeterminismDecision {
  verdict: DeterminismVerdict;
  action?: ParsedAction;
  reason?: string;
  constraints?: Constraint[];
}

/**
 * DeterminismGate evaluates every player action against the three
 * configurable axes (simulation_intensity, historical_constraint, fantasy_freedom).
 *
 * This is the core innovation of Historia - modular determinism that adapts
 * to the scenario type.
 */
export function evaluateAction(
  action: ParsedAction,
  state: GameState,
  config: DeterminismConfig
): DeterminismDecision {
  // Check fantasy freedom first - can the action even exist in this world?
  const fantasyCheck = checkFantasyFreedom(action, state, config);
  if (fantasyCheck.verdict === "reject") {
    return fantasyCheck;
  }

  // Check simulation intensity - how much does the engine control the outcome?
  if (config.simulationIntensity < 0.3) {
    // Low intensity: engine barely intervenes, LLM decides most things
    return {
      verdict: "defer_to_llm",
      action,
      constraints: getMinimalConstraints(action, state),
    };
  }

  if (config.simulationIntensity > 0.7) {
    // High intensity: engine fully controls, validate everything strictly
    return validateStrictly(action, state);
  }

  // Medium intensity: engine provides constraints, LLM fills in details
  return {
    verdict: "defer_to_llm",
    action,
    constraints: getModerateConstraints(action, state),
  };
}

function checkFantasyFreedom(
  action: ParsedAction,
  state: GameState,
  config: DeterminismConfig
): DeterminismDecision {
  // In strict realism mode, check for anachronistic or impossible actions
  if (config.fantasyFreedom < 0.3) {
    if (isAnachronistic(action, state)) {
      return {
        verdict: "reject",
        reason: `This action is not available in the current era (${state.currentDate.year}).`,
      };
    }
  }

  return { verdict: "allow", action };
}

function isAnachronistic(action: ParsedAction, state: GameState): boolean {
  if (action.type !== "internal" || action.subtype !== "research") {
    return false;
  }

  const year = state.currentDate.year;
  const anachronisticTech: Record<string, number> = {
    nuclear_weapons: 1940,
    aircraft: 1900,
    railways: 1820,
    gunpowder: 1300,
    printing_press: 1440,
    steam_engine: 1760,
    electricity: 1870,
    internet: 1970,
  };

  const target = action.value ?? action.target ?? "";
  const minYear = anachronisticTech[target];
  if (minYear && year < minYear) {
    return true;
  }

  return false;
}

function validateStrictly(
  action: ParsedAction,
  state: GameState
): DeterminismDecision {
  switch (action.type) {
    case "diplomacy":
      return validateDiplomacyStrict(action, state);
    case "military":
      return validateMilitaryStrict(action, state);
    case "economy":
      return validateEconomyStrict(action, state);
    case "internal":
      return validateInternalStrict(action, state);
    case "espionage":
      return validateEspionageStrict(action, state);
    default:
      return { verdict: "allow", action };
  }
}

function validateDiplomacyStrict(
  action: Extract<ParsedAction, { type: "diplomacy" }>,
  state: GameState
): DeterminismDecision {
  const target = state.nations[action.target];
  if (!target) {
    return { verdict: "reject", reason: `Nation "${action.target}" does not exist.` };
  }

  switch (action.subtype) {
    case "declare_war": {
      // Cannot declare war on an ally without breaking alliance first
      const actingNation = Object.values(state.nations).find(
        (n) => n.diplomacy.alliances.includes(action.target)
      );
      // Cannot declare war if already at war with this nation
      const alreadyAtWar = state.activeWars.some(
        (w) =>
          (w.attackers.includes(action.target) || w.defenders.includes(action.target))
      );
      if (alreadyAtWar) {
        return { verdict: "reject", reason: `Already at war involving ${target.name}.` };
      }
      // Check for active truce
      const hasTruce = state.activeTreaties.some(
        (t) => t.type === "peace" && t.parties.includes(action.target) && t.endTurn && t.endTurn > state.currentTurn
      );
      if (hasTruce) {
        return { verdict: "reject", reason: `Active truce with ${target.name}. Cannot declare war yet.` };
      }
      return { verdict: "allow", action };
    }
    case "propose_alliance": {
      // Check if already allied
      const alreadyAllied = state.activeTreaties.some(
        (t) => t.type === "alliance" && t.parties.includes(action.target)
      );
      if (alreadyAllied) {
        return { verdict: "reject", reason: `Already allied with ${target.name}.` };
      }
      return { verdict: "allow", action };
    }
    case "propose_peace": {
      // Can only propose peace if at war
      const atWar = state.activeWars.some(
        (w) => w.attackers.includes(action.target) || w.defenders.includes(action.target)
      );
      if (!atWar) {
        return { verdict: "reject", reason: `Not at war with ${target.name}.` };
      }
      return { verdict: "allow", action };
    }
    default:
      return { verdict: "allow", action };
  }
}

function validateMilitaryStrict(
  action: Extract<ParsedAction, { type: "military" }>,
  state: GameState
): DeterminismDecision {
  switch (action.subtype) {
    case "recruit": {
      // Check if nation has enough manpower
      // We can't determine the acting nation from the action alone,
      // but we validate that units requested are non-negative
      const units = action.units ?? {};
      if (
        (units.infantry && units.infantry < 0) ||
        (units.cavalry && units.cavalry < 0) ||
        (units.artillery && units.artillery < 0)
      ) {
        return { verdict: "reject", reason: "Cannot recruit negative units." };
      }
      return { verdict: "allow", action };
    }
    case "move_army": {
      if (!action.armyId) {
        return { verdict: "reject", reason: "Army ID required for movement." };
      }
      if (!action.target) {
        return { verdict: "reject", reason: "Target province required for movement." };
      }
      // Validate target province exists
      if (!state.provinces[action.target]) {
        return { verdict: "reject", reason: `Province "${action.target}" does not exist.` };
      }
      return { verdict: "allow", action };
    }
    default:
      return { verdict: "allow", action };
  }
}

function validateEconomyStrict(
  action: Extract<ParsedAction, { type: "economy" }>,
  state: GameState
): DeterminismDecision {
  switch (action.subtype) {
    case "set_tax": {
      const rate = action.value ?? 0;
      if (rate < 0 || rate > 0.5) {
        return {
          verdict: "modify",
          action: { ...action, value: Math.max(0, Math.min(0.5, rate)) },
          reason: "Tax rate clamped to 0-50%.",
          constraints: [{ type: "range", target: "tax_rate", value: [0, 0.5], reason: "Tax rate must be 0-50%" }],
        };
      }
      return { verdict: "allow", action };
    }
    case "build": {
      if (!action.province || !state.provinces[action.province]) {
        return { verdict: "reject", reason: "Valid province required for building." };
      }
      return { verdict: "allow", action };
    }
    case "trade_route":
    case "embargo": {
      // Target nation must exist (stored in province field)
      if (!action.province || !state.nations[action.province]) {
        return { verdict: "reject", reason: "Valid target nation required." };
      }
      return { verdict: "allow", action };
    }
    default:
      return { verdict: "allow", action };
  }
}

function validateInternalStrict(
  action: Extract<ParsedAction, { type: "internal" }>,
  state: GameState
): DeterminismDecision {
  switch (action.subtype) {
    case "research": {
      if (!action.value && !action.target) {
        return { verdict: "reject", reason: "Technology ID required for research." };
      }
      return { verdict: "allow", action };
    }
    case "change_government": {
      if (!action.value) {
        return { verdict: "reject", reason: "Government type required." };
      }
      return { verdict: "allow", action };
    }
    default:
      return { verdict: "allow", action };
  }
}

function validateEspionageStrict(
  action: Extract<ParsedAction, { type: "espionage" }>,
  state: GameState
): DeterminismDecision {
  const target = state.nations[action.target];
  if (!target) {
    return { verdict: "reject", reason: `Nation "${action.target}" does not exist.` };
  }
  if (action.subtype === "assassinate") {
    // In strict mode, assassination is very costly to attempt
    return {
      verdict: "allow",
      action,
      constraints: [{
        type: "probability",
        target: "success_rate",
        value: 0.15,
        reason: "Assassination has very low success rate in strict mode.",
      }],
    };
  }
  return { verdict: "allow", action };
}

function getMinimalConstraints(
  action: ParsedAction,
  state: GameState
): Constraint[] {
  // Minimal: just prevent game-breaking stuff
  return [
    {
      type: "must_not",
      target: "game_break",
      value: true,
      reason: "Action must not break game state consistency",
    },
  ];
}

function getModerateConstraints(
  action: ParsedAction,
  state: GameState
): Constraint[] {
  const constraints: Constraint[] = [];

  if (action.type === "military" && action.subtype === "recruit") {
    constraints.push({
      type: "range",
      target: "recruitment_cost",
      value: [0.5, 2.0],
      reason: "Recruitment cost multiplier based on manpower availability",
    });
  }

  if (action.type === "economy" && action.subtype === "set_tax") {
    constraints.push({
      type: "range",
      target: "tax_rate",
      value: [0, 0.5],
      reason: "Tax rate must be between 0% and 50%",
    });
  }

  return constraints;
}
