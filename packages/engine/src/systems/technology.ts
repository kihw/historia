import type {
  GameState,
  Nation,
  GameEvent,
  InternalAction,
  NationTechState,
  TechTree,
  Technology,
} from "@historia/shared";
import { generateId, DEFAULT_TECH_TREE } from "@historia/shared";

export interface TechnologyResult {
  nationUpdates: Record<string, Partial<Nation>>;
  events: GameEvent[];
}

/**
 * Resolve technology research for a single turn.
 * - Advances current research progress for all nations
 * - Completes techs when progress >= cost
 * - Handles explicit "research" actions to start/switch research
 */
export function resolveTechnology(
  state: GameState,
  actions: { nationId: string; actions: InternalAction[] }[],
  techTree?: TechTree
): TechnologyResult {
  const tree = techTree ?? DEFAULT_TECH_TREE;
  const allTechs = tree.categories.flatMap((c) => c.techs);
  const techMap = new Map(allTechs.map((t) => [t.id, t]));

  const nationUpdates: Record<string, Partial<Nation>> = {};
  const events: GameEvent[] = [];

  // Process explicit research actions
  for (const { nationId, actions: acts } of actions) {
    const researchActions = acts.filter((a) => a.subtype === "research");
    if (researchActions.length === 0) continue;

    const nation = state.nations[nationId];
    if (!nation) continue;

    const tech = nation.technology ?? defaultTechState(nation);

    for (const action of researchActions) {
      const techId = action.target;
      if (!techId) continue;

      const targetTech = techMap.get(techId);
      if (!targetTech) continue;

      // Check prerequisites
      if (!targetTech.prerequisites.every((p) => tech.researched.includes(p))) continue;

      // Check not already researched
      if (tech.researched.includes(techId)) continue;

      // Start research (or switch)
      tech.currentResearch = techId;
      tech.researchProgress = 0;
    }

    nationUpdates[nationId] = {
      ...nationUpdates[nationId],
      technology: { ...tech },
    };
  }

  // Advance research progress for all nations
  for (const [nationId, nation] of Object.entries(state.nations)) {
    const tech = (nationUpdates[nationId]?.technology as NationTechState | undefined) ??
      nation.technology ??
      defaultTechState(nation);

    if (!tech.currentResearch) {
      // Ensure tech state is initialized even if no research is active
      if (!nation.technology) {
        nationUpdates[nationId] = {
          ...nationUpdates[nationId],
          technology: tech,
        };
      }
      continue;
    }

    const targetTech = techMap.get(tech.currentResearch);
    if (!targetTech) continue;

    // Research per turn = base + ruler admin skill bonus
    const adminBonus = Math.max(0, (nation.ruler.adminSkill - 3) * 2);
    const rpt = tech.researchPerTurn + adminBonus;
    const newProgress = tech.researchProgress + rpt;

    if (newProgress >= targetTech.cost) {
      // Research complete
      tech.researched.push(tech.currentResearch);
      tech.currentResearch = null;
      tech.researchProgress = 0;

      events.push({
        id: generateId("evt"),
        type: "technology_discovered",
        turn: state.currentTurn,
        date: state.currentDate,
        source: "engine",
        data: { techId: targetTech.id, techName: targetTech.name, category: targetTech.category },
        description: `${nation.name} has discovered ${targetTech.name}!`,
        descriptionKey: "events.tech_discovered",
        descriptionParams: { nation: nation.name, tech: targetTech.name },
        affectedNations: [nationId],
      });
    } else {
      tech.researchProgress = newProgress;
    }

    nationUpdates[nationId] = {
      ...nationUpdates[nationId],
      technology: { ...tech },
    };
  }

  return { nationUpdates, events };
}

/**
 * Get cumulative tech bonuses for a nation.
 */
export function getTechBonuses(
  nation: Nation,
  techTree?: TechTree
): Record<string, number> {
  const tree = techTree ?? DEFAULT_TECH_TREE;
  const allTechs = tree.categories.flatMap((c) => c.techs);
  const techMap = new Map(allTechs.map((t) => [t.id, t]));

  const bonuses: Record<string, number> = {};
  const researched = nation.technology?.researched ?? [];

  for (const techId of researched) {
    const tech = techMap.get(techId);
    if (!tech) continue;

    for (const effect of tech.effects) {
      switch (effect.type) {
        case "military_bonus":
          bonuses[`military.${effect.stat}`] = (bonuses[`military.${effect.stat}`] ?? 0) + effect.value;
          break;
        case "economy_bonus":
          bonuses[`economy.${effect.stat}`] = (bonuses[`economy.${effect.stat}`] ?? 0) + effect.value;
          break;
        case "diplomacy_bonus":
          bonuses[`diplomacy.${effect.stat}`] = (bonuses[`diplomacy.${effect.stat}`] ?? 0) + effect.value;
          break;
        case "population_bonus":
          bonuses[`population.${effect.stat}`] = (bonuses[`population.${effect.stat}`] ?? 0) + effect.value;
          break;
      }
    }
  }

  return bonuses;
}

function defaultTechState(nation: Nation): NationTechState {
  return {
    researched: [],
    currentResearch: null,
    researchProgress: 0,
    // Base research per turn: 10 + admin skill * 2
    researchPerTurn: 10 + nation.ruler.adminSkill * 2,
  };
}
