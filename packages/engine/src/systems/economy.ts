import type {
  GameState,
  Nation,
  GameEvent,
  GameDate,
} from "@historia/shared";
import { generateId } from "@historia/shared";

export interface EconomyResult {
  nationUpdates: Record<string, Partial<Nation>>;
  events: GameEvent[];
}

/**
 * Resolve economy for a single turn.
 * Pure function: (state) => (updates, events)
 */
export function resolveEconomy(state: GameState): EconomyResult {
  const nationUpdates: Record<string, Partial<Nation>> = {};
  const events: GameEvent[] = [];

  for (const [nationId, nation] of Object.entries(state.nations)) {
    const { economy, provinces: provinceIds } = nation;

    // Calculate income from provinces
    let taxIncome = 0;
    let productionIncome = 0;
    for (const provId of provinceIds) {
      const province = state.provinces[provId];
      if (!province) continue;
      taxIncome += province.baseTax * economy.taxRate;
      productionIncome += province.baseProduction * 0.5;
    }

    // Ruler admin skill bonus: +5% income per skill point above 5
    const adminBonus = 1 + Math.max(0, (nation.ruler.adminSkill - 5) * 0.05);
    const totalIncome = (taxIncome + productionIncome + economy.tradePower * 0.1) * adminBonus;

    // Calculate expenses (military upkeep)
    let militaryUpkeep = 0;
    for (const army of nation.military.armies) {
      const totalUnits =
        army.units.infantry + army.units.cavalry * 2 + army.units.artillery * 3;
      militaryUpkeep += totalUnits * 0.001;
    }

    const totalExpenses = militaryUpkeep;
    const netIncome = totalIncome - totalExpenses;
    const newTreasury = economy.treasury + netIncome;

    // Check for bankruptcy
    if (newTreasury < 0) {
      events.push({
        id: generateId("evt"),
        type: "economy_crisis",
        turn: state.currentTurn,
        date: state.currentDate,
        source: "engine",
        data: { type: "bankruptcy", deficit: Math.abs(newTreasury) },
        description: `${nation.name} is bankrupt! The treasury is empty.`,
        descriptionKey: "events.bankruptcy",
        descriptionParams: { nation: nation.name },
        affectedNations: [nationId],
      });
    }

    nationUpdates[nationId] = {
      economy: {
        ...economy,
        treasury: Math.max(newTreasury, 0),
        monthlyIncome: totalIncome,
        monthlyExpenses: totalExpenses,
        inflation: Math.max(
          0,
          economy.inflation + (newTreasury < 0 ? 0.01 : -0.002)
        ),
      },
    };
  }

  return { nationUpdates, events };
}
