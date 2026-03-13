import type {
  GameState,
  GameEvent,
  GameDate,
  CausalGraphNode,
  CausalGraphEdge,
  EventCondition,
  EventEffect,
  Nation,
  War,
} from "@historia/shared";
import { generateId } from "@historia/shared";

export interface EventEvaluationResult {
  triggeredEvents: GameEvent[];
  nationUpdates: Record<string, Partial<Nation>>;
  newPendingEvents: string[];
  newOccurredEvents: string[];
  newWars: War[];
  provinceChanges: Record<string, { owner: string }>;
}

/**
 * Evaluate the causal graph for the current turn.
 * Checks all pending events, fires those whose conditions are met,
 * applies effects, and follows causal edges.
 */
export function evaluateEvents(
  state: GameState,
  seed: number
): EventEvaluationResult {
  const result: EventEvaluationResult = {
    triggeredEvents: [],
    nationUpdates: {},
    newPendingEvents: [...state.pendingEvents],
    newOccurredEvents: [...state.occurredEvents],
    newWars: [],
    provinceChanges: {},
  };

  if (!state.causalGraph) return result;

  const { nodes, edges } = state.causalGraph;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Find events that are ready to fire this turn
  const toFire: string[] = [];

  for (const eventId of result.newPendingEvents) {
    const node = nodeMap.get(eventId);
    if (!node) continue;

    // Check if blocked by edges
    const blockedBy = edges.filter(
      (e) => e.type === "blocks" && e.to === eventId
    );
    const isBlocked = blockedBy.some((e) =>
      result.newOccurredEvents.includes(e.from)
    );
    if (isBlocked) continue;

    // Check if enabled by edges (if any "enables" edges exist, at least one must be satisfied)
    const enabledBy = edges.filter(
      (e) => e.type === "enables" && e.to === eventId
    );
    if (enabledBy.length > 0) {
      const isEnabled = enabledBy.some((e) =>
        result.newOccurredEvents.includes(e.from)
      );
      if (!isEnabled) continue;
    }

    // Check time window
    if (!isInTimeWindow(state.currentDate, node)) continue;

    // Check conditions
    if (!allConditionsMet(state, node.conditions)) continue;

    // Check prevention conditions
    if (node.preventionConditions) {
      const prevented = node.preventionConditions.some((pc) => {
        if (!allConditionsMet(state, pc.conditions)) return false;
        // Prevention succeeds based on difficulty and RNG
        const roll = seededRandom(seed + eventId.length);
        return roll < pc.difficulty;
      });
      if (prevented) continue;
    }

    toFire.push(eventId);
  }

  // Fire events and apply effects
  for (const eventId of toFire) {
    const node = nodeMap.get(eventId)!;

    // Remove from pending, add to occurred
    result.newPendingEvents = result.newPendingEvents.filter(
      (id) => id !== eventId
    );
    result.newOccurredEvents.push(eventId);

    // Create the game event
    const gameEvent: GameEvent = {
      id: `causal-${eventId}-${state.currentTurn}`,
      type: "historical_event",
      turn: state.currentTurn,
      date: state.currentDate,
      source: "scenario",
      data: { causalNodeId: eventId, name: node.name },
      description: node.description,
      descriptionKey: "events.historical_event",
      descriptionParams: { name: node.name },
      affectedNations: getAffectedNations(node),
    };
    result.triggeredEvents.push(gameEvent);

    // Apply effects
    for (const effect of node.effects) {
      applyEffect(effect, state, result);
    }

    // Follow "triggers" edges — add triggered events to pending for next evaluation
    const triggered = edges.filter(
      (e) => e.type === "triggers" && e.from === eventId
    );
    for (const edge of triggered) {
      if (
        !result.newPendingEvents.includes(edge.to) &&
        !result.newOccurredEvents.includes(edge.to)
      ) {
        result.newPendingEvents.push(edge.to);
      }
    }
  }

  return result;
}

