import type { GameState, Nation } from "@historia/shared";

/**
 * Compress game state into a token-efficient summary for LLM context.
 *
 * Strategy:
 * - Player's nation: full detail (~500 tokens)
 * - Neighbors and rivals: moderate detail (~200 tokens each)
 * - Distant nations: one-line summary (~20 tokens each)
 */
export function summarizeState(
  state: GameState,
  perspectiveNationId: string
): string {
  const nation = state.nations[perspectiveNationId];
  if (!nation) return "Nation not found.";

  const parts: string[] = [];

  // Current date
  parts.push(
    `Date: ${state.currentDate.year}-${String(state.currentDate.month).padStart(2, "0")}, Turn ${state.currentTurn}`
  );

  // Player's nation - full detail
  parts.push(`\n=== YOUR NATION: ${nation.name} (${nation.tag}) ===`);
  parts.push(`Government: ${nation.government}`);
  parts.push(
    `Ruler: ${nation.ruler.name} (Admin: ${nation.ruler.adminSkill}, Diplo: ${nation.ruler.diplomacySkill}, Mil: ${nation.ruler.militarySkill})`
  );
  parts.push(`Provinces: ${nation.provinces.join(", ")}`);
  parts.push(
    `Economy: Treasury=${nation.economy.treasury.toFixed(1)}, Income=${nation.economy.monthlyIncome.toFixed(1)}, Expenses=${nation.economy.monthlyExpenses.toFixed(1)}, Tax=${(nation.economy.taxRate * 100).toFixed(0)}%`
  );
  parts.push(
    `Military: Manpower=${nation.military.manpower}/${nation.military.maxManpower}, Tech=${nation.military.militaryTechnology}`
  );
  for (const army of nation.military.armies) {
    parts.push(
      `  Army "${army.name}" at ${army.location}: ${army.units.infantry}inf + ${army.units.cavalry}cav + ${army.units.artillery}art (morale: ${(army.morale * 100).toFixed(0)}%)`
    );
  }
  parts.push(
    `Population: ${(nation.population.total / 1000000).toFixed(1)}M, Stability=${nation.population.stability}, War Exhaustion=${nation.population.warExhaustion}`
  );
  parts.push(`Alliances: ${nation.diplomacy.alliances.join(", ") || "None"}`);
  parts.push(`Rivals: ${nation.diplomacy.rivals.join(", ") || "None"}`);

  // Relations
  const relationsText = Object.entries(nation.diplomacy.relations)
    .map(([id, val]) => `${id}: ${val}`)
    .join(", ");
  parts.push(`Relations: ${relationsText || "None"}`);

  // Active wars
  if (state.activeWars.length > 0) {
    parts.push(`\n=== ACTIVE WARS ===`);
    for (const war of state.activeWars) {
      parts.push(
        `${war.name}: [${war.attackers.join(",")}] vs [${war.defenders.join(",")}] (score: ${war.warScore})`
      );
    }
  }

  // Other nations - summarized
  parts.push(`\n=== OTHER NATIONS ===`);
  for (const [id, other] of Object.entries(state.nations)) {
    if (id === perspectiveNationId) continue;
    parts.push(summarizeOtherNation(other, nation));
  }

  return parts.join("\n");
}

function summarizeOtherNation(other: Nation, perspective: Nation): string {
  const relation = perspective.diplomacy.relations[other.id] ?? 0;
  const isAlly = perspective.diplomacy.alliances.includes(other.id);
  const isRival = perspective.diplomacy.rivals.includes(other.id);
  const status = isAlly ? "ALLY" : isRival ? "RIVAL" : "neutral";

  const totalArmy = other.military.armies.reduce(
    (sum, a) => sum + a.units.infantry + a.units.cavalry + a.units.artillery,
    0
  );

  return `${other.name} (${other.tag}): ${status}, relation=${relation}, provinces=${other.provinces.length}, army~${totalArmy}, treasury=${other.economy.treasury.toFixed(0)}`;
}
