import type {
  GameState,
  Nation,
  GameEvent,
  EconomyAction,
  Treaty,
  ResourceType,
} from "@historia/shared";
import { generateId } from "@historia/shared";

export interface CommerceResult {
  nationUpdates: Record<string, Partial<Nation>>;
  newTreaties: Treaty[];
  endedTreaties: string[];
  events: GameEvent[];
}

/** Resource base value per unit for trade income calculation */
const RESOURCE_VALUE: Record<ResourceType, number> = {
  grain: 1,
  fish: 1,
  wood: 1.5,
  salt: 2,
  wine: 2.5,
  copper: 3,
  iron: 3,
  cotton: 3,
  coal: 4,
  silk: 5,
  spices: 6,
  gold: 8,
  oil: 7,
};

/**
 * Resolve commerce for a single turn.
 *
 * Trade income is computed from:
 * 1. Resources in owned provinces
 * 2. Active trade agreements (both nations get bonus)
 * 3. Trade power factor
 *
 * Embargoes reduce the target's trade income.
 */
export function resolveCommerce(
  state: GameState,
  economyActions: { nationId: string; actions: EconomyAction[] }[],
  seed: number
): CommerceResult {
  const nationUpdates: Record<string, Partial<Nation>> = {};
  const newTreaties: Treaty[] = [];
  const endedTreaties: string[] = [];
  const events: GameEvent[] = [];

  // 1. Compute each nation's resource portfolio
  const nationResources: Record<string, Record<ResourceType, number>> = {};
  for (const [nationId, nation] of Object.entries(state.nations)) {
    const resources: Partial<Record<ResourceType, number>> = {};
    for (const provId of nation.provinces) {
      const prov = state.provinces[provId];
      if (!prov) continue;
      for (const res of prov.resources) {
        resources[res] = (resources[res] ?? 0) + 1;
      }
    }
    nationResources[nationId] = resources as Record<ResourceType, number>;
  }

  // 2. Find active trade agreements & embargoes
  const tradeAgreements = state.activeTreaties.filter(
    (t) => t.type === "trade_agreement"
  );
  const activeEmbargoes: { from: string; target: string; treatyId: string }[] =
    state.activeTreaties
      .filter((t) => t.type === "non_aggression" && t.terms?.isEmbargo)
      .map((t) => ({
        from: t.parties[0],
        target: t.parties[1],
        treatyId: t.id,
      }));

  // 3. Process economy actions (trade_route, embargo)
  for (const { nationId, actions } of economyActions) {
    for (const action of actions) {
      if (action.subtype === "trade_route") {
        handleProposeTradeRoute(
          state,
          nationId,
          action,
          newTreaties,
          events
        );
      } else if (action.subtype === "embargo") {
        handleEmbargo(
          state,
          nationId,
          action,
          newTreaties,
          endedTreaties,
          events
        );
      }
    }
  }

  // 4. Compute trade income per nation
  for (const [nationId, nation] of Object.entries(state.nations)) {
    const resources = nationResources[nationId] ?? {};

    // Base resource value
    let resourceIncome = 0;
    for (const [res, count] of Object.entries(resources)) {
      resourceIncome +=
        (RESOURCE_VALUE[res as ResourceType] ?? 1) * count;
    }

    // Trade agreement bonuses
    let agreementBonus = 0;
    for (const agreement of tradeAgreements) {
      if (!agreement.parties.includes(nationId)) continue;
      const partnerId = agreement.parties.find((p) => p !== nationId);
      if (!partnerId) continue;
      const partner = state.nations[partnerId];
      if (!partner) continue;

      // Check if embargo blocks this trade
      const isEmbargoed = activeEmbargoes.some(
        (e) =>
          (e.from === nationId && e.target === partnerId) ||
          (e.from === partnerId && e.target === nationId)
      );
      if (isEmbargoed) continue;

      // Bonus based on complementary resources
      const partnerResources = nationResources[partnerId] ?? {};
      let complementarity = 0;
      for (const res of Object.keys(RESOURCE_VALUE) as ResourceType[]) {
        const myCount = resources[res] ?? 0;
        const theirCount = partnerResources[res] ?? 0;
        // Complementarity: value when one has what the other lacks
        if (myCount > 0 && theirCount === 0) complementarity += RESOURCE_VALUE[res] * 0.5;
        if (theirCount > 0 && myCount === 0) complementarity += RESOURCE_VALUE[res] * 0.3;
      }

      // Base trade agreement value + complementarity
      const tradeValue = 5 + complementarity * 0.5;
      agreementBonus += tradeValue;
    }

    // Embargo penalties
    let embargoPenalty = 0;
    for (const embargo of activeEmbargoes) {
      if (embargo.target === nationId) {
        embargoPenalty += 5 + resourceIncome * 0.1;
      }
    }

    // Trade power multiplier
    const tradePowerMultiplier = 1 + nation.economy.tradePower * 0.005;

    // Total trade income
    const tradeIncome =
      Math.max(0, resourceIncome + agreementBonus - embargoPenalty) *
      tradePowerMultiplier;

    // Update trade power based on activity
    const newTradePower = Math.min(
      100,
      nation.economy.tradePower +
        (agreementBonus > 0 ? 0.5 : -0.2) // Grow if trading, shrink if not
    );

    nationUpdates[nationId] = {
      economy: {
        ...nation.economy,
        tradePower: Math.max(0, newTradePower),
        monthlyIncome:
          nation.economy.monthlyIncome + tradeIncome,
        treasury: nation.economy.treasury + tradeIncome,
      },
    };

    // Generate events for significant trade activity
    if (tradeIncome > 20) {
      events.push({
        id: generateId("evt"),
        type: "economy_boom",
        turn: state.currentTurn,
        date: state.currentDate,
        source: "engine",
        data: { tradeIncome, agreements: tradeAgreements.filter(t => t.parties.includes(nationId)).length },
        description: `${nation.name}'s trade network generates ${Math.round(tradeIncome)} gold this turn.`,
        descriptionKey: "events.trade_income",
        descriptionParams: { nation: nation.name, income: Math.round(tradeIncome) },
        affectedNations: [nationId],
      });
    }

    if (embargoPenalty > 10) {
      events.push({
        id: generateId("evt"),
        type: "economy_crisis",
        turn: state.currentTurn,
        date: state.currentDate,
        source: "engine",
        data: { type: "embargo_damage", embargoPenalty },
        description: `${nation.name} suffers from trade embargoes, losing ${Math.round(embargoPenalty)} gold.`,
        descriptionKey: "events.embargo_damage",
        descriptionParams: { nation: nation.name, loss: Math.round(embargoPenalty) },
        affectedNations: [nationId],
      });
    }
  }

  return { nationUpdates, newTreaties, endedTreaties, events };
}

