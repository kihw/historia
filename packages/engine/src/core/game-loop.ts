import type {
  GameState,
  ParsedAction,
  StateDelta,
  TurnResult,
  GameEvent,
  DiplomacyAction,
  MilitaryAction,
  EconomyAction,
  InternalAction,
  EspionageAction,
} from "@historia/shared";
import { resolveEconomy } from "../systems/economy.js";
import { resolveCommerce } from "../systems/commerce.js";
import { resolveDiplomacy } from "../systems/diplomacy.js";
import { resolveMilitary } from "../systems/military.js";
import { resolvePopulation } from "../systems/population.js";
import { resolveTechnology } from "../systems/technology.js";
import { resolveEspionage } from "../systems/espionage.js";
import { evaluateEvents } from "../events/event-evaluator.js";

export interface TurnActions {
  nationId: string;
  actions: ParsedAction[];
}

/**
 * Resolve a complete game turn.
 *
 * Pipeline:
 * 1. Diplomacy resolution (treaties, war declarations)
 * 2. Economy resolution (income, expenses, trade)
 * 3. Population resolution (growth, stability, unrest)
 * 3b. Technology resolution (research progress, discoveries)
 * 3c. Espionage resolution (spying, sabotage, assassination)
 * 4. Military resolution (movement, combat)
 *
 * All systems are pure functions. The game loop composes them.
 */
