import type {
  GameState,
  Nation,
  GameEvent,
} from "@historia/shared";
import { generateId } from "@historia/shared";

export interface PopulationResult {
  nationUpdates: Record<string, Partial<Nation>>;
  events: GameEvent[];
}

/**
 * Resolve population, stability, and unrest for a turn.
 */
export function resolvePopulation(state: GameState): PopulationResult {
  const nationUpdates: Record<string, Partial<Nation>> = {};
  const events: GameEvent[] = [];

  for (const [nationId, nation] of Object.entries(state.nations)) {
    const { population } = nation;

    // Population growth
    const growthModifier = population.stability > 50 ? 1 : 0.5;
    const warModifier =
      population.warExhaustion > 0
        ? 1 - population.warExhaustion * 0.005
        : 1;
    const newTotal = Math.floor(
      population.total *
        (1 + population.growthRate * growthModifier * warModifier)
    );

    // Stability changes
    let stabilityDelta = 0;
    if (nation.economy.treasury <= 0) stabilityDelta -= 5;
    if (population.warExhaustion > 50) stabilityDelta -= 3;
    if (nation.economy.inflation > 0.1) stabilityDelta -= 2;
    if (nation.economy.treasury > 100 && population.warExhaustion === 0) {
      stabilityDelta += 1;
    }

    const newStability = Math.max(
      0,
      Math.min(100, population.stability + stabilityDelta)
    );

    // War exhaustion decay
    const newWarExhaustion = Math.max(0, population.warExhaustion - 1);

    // Check for revolt
    if (newStability < 20) {
      events.push({
        id: generateId("evt"),
        type: "revolt",
        turn: state.currentTurn,
        date: state.currentDate,
        source: "engine",
        data: {
          stability: newStability,
          severity: newStability < 10 ? "severe" : "minor",
        },
        description: `Unrest spreads across ${nation.name}! Stability is critically low.`,
        descriptionKey: "events.revolt",
        descriptionParams: { nation: nation.name, stability: newStability },
        affectedNations: [nationId],
      });
    }

    nationUpdates[nationId] = {
      population: {
        ...population,
        total: newTotal,
        stability: newStability,
        warExhaustion: newWarExhaustion,
      },
    };
  }

  return { nationUpdates, events };
}
