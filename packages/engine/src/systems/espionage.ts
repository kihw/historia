import type { GameState, GameEvent, EspionageAction, Nation } from "@historia/shared";

export interface EspionageResult {
  nationUpdates: Record<string, Partial<Nation>>;
  events: GameEvent[];
}

/**
 * Seeded pseudo-random number generator for deterministic espionage outcomes.
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function makeEvent(
  state: GameState,
  id: string,
  description: string,
  affected: string[],
  data: Record<string, unknown> = {},
  descriptionKey?: string,
  descriptionParams?: Record<string, string | number>
): GameEvent {
  return {
    id,
    type: "espionage",
    turn: state.currentTurn,
    date: { ...state.currentDate },
    source: "engine",
    description,
    descriptionKey,
    descriptionParams,
    affectedNations: affected,
    data,
  };
}

/**
 * Resolve espionage actions for a nation.
 *
 * Success depends on:
 * - Ruler diplomacy skill (spycraft)
 * - Target's stability (low stability = easier to infiltrate)
 * - Random factor (seeded for determinism)
 */
export function resolveEspionage(
  state: GameState,
  actions: EspionageAction[],
  nationId: string,
  seed: number
): EspionageResult {
  const rand = seededRandom(seed);
  const nationUpdates: Record<string, Partial<Nation>> = {};
  const events: GameEvent[] = [];

  const nation = state.nations[nationId];
  if (!nation) return { nationUpdates, events };

  for (const action of actions) {
    const target = state.nations[action.target];
    if (!target) continue;

    // Base success chance: 30% + diplomacy skill bonus (up to +20%)
    const baseChance = 0.3 + nation.ruler.diplomacySkill * 0.02;
    // Target stability penalty: high stability reduces success
    const stabilityPenalty = (target.population.stability / 100) * 0.2;
    // Counter-intel bonus for target (if they have high military skill)
    const counterIntelPenalty = target.ruler.militarySkill * 0.015;
    const successChance = Math.max(0.05, Math.min(0.85, baseChance - stabilityPenalty - counterIntelPenalty));
    const roll = rand();
    const success = roll < successChance;
    // Detection: if fails, 50% chance of being caught
    const detected = !success && rand() < 0.5;

    switch (action.subtype) {
      case "spy_on": {
        if (success) {
          events.push(makeEvent(
            state,
            `esp-${nationId}-spy-${state.currentTurn}`,
            `${nation.name}'s spies successfully gathered intelligence on ${target.name}. Treasury: ~${Math.round(target.economy.treasury)} gold, Manpower: ~${target.military.manpower}.`,
            [nationId],
            { subtype: "spy_on", success: true },
            "events.spy_success",
            { nation: nation.name, target: target.name, treasury: Math.round(target.economy.treasury), manpower: target.military.manpower }
          ));
        } else if (detected) {
          const newRelations = { ...target.diplomacy.relations };
          newRelations[nationId] = (newRelations[nationId] ?? 0) - 15;
          nationUpdates[action.target] = {
            diplomacy: { ...target.diplomacy, relations: newRelations },
          };
          events.push(makeEvent(
            state,
            `esp-${nationId}-spy-caught-${state.currentTurn}`,
            `${nation.name}'s spy was caught in ${target.name}! Relations have deteriorated.`,
            [nationId, action.target],
            { subtype: "spy_on", success: false, detected: true },
            "events.spy_caught",
            { nation: nation.name, target: target.name }
          ));
        }
        break;
      }

      case "sabotage": {
        if (success) {
          const damage = 20 + rand() * 40;
          const newEconomy = { ...target.economy };
          newEconomy.treasury = Math.max(0, newEconomy.treasury - damage);
          nationUpdates[action.target] = {
            ...nationUpdates[action.target],
            economy: newEconomy,
          };
          events.push(makeEvent(
            state,
            `esp-${nationId}-sabotage-${state.currentTurn}`,
            `Agents of ${nation.name} sabotaged ${target.name}'s infrastructure, causing ${damage.toFixed(0)} gold in damages.`,
            [nationId, action.target],
            { subtype: "sabotage", success: true, damage },
            "events.spy_sabotage_success",
            { nation: nation.name, target: target.name, damage: Math.round(damage) }
          ));
        } else if (detected) {
          const newRelations = { ...target.diplomacy.relations };
          newRelations[nationId] = (newRelations[nationId] ?? 0) - 25;
          nationUpdates[action.target] = {
            ...nationUpdates[action.target],
            diplomacy: { ...target.diplomacy, relations: newRelations },
          };
          events.push(makeEvent(
            state,
            `esp-${nationId}-sabotage-caught-${state.currentTurn}`,
            `${target.name} intercepted saboteurs from ${nation.name}. A diplomatic crisis ensues.`,
            [nationId, action.target],
            { subtype: "sabotage", success: false, detected: true },
            "events.spy_sabotage_caught",
            { nation: nation.name, target: target.name }
          ));
        }
        break;
      }

      case "steal_tech": {
        if (success && nation.technology) {
          const boost = 15 + rand() * 10;
          const newTech = { ...nation.technology };
          newTech.researchProgress += boost;
          nationUpdates[nationId] = {
            ...nationUpdates[nationId],
            technology: newTech,
          };
          events.push(makeEvent(
            state,
            `esp-${nationId}-stealtech-${state.currentTurn}`,
            `${nation.name}'s agents stole technological secrets from ${target.name}, advancing research.`,
            [nationId, action.target],
            { subtype: "steal_tech", success: true, boost },
            "events.spy_steal_tech_success",
            { nation: nation.name, target: target.name }
          ));
        } else if (detected) {
          const newRelations = { ...target.diplomacy.relations };
          newRelations[nationId] = (newRelations[nationId] ?? 0) - 20;
          nationUpdates[action.target] = {
            ...nationUpdates[action.target],
            diplomacy: { ...target.diplomacy, relations: newRelations },
          };
          events.push(makeEvent(
            state,
            `esp-${nationId}-stealtech-caught-${state.currentTurn}`,
            `${target.name} caught spies from ${nation.name} attempting to steal technology.`,
            [nationId, action.target],
            { subtype: "steal_tech", success: false, detected: true },
            "events.spy_steal_tech_caught",
            { nation: nation.name, target: target.name }
          ));
        }
        break;
      }

      case "sow_discord": {
        if (success) {
          const stabilityHit = 3 + Math.floor(rand() * 5);
          const newPop = { ...target.population };
          newPop.stability = Math.max(0, newPop.stability - stabilityHit);
          nationUpdates[action.target] = {
            ...nationUpdates[action.target],
            population: newPop,
          };
          events.push(makeEvent(
            state,
            `esp-${nationId}-discord-${state.currentTurn}`,
            `Agents provocateurs from ${nation.name} sowed unrest in ${target.name}. Stability decreased by ${stabilityHit}.`,
            [nationId, action.target],
            { subtype: "sow_discord", success: true, stabilityHit },
            "events.spy_discord_success",
            { nation: nation.name, target: target.name, stabilityHit }
          ));
        } else if (detected) {
          const newRelations = { ...target.diplomacy.relations };
          newRelations[nationId] = (newRelations[nationId] ?? 0) - 20;
          nationUpdates[action.target] = {
            ...nationUpdates[action.target],
            diplomacy: { ...target.diplomacy, relations: newRelations },
          };
          events.push(makeEvent(
            state,
            `esp-${nationId}-discord-caught-${state.currentTurn}`,
            `${target.name} uncovered a plot by ${nation.name} to destabilize the country.`,
            [nationId, action.target],
            { subtype: "sow_discord", success: false, detected: true },
            "events.spy_discord_caught",
            { nation: nation.name, target: target.name }
          ));
        }
        break;
      }

      case "assassinate": {
        const assassinChance = successChance * 0.4; // Much harder
        if (rand() < assassinChance) {
          const newRuler = { ...target.ruler };
          newRuler.adminSkill = Math.max(0, newRuler.adminSkill - 2);
          newRuler.diplomacySkill = Math.max(0, newRuler.diplomacySkill - 2);
          newRuler.militarySkill = Math.max(0, newRuler.militarySkill - 2);
          const newPop = { ...target.population };
          newPop.stability = Math.max(0, newPop.stability - 10);
          nationUpdates[action.target] = {
            ...nationUpdates[action.target],
            ruler: newRuler,
            population: newPop,
          };
          events.push(makeEvent(
            state,
            `esp-${nationId}-assassin-${state.currentTurn}`,
            `An assassination attempt on ${target.ruler.name} of ${target.name}! The ruler survived but was injured, losing effectiveness.`,
            [nationId, action.target],
            { subtype: "assassinate", success: true },
            "events.spy_assassinate_success",
            { nation: nation.name, target: target.name, ruler: target.ruler.name }
          ));
        } else {
          // Almost always detected
          const newRelations = { ...target.diplomacy.relations };
          newRelations[nationId] = (newRelations[nationId] ?? 0) - 40;
          nationUpdates[action.target] = {
            ...nationUpdates[action.target],
            diplomacy: { ...target.diplomacy, relations: newRelations },
          };
          events.push(makeEvent(
            state,
            `esp-${nationId}-assassin-fail-${state.currentTurn}`,
            `An assassination plot by ${nation.name} against ${target.ruler.name} of ${target.name} was foiled. Relations severely damaged.`,
            [nationId, action.target],
            { subtype: "assassinate", success: false, detected: true },
            "events.spy_assassinate_caught",
            { nation: nation.name, target: target.name, ruler: target.ruler.name }
          ));
        }
        break;
      }

      case "counter_intel": {
        const stabilityGain = 2 + Math.floor(rand() * 3);
        const newPop = { ...nation.population };
        newPop.stability = Math.min(100, newPop.stability + stabilityGain);
        nationUpdates[nationId] = {
          ...nationUpdates[nationId],
          population: newPop,
        };
        events.push(makeEvent(
          state,
          `esp-${nationId}-counterintel-${state.currentTurn}`,
          `${nation.name} strengthened its counter-intelligence operations. Stability increased by ${stabilityGain}.`,
          [nationId],
          { subtype: "counter_intel", stabilityGain },
          "events.spy_counter_intel",
          { nation: nation.name, stabilityGain }
        ));
        break;
      }
    }
  }

  return { nationUpdates, events };
}