function handleProposeTradeRoute(
  state: GameState,
  nationId: string,
  action: EconomyAction,
  newTreaties: Treaty[],
  events: GameEvent[]
): void {
  const target = action.province; // reuse province field as target nation for trade
  if (!target) return;
  const proposer = state.nations[nationId];
  const targetNation = state.nations[target];
  if (!proposer || !targetNation) return;

  // Check if already have a trade agreement
  const existing = state.activeTreaties.find(
    (t) =>
      t.type === "trade_agreement" &&
      t.parties.includes(nationId) &&
      t.parties.includes(target)
  );
  if (existing) return;

  // Acceptance based on relations
  const relation = proposer.diplomacy.relations[target] ?? 0;
  const threshold = 20 - proposer.ruler.diplomacySkill * 2;

  if (relation >= threshold) {
    const treaty: Treaty = {
      id: generateId("treaty"),
      type: "trade_agreement",
      parties: [nationId, target],
      startTurn: state.currentTurn,
      terms: {},
    };
    newTreaties.push(treaty);

    events.push({
      id: generateId("evt"),
      type: "trade_agreement",
      turn: state.currentTurn,
      date: state.currentDate,
      source: "engine",
      data: { treatyId: treaty.id },
      description: `${proposer.name} and ${targetNation.name} have signed a trade agreement.`,
      descriptionKey: "events.trade_agreement",
      descriptionParams: { nation1: proposer.name, nation2: targetNation.name },
      affectedNations: [nationId, target],
    });
  } else {
    events.push({
      id: generateId("evt"),
      type: "diplomacy_failed",
      turn: state.currentTurn,
      date: state.currentDate,
      source: "engine",
      data: { action: "trade_route", target, reason: "relations_too_low" },
      description: `${targetNation.name} refused the trade proposal from ${proposer.name}.`,
      descriptionKey: "events.trade_refused",
      descriptionParams: { nation: proposer.name, target: targetNation.name },
      affectedNations: [nationId, target],
    });
  }
}

function handleEmbargo(
  state: GameState,
  nationId: string,
  action: EconomyAction,
  newTreaties: Treaty[],
  endedTreaties: string[],
  events: GameEvent[]
): void {
  const target = action.province; // reuse province field as target nation
  if (!target) return;
  const nation = state.nations[nationId];
  const targetNation = state.nations[target];
  if (!nation || !targetNation) return;

  // Check if already embargoing
  const existingEmbargo = state.activeTreaties.find(
    (t) =>
      t.terms?.isEmbargo &&
      t.parties[0] === nationId &&
      t.parties[1] === target
  );

  if (existingEmbargo) {
    // Lift the embargo
    endedTreaties.push(existingEmbargo.id);
    events.push({
      id: generateId("evt"),
      type: "embargo_lifted",
      turn: state.currentTurn,
      date: state.currentDate,
      source: "engine",
      data: { target },
      description: `${nation.name} has lifted its embargo on ${targetNation.name}.`,
      descriptionKey: "events.embargo_lifted",
      descriptionParams: { nation: nation.name, target: targetNation.name },
      affectedNations: [nationId, target],
    });
  } else {
    // Impose embargo — also breaks any trade agreement
    const tradeAgreement = state.activeTreaties.find(
      (t) =>
        t.type === "trade_agreement" &&
        t.parties.includes(nationId) &&
        t.parties.includes(target)
    );
    if (tradeAgreement) {
      endedTreaties.push(tradeAgreement.id);
    }

    const embargoTreaty: Treaty = {
      id: generateId("treaty"),
      type: "non_aggression", // reuse type, flagged as embargo
      parties: [nationId, target],
      startTurn: state.currentTurn,
      terms: { isEmbargo: true },
    };
    newTreaties.push(embargoTreaty);

    // Relation hit
    const currentRelation =
      nation.diplomacy.relations[target] ?? 0;
    const updatedDiplomacy = {
      ...nation.diplomacy,
      relations: {
        ...nation.diplomacy.relations,
        [target]: currentRelation - 20,
      },
    };

    events.push({
      id: generateId("evt"),
      type: "embargo_imposed",
      turn: state.currentTurn,
      date: state.currentDate,
      source: "engine",
      data: { target, relationDamage: -20 },
      description: `${nation.name} has imposed a trade embargo on ${targetNation.name}! Relations deteriorate.`,
      descriptionKey: "events.embargo_imposed",
      descriptionParams: { nation: nation.name, target: targetNation.name },
      affectedNations: [nationId, target],
    });

    // Store the diplomacy update — caller will merge
    // (We modify the state directly here since we don't return nationUpdates from this fn)
    state.nations[nationId] = {
      ...state.nations[nationId],
      diplomacy: updatedDiplomacy,
    };
  }
}