function isInTimeWindow(currentDate: GameDate, node: CausalGraphNode): boolean {
  // If scheduledDate is set and we haven't reached it, don't fire
  // If triggerWindow is set, check if current date is within range
  if (node.triggerWindow) {
    const earliest = node.triggerWindow.earliest;
    const latest = node.triggerWindow.latest;
    if (compareDates(currentDate, earliest) < 0) return false;
    if (compareDates(currentDate, latest) > 0) return false;
  }

  if (node.scheduledDate && !node.triggerWindow) {
    // Exact scheduled date — must be at or past it
    if (compareDates(currentDate, node.scheduledDate) < 0) return false;
  }

  // For events with no time constraints, always eligible
  return true;
}

function compareDates(a: GameDate, b: GameDate): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

function allConditionsMet(state: GameState, conditions: EventCondition[]): boolean {
  return conditions.every((c) => checkCondition(state, c));
}

function checkCondition(state: GameState, condition: EventCondition): boolean {
  switch (condition.type) {
    case "nation_exists":
      return !!state.nations[condition.nation];

    case "relation_below": {
      const nationA = state.nations[condition.nationA];
      if (!nationA) return false;
      const rel = nationA.diplomacy.relations[condition.nationB] ?? 0;
      return rel < condition.threshold;
    }

    case "relation_above": {
      const nationA = state.nations[condition.nationA];
      if (!nationA) return false;
      const rel = nationA.diplomacy.relations[condition.nationB] ?? 0;
      return rel > condition.threshold;
    }

    case "stability_below": {
      const nation = state.nations[condition.nation];
      if (!nation) return false;
      return nation.population.stability < condition.threshold;
    }

    case "at_war": {
      return state.activeWars.some(
        (w) =>
          w.attackers.includes(condition.nation) ||
          w.defenders.includes(condition.nation)
      );
    }

    case "not_at_war": {
      return !state.activeWars.some(
        (w) =>
          w.attackers.includes(condition.nation) ||
          w.defenders.includes(condition.nation)
      );
    }

    case "event_occurred":
      return state.occurredEvents.includes(condition.event);

    case "date_reached":
      return compareDates(state.currentDate, condition.date) >= 0;

    case "province_owned_by": {
      const prov = state.provinces[condition.province];
      return prov?.owner === condition.nation;
    }

    case "alliance_includes": {
      // Check if enough of the listed nations are in alliance
      let alliedCount = 0;
      for (const nId of condition.nations) {
        const nation = state.nations[nId];
        if (!nation) continue;
        // Count nations that share at least one alliance partner from the list
        const hasAlly = condition.nations.some(
          (otherId) =>
            otherId !== nId && nation.diplomacy.alliances.includes(otherId)
        );
        if (hasAlly) alliedCount++;
      }
      return alliedCount >= condition.minMembers;
    }

    case "army_in_province": {
      let totalStrength = 0;
      for (const nation of Object.values(state.nations)) {
        if (condition.ownerNot && nation.id === condition.ownerNot) continue;
        for (const army of nation.military.armies) {
          if (army.location === condition.province) {
            totalStrength +=
              army.units.infantry + army.units.cavalry + army.units.artillery;
          }
        }
      }
      return totalStrength >= condition.minStrength;
    }

    default:
      return false;
  }
}