export function resolveTurn(
  state: GameState,
  allActions: TurnActions[],
  seed: number
): TurnResult {
  let currentState = structuredClone(state);
  const allEvents: GameEvent[] = [];
  const delta: StateDelta = {
    turn: state.currentTurn + 1,
    nationChanges: {},
    provinceChanges: {},
    newWars: [],
    endedWars: [],
    newTreaties: [],
    endedTreaties: [],
    events: [],
  };

  // 1. Diplomacy
  for (const { nationId, actions } of allActions) {
    const diplomacyActions = actions.filter(
      (a): a is DiplomacyAction => a.type === "diplomacy"
    );
    if (diplomacyActions.length === 0) continue;

    const result = resolveDiplomacy(currentState, diplomacyActions, nationId);

    applyNationUpdates(currentState, result.nationUpdates);
    mergeNationChanges(delta.nationChanges, result.nationUpdates);
    currentState.activeWars.push(...result.newWars);
    currentState.activeTreaties.push(...result.newTreaties);
    currentState.activeWars = currentState.activeWars.filter(
      (w) => !result.endedWars.includes(w.id)
    );
    currentState.activeTreaties = currentState.activeTreaties.filter(
      (t) => !result.endedTreaties.includes(t.id)
    );
    delta.newWars.push(...result.newWars);
    delta.newTreaties.push(...result.newTreaties);
    delta.endedWars.push(...result.endedWars);
    delta.endedTreaties.push(...result.endedTreaties);
    allEvents.push(...result.events);

    // Apply territorial changes from peace treaties
    for (const [provId, change] of Object.entries(result.provinceChanges)) {
      if (currentState.provinces[provId]) {
        currentState.provinces[provId].owner = change.owner;
        currentState.provinces[provId].controller = change.owner;
        currentState.provinces[provId].occupation = undefined;
        delta.provinceChanges[provId] = { ...delta.provinceChanges[provId], ...change };
      }
    }
  }

  // 2. Economy (base income/expenses)
  const economyResult = resolveEconomy(currentState);
  applyNationUpdates(currentState, economyResult.nationUpdates);
  mergeNationChanges(delta.nationChanges, economyResult.nationUpdates);
  allEvents.push(...economyResult.events);

  // 2b. Commerce (trade routes, embargoes, resource trade)
  const commerceActions: { nationId: string; actions: EconomyAction[] }[] = [];
  for (const { nationId, actions } of allActions) {
    const econActions = actions.filter(
      (a): a is EconomyAction =>
        a.type === "economy" &&
        (a.subtype === "trade_route" || a.subtype === "embargo")
    );
    if (econActions.length > 0) {
      commerceActions.push({ nationId, actions: econActions });
    }
  }
  const commerceResult = resolveCommerce(
    currentState,
    commerceActions,
    seed + state.currentTurn + 2741
  );
  applyNationUpdates(currentState, commerceResult.nationUpdates);
  mergeNationChanges(delta.nationChanges, commerceResult.nationUpdates);
  currentState.activeTreaties.push(...commerceResult.newTreaties);
  currentState.activeTreaties = currentState.activeTreaties.filter(
    (t) => !commerceResult.endedTreaties.includes(t.id)
  );
  delta.newTreaties.push(...commerceResult.newTreaties);
  delta.endedTreaties.push(...commerceResult.endedTreaties);
  allEvents.push(...commerceResult.events);

  // 3. Population
  const populationResult = resolvePopulation(currentState);
  applyNationUpdates(currentState, populationResult.nationUpdates);
  mergeNationChanges(delta.nationChanges, populationResult.nationUpdates);
  allEvents.push(...populationResult.events);

  // 3b. Technology
  const techActions: { nationId: string; actions: InternalAction[] }[] = [];
  for (const { nationId, actions } of allActions) {
    const internalActions = actions.filter(
      (a): a is InternalAction => a.type === "internal" && a.subtype === "research"
    );
    if (internalActions.length > 0) {
      techActions.push({ nationId, actions: internalActions });
    }
  }
  const techResult = resolveTechnology(currentState, techActions);
  applyNationUpdates(currentState, techResult.nationUpdates);
  mergeNationChanges(delta.nationChanges, techResult.nationUpdates);
  allEvents.push(...techResult.events);

  // 3c. Espionage
  for (const { nationId, actions } of allActions) {
    const espionageActions = actions.filter(
      (a): a is EspionageAction => a.type === "espionage"
    );
    if (espionageActions.length === 0) continue;

    const result = resolveEspionage(
      currentState,
      espionageActions,
      nationId,
      seed + state.currentTurn + 3571
    );

    applyNationUpdates(currentState, result.nationUpdates);
    mergeNationChanges(delta.nationChanges, result.nationUpdates);
    allEvents.push(...result.events);
  }

  // 4. Military
  for (const { nationId, actions } of allActions) {
    const militaryActions = actions.filter(
      (a): a is MilitaryAction => a.type === "military"
    );
    if (militaryActions.length === 0) continue;

    const result = resolveMilitary(
      currentState,
      militaryActions,
      nationId,
      seed + state.currentTurn
    );

    applyNationUpdates(currentState, result.nationUpdates);
    mergeNationChanges(delta.nationChanges, result.nationUpdates);
    allEvents.push(...result.events);

    // Record battles in active wars
    for (const battle of result.battles) {
      for (const war of currentState.activeWars) {
        if (
          (war.attackers.includes(battle.attacker) &&
            war.defenders.includes(battle.defender)) ||
          (war.defenders.includes(battle.attacker) &&
            war.attackers.includes(battle.defender))
        ) {
          war.battles.push(battle);
          // Update war score
          const attackerWon = war.attackers.includes(battle.winner);
          war.warScore += attackerWon ? 10 : -10;
        }
      }
    }

    // Apply province occupation changes from sieges
    for (const [provId, change] of Object.entries(result.provinceChanges)) {
      if (currentState.provinces[provId]) {
        Object.assign(currentState.provinces[provId], change);
        delta.provinceChanges[provId] = { ...delta.provinceChanges[provId], ...change };
      }
    }
  }

  // 5. Causal Events
  if (currentState.causalGraph && currentState.pendingEvents.length > 0) {
    const eventResult = evaluateEvents(currentState, seed + 7919);

    // Create new nations first (create_nation effect puts full nation data in nationUpdates)
    for (const [nationId, update] of Object.entries(eventResult.nationUpdates)) {
      if (!currentState.nations[nationId] && update.id) {
        // This is a new nation — initialize it with defaults then apply the update
        currentState.nations[nationId] = {
          id: nationId,
          name: (update as Record<string, unknown>).name as string ?? nationId,
          tag: (update as Record<string, unknown>).tag as string ?? nationId.substring(0, 3).toUpperCase(),
          color: (update as Record<string, unknown>).color as string ?? "#888888",
          government: "republic",
          ruler: { name: "Unknown", dynastyName: "", age: 40, diplomacySkill: 5, militarySkill: 5, economySkill: 5, traits: [] },
          capital: "",
          provinces: [],
          playable: true,
          economy: { treasury: 100, income: 0, expenses: 0, inflation: 0, tradeIncome: 0 },
          military: { armies: [], manpower: 1000, maxManpower: 5000, navalForce: 0, fortifications: {} },
          population: { total: 10000, growth: 1, stability: 50, unrest: 0, culture: "unknown", religion: "unknown" },
          technology: { military: 1, economy: 1, culture: 1, naval: 1, researchProgress: {} },
          diplomacy: { relations: {}, alliances: [], truces: [], rivals: [] },
          espionage: { spyNetwork: {}, counterIntelligence: 3 },
          ...update,
        } as import("@historia/shared").Nation;
      }
    }

    applyNationUpdates(currentState, eventResult.nationUpdates);
    mergeNationChanges(delta.nationChanges, eventResult.nationUpdates);
    allEvents.push(...eventResult.triggeredEvents);

    // Apply province ownership changes
    for (const [provId, change] of Object.entries(eventResult.provinceChanges)) {
      if (currentState.provinces[provId]) {
        currentState.provinces[provId].owner = change.owner;
        delta.provinceChanges[provId] = { ...delta.provinceChanges[provId], ...change };
      }
    }

    // Update pending/occurred events
    currentState.pendingEvents = eventResult.newPendingEvents;
    currentState.occurredEvents = eventResult.newOccurredEvents;

    // Add any new wars from events
    currentState.activeWars.push(...eventResult.newWars);
    delta.newWars.push(...eventResult.newWars);
  }

  // Advance time
  currentState.currentTurn += 1;
  currentState.currentDate = advanceDate(
    currentState.currentDate,
    currentState.turnDuration
  );

  delta.events = allEvents;

  return {
    newState: currentState,
    delta,
    events: allEvents,
    narratives: {},
    globalNarrative: "",
  };
}