function applyEffect(
  effect: EventEffect,
  state: GameState,
  result: EventEvaluationResult
): void {
  switch (effect.type) {
    case "annex_province": {
      for (const provId of effect.provinces) {
        const prov = state.provinces[provId];
        if (!prov) continue;
        // Transfer province ownership
        const oldOwner = prov.owner;
        result.provinceChanges[provId] = { owner: effect.to };

        // Update nation province lists in updates
        if (state.nations[oldOwner]) {
          const currentProvinces =
            (result.nationUpdates[oldOwner] as { provinces?: string[] })?.provinces ??
            [...state.nations[oldOwner].provinces];
          (result.nationUpdates[oldOwner] as Record<string, unknown>) = {
            ...result.nationUpdates[oldOwner],
            provinces: currentProvinces.filter((p: string) => p !== provId),
          };
        }
        if (state.nations[effect.to]) {
          const currentProvinces =
            (result.nationUpdates[effect.to] as { provinces?: string[] })?.provinces ??
            [...state.nations[effect.to].provinces];
          (result.nationUpdates[effect.to] as Record<string, unknown>) = {
            ...result.nationUpdates[effect.to],
            provinces: [...currentProvinces, provId],
          };
        }
      }
      break;
    }

    case "destroy_nation": {
      // Mark nation as destroyed by removing all provinces
      if (state.nations[effect.nation]) {
        result.nationUpdates[effect.nation] = {
          ...result.nationUpdates[effect.nation],
          provinces: [],
          playable: false,
        };
      }
      break;
    }

    case "modify_relation": {
      for (const nationId of effect.nations) {
        const nation = state.nations[nationId];
        if (!nation) continue;
        const currentRelations = {
          ...(result.nationUpdates[nationId] as { diplomacy?: { relations: Record<string, number> } })
            ?.diplomacy?.relations ?? { ...nation.diplomacy.relations },
        };
        currentRelations[effect.target] =
          (currentRelations[effect.target] ?? 0) + effect.delta;
        // Clamp
        currentRelations[effect.target] = Math.max(
          -100,
          Math.min(100, currentRelations[effect.target])
        );
        result.nationUpdates[nationId] = {
          ...result.nationUpdates[nationId],
          diplomacy: {
            ...nation.diplomacy,
            ...(result.nationUpdates[nationId] as { diplomacy?: Record<string, unknown> })?.diplomacy,
            relations: currentRelations,
          },
        } as Partial<Nation>;
      }
      break;
    }

    case "modify_stat": {
      for (const nationId of effect.nations) {
        const nation = state.nations[nationId];
        if (!nation) continue;

        // Apply stat delta to the appropriate field
        const statPath = effect.stat.split(".");
        if (statPath[0] === "population" && statPath[1] === "stability") {
          const current = nation.population.stability;
          result.nationUpdates[nationId] = {
            ...result.nationUpdates[nationId],
            population: {
              ...nation.population,
              stability: Math.max(0, Math.min(100, current + effect.delta)),
            },
          };
        } else if (statPath[0] === "economy" && statPath[1] === "treasury") {
          const current = nation.economy.treasury;
          result.nationUpdates[nationId] = {
            ...result.nationUpdates[nationId],
            economy: {
              ...nation.economy,
              treasury: current + effect.delta,
            },
          };
        }
      }
      break;
    }

    case "trigger_event": {
      if (
        !result.newPendingEvents.includes(effect.event) &&
        !result.newOccurredEvents.includes(effect.event)
      ) {
        result.newPendingEvents.push(effect.event);
      }
      break;
    }

    case "spawn_army": {
      const nation = state.nations[effect.nation];
      if (!nation) break;
      const newArmies = [
        ...(result.nationUpdates[effect.nation] as { military?: { armies: unknown[] } })
          ?.military?.armies ?? [...nation.military.armies],
        {
          id: `spawned-${effect.nation}-${Date.now()}`,
          name: `New Army`,
          location: effect.province,
          units: {
            infantry: effect.units.infantry ?? 0,
            cavalry: effect.units.cavalry ?? 0,
            artillery: effect.units.artillery ?? 0,
          },
          morale: 80,
          supply: 100,
        },
      ];
      result.nationUpdates[effect.nation] = {
        ...result.nationUpdates[effect.nation],
        military: {
          ...nation.military,
          armies: newArmies,
        },
      } as Partial<Nation>;
      break;
    }

    case "change_government": {
      if (state.nations[effect.nation]) {
        result.nationUpdates[effect.nation] = {
          ...result.nationUpdates[effect.nation],
          government: effect.government as Nation["government"],
        };
      }
      break;
    }

    case "create_nation": {
      // Create a new nation from the effect data
      const nationData = effect.nation;
      const nationId = nationData.id as string;
      if (!nationId || state.nations[nationId]) break; // already exists or invalid

      // Build minimal nation from provided data
      result.nationUpdates[nationId] = {
        id: nationId,
        name: (nationData.name as string) ?? nationId,
        tag: (nationData.tag as string) ?? nationId.substring(0, 3).toUpperCase(),
        color: (nationData.color as string) ?? "#888888",
        government: (nationData.government as Nation["government"]) ?? "republic",
        ruler: (nationData.ruler as Nation["ruler"]) ?? {
          name: "Unknown Ruler",
          dynastyName: "",
          age: 40,
          diplomacySkill: 5,
          militarySkill: 5,
          economySkill: 5,
          traits: [],
        },
        capital: (nationData.capital as string) ?? "",
        provinces: (nationData.provinces as string[]) ?? [],
        playable: true,
      } as Partial<Nation>;

      // Transfer provinces to new nation
      const newProvinces = (nationData.provinces as string[]) ?? [];
      for (const provId of newProvinces) {
        const prov = state.provinces[provId];
        if (prov) {
          const oldOwner = prov.owner;
          result.provinceChanges[provId] = { owner: nationId };

          // Remove from old owner
          if (state.nations[oldOwner] && oldOwner !== nationId) {
            const oldProvinces =
              (result.nationUpdates[oldOwner] as { provinces?: string[] })?.provinces ??
              [...state.nations[oldOwner].provinces];
            (result.nationUpdates[oldOwner] as Record<string, unknown>) = {
              ...result.nationUpdates[oldOwner],
              provinces: oldProvinces.filter((p: string) => p !== provId),
            };
          }
        }
      }
      break;
    }

    case "annex":
    case "annex_nation": {
      // Annex an entire nation — transfer ALL provinces from annexed to annexer
      const annexer = (effect as { annexer: string }).annexer;
      const annexed = (effect as { annexed: string }).annexed;
      const annexedNation = state.nations[annexed];
      if (!annexedNation || !state.nations[annexer]) break;

      const provincesToTransfer = [...annexedNation.provinces];
      for (const provId of provincesToTransfer) {
        result.provinceChanges[provId] = { owner: annexer };
      }

      // Add provinces to annexer
      const annexerProvinces =
        (result.nationUpdates[annexer] as { provinces?: string[] })?.provinces ??
        [...state.nations[annexer].provinces];
      (result.nationUpdates[annexer] as Record<string, unknown>) = {
        ...result.nationUpdates[annexer],
        provinces: [...annexerProvinces, ...provincesToTransfer],
      };

      // Destroy annexed nation
      result.nationUpdates[annexed] = {
        ...result.nationUpdates[annexed],
        provinces: [],
        playable: false,
      };
      break;
    }

    case "start_war": {
      const attacker = state.nations[effect.attacker];
      const defender = state.nations[effect.defender];
      if (!attacker || !defender) break;

      const war: War = {
        id: generateId("war"),
        name: effect.warName ?? `${attacker.name}-${defender.name} War`,
        attackers: [effect.attacker],
        defenders: [effect.defender],
        startTurn: state.currentTurn,
        startDate: state.currentDate,
        warScore: 0,
        battles: [],
      };
      result.newWars.push(war);
      break;
    }

    case "end_war": {
      // end_war not directly supported in result — wars are ended via diplomacy
      break;
    }
  }
}

function getAffectedNations(node: CausalGraphNode): string[] {
  const nations = new Set<string>();
  for (const effect of node.effects) {
    switch (effect.type) {
      case "annex_province":
        nations.add(effect.from);
        nations.add(effect.to);
        break;
      case "annex":
      case "annex_nation":
        nations.add((effect as { annexer: string }).annexer);
        nations.add((effect as { annexed: string }).annexed);
        break;
      case "start_war":
        nations.add(effect.attacker);
        nations.add(effect.defender);
        break;
      case "destroy_nation":
        nations.add(effect.nation);
        break;
      case "modify_relation":
        effect.nations.forEach((n) => nations.add(n));
        nations.add(effect.target);
        break;
      case "modify_stat":
        effect.nations.forEach((n) => nations.add(n));
        break;
      case "spawn_army":
        nations.add(effect.nation);
        break;
      case "change_government":
        nations.add(effect.nation);
        break;
      case "create_nation": {
        const id = effect.nation.id as string;
        if (id) nations.add(id);
        break;
      }
    }
  }
  return Array.from(nations);
}

function seededRandom(seed: number): number {
  let s = seed | 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