function applyNationUpdates(
  state: GameState,
  updates: Record<string, Partial<import("@historia/shared").Nation>>
): void {
  for (const [nationId, update] of Object.entries(updates)) {
    if (state.nations[nationId]) {
      state.nations[nationId] = {
        ...state.nations[nationId],
        ...update,
      } as import("@historia/shared").Nation;
    }
  }
}

function mergeNationChanges(
  target: Record<string, Partial<import("@historia/shared").Nation>>,
  source: Record<string, Partial<import("@historia/shared").Nation>>
): void {
  for (const [nationId, changes] of Object.entries(source)) {
    target[nationId] = { ...target[nationId], ...changes };
  }
}

function advanceDate(
  date: import("@historia/shared").GameDate,
  duration: import("@historia/shared").TurnDuration
): import("@historia/shared").GameDate {
  const d = { ...date };
  switch (duration) {
    case "1_week":
      d.day = (d.day ?? 1) + 7;
      if (d.day > 28) {
        d.day -= 28;
        d.month += 1;
      }
      break;
    case "1_month":
      d.month += 1;
      break;
    case "3_months":
      d.month += 3;
      break;
    case "6_months":
      d.month += 6;
      break;
    case "1_year":
      d.year += 1;
      break;
  }

  // Normalize months
  while (d.month > 12) {
    d.month -= 12;
    d.year += 1;
  }

  return d;
}
