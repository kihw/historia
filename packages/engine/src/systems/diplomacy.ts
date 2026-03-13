import type {
  GameState,
  Nation,
  DiplomacyAction,
  GameEvent,
  War,
  Treaty,
} from "@historia/shared";
import { generateId } from "@historia/shared";

export interface DiplomacyResult {
  nationUpdates: Record<string, Partial<Nation>>;
  newWars: War[];
  newTreaties: Treaty[];
  endedWars: string[];
  endedTreaties: string[];
  events: GameEvent[];
  provinceChanges: Record<string, { owner: string }>;
}

/**
 * Resolve diplomacy actions for a turn.
 */
export function resolveDiplomacy(
  state: GameState,
  actions: DiplomacyAction[],
  actingNationId: string
): DiplomacyResult {
  const nationUpdates: Record<string, Partial<Nation>> = {};
  const newWars: War[] = [];
  const newTreaties: Treaty[] = [];
  const endedWars: string[] = [];
  const endedTreaties: string[] = [];
  const events: GameEvent[] = [];
  const provinceChanges: Record<string, { owner: string }> = {};

  for (const action of actions) {
    switch (action.subtype) {
      case "declare_war":
        handleDeclareWar(
          state,
          actingNationId,
          action,
          newWars,
          endedTreaties,
          events
        );
        break;

      case "propose_alliance":
        handleProposeAlliance(
          state,
          actingNationId,
          action,
          newTreaties,
          nationUpdates,
          events
        );
        break;

      case "propose_peace":
        handleProposePeace(
          state,
          actingNationId,
          action,
          endedWars,
          newTreaties,
          nationUpdates,
          provinceChanges,
          events
        );
        break;

      case "improve_relations":
        handleImproveRelations(
          state,
          actingNationId,
          action,
          nationUpdates,
          events
        );
        break;
    }
  }

  return {
    nationUpdates,
    newWars,
    newTreaties,
    endedWars,
    endedTreaties,
    events,
    provinceChanges,
  };
}

function handleDeclareWar(
  state: GameState,
  actingNationId: string,
  action: DiplomacyAction,
  newWars: War[],
  endedTreaties: string[],
  events: GameEvent[]
): void {
  const attacker = state.nations[actingNationId];
  const defender = state.nations[action.target];
  if (!attacker || !defender) return;

  // Break any existing alliance
  const existingAlliance = state.activeTreaties.find(
    (t) =>
      t.type === "alliance" &&
      t.parties.includes(actingNationId) &&
      t.parties.includes(action.target)
  );
  if (existingAlliance) {
    endedTreaties.push(existingAlliance.id);
  }

  const war: War = {
    id: generateId("war"),
    name: `${attacker.name}-${defender.name} War`,
    attackers: [actingNationId],
    defenders: [action.target],
    startTurn: state.currentTurn,
    startDate: state.currentDate,
    warScore: 0,
    battles: [],
  };

  // Pull in allies
  for (const allyId of defender.diplomacy.alliances) {
    if (allyId !== actingNationId && state.nations[allyId]) {
      war.defenders.push(allyId);
    }
  }
  for (const allyId of attacker.diplomacy.alliances) {
    if (allyId !== action.target && state.nations[allyId]) {
      war.attackers.push(allyId);
    }
  }

  newWars.push(war);

  events.push({
    id: generateId("evt"),
    type: "war_declared",
    turn: state.currentTurn,
    date: state.currentDate,
    source: "engine",
    data: { warId: war.id, attacker: actingNationId, defender: action.target },
    description: `${attacker.name} has declared war on ${defender.name}!`,
    descriptionKey: "events.war_declared",
    descriptionParams: { attacker: attacker.name, defender: defender.name },
    affectedNations: [...war.attackers, ...war.defenders],
  });
}

function handleProposeAlliance(
  state: GameState,
  actingNationId: string,
  action: DiplomacyAction,
  newTreaties: Treaty[],
  nationUpdates: Record<string, Partial<Nation>>,
  events: GameEvent[]
): void {
  const proposer = state.nations[actingNationId];
  const target = state.nations[action.target];
  if (!proposer || !target) return;

  const relation = proposer.diplomacy.relations[action.target] ?? 0;

  // Acceptance threshold lowered by proposer's diplomacy skill (base 50, -3 per skill point above 5)
  const threshold = 50 - Math.max(0, (proposer.ruler.diplomacySkill - 5) * 3);
  if (relation > threshold) {
    const treaty: Treaty = {
      id: generateId("treaty"),
      type: "alliance",
      parties: [actingNationId, action.target],
      startTurn: state.currentTurn,
      terms: {},
    };
    newTreaties.push(treaty);

    events.push({
      id: generateId("evt"),
      type: "alliance_formed",
      turn: state.currentTurn,
      date: state.currentDate,
      source: "engine",
      data: { treatyId: treaty.id },
      description: `${proposer.name} and ${target.name} have formed an alliance!`,
      descriptionKey: "events.alliance_formed",
      descriptionParams: { nation1: proposer.name, nation2: target.name },
      affectedNations: [actingNationId, action.target],
    });
  }
}

function handleProposePeace(
  state: GameState,
  actingNationId: string,
  action: DiplomacyAction,
  endedWars: string[],
  newTreaties: Treaty[],
  nationUpdates: Record<string, Partial<Nation>>,
  provinceChanges: Record<string, { owner: string }>,
  events: GameEvent[]
): void {
  const ongoingWar = state.activeWars.find(
    (w) =>
      (w.attackers.includes(actingNationId) &&
        w.defenders.includes(action.target)) ||
      (w.defenders.includes(actingNationId) &&
        w.attackers.includes(action.target))
  );

  if (!ongoingWar) return;

  const proposer = state.nations[actingNationId];
  const target = state.nations[action.target];
  if (!proposer || !target) return;

  // Determine the winning side and collect occupied provinces for transfer
  const attackerSide = ongoingWar.attackers;
  const defenderSide = ongoingWar.defenders;
  const proposerIsAttacker = attackerSide.includes(actingNationId);

  // War score determines acceptance: positive = attacker advantage, negative = defender advantage
  // The LOSING side proposing peace must concede occupied provinces
  // The WINNING side proposing peace can choose a white peace
  const ws = ongoingWar.warScore;
  const proposerAdvantage = proposerIsAttacker ? ws : -ws;

  // AI acceptance: the other side accepts if they're losing or it's roughly even.
  // They refuse only if they're winning strongly (their advantage > 25).
  const opponentAdvantage = -proposerAdvantage;
  const accepts = opponentAdvantage < 25; // Accept unless opponent is winning hard
  if (!accepts) return; // Opponent refuses peace — they're winning too strongly

  endedWars.push(ongoingWar.id);

  // Collect provinces to transfer: occupied provinces change owner permanently
  const transferredProvinces: { provinceId: string; from: string; to: string }[] = [];

  for (const [provId, prov] of Object.entries(state.provinces)) {
    if (!prov.occupation) continue;
    if (prov.controller === prov.owner) continue;

    // Check if this occupation is related to this war
    const occupierInWar =
      attackerSide.includes(prov.controller) || defenderSide.includes(prov.controller);
    const ownerInWar =
      attackerSide.includes(prov.owner) || defenderSide.includes(prov.owner);

    if (occupierInWar && ownerInWar) {
      transferredProvinces.push({
        provinceId: provId,
        from: prov.owner,
        to: prov.controller,
      });
    }
  }

  // Apply territorial transfers
  for (const transfer of transferredProvinces) {
    provinceChanges[transfer.provinceId] = { owner: transfer.to };

    // Update nation province lists
    const fromNation = state.nations[transfer.from];
    const toNation = state.nations[transfer.to];

    if (fromNation) {
      const fromProvinces = (nationUpdates[transfer.from] as Partial<Nation>)?.provinces ?? [...fromNation.provinces];
      nationUpdates[transfer.from] = {
        ...nationUpdates[transfer.from],
        provinces: fromProvinces.filter((p) => p !== transfer.provinceId),
      };
    }

    if (toNation) {
      const toProvinces = (nationUpdates[transfer.to] as Partial<Nation>)?.provinces ?? [...toNation.provinces];
      if (!toProvinces.includes(transfer.provinceId)) {
        nationUpdates[transfer.to] = {
          ...nationUpdates[transfer.to],
          provinces: [...toProvinces, transfer.provinceId],
        };
      }
    }

    events.push({
      id: generateId("evt"),
      type: "province_conquered",
      turn: state.currentTurn,
      date: state.currentDate,
      source: "engine",
      data: { province: transfer.provinceId, from: transfer.from, to: transfer.to, reason: "peace_treaty" },
      description: `${state.provinces[transfer.provinceId]?.displayName ?? transfer.provinceId} has been ceded to ${toNation?.name ?? transfer.to}.`,
      descriptionKey: "events.province_ceded",
      descriptionParams: {
        province: state.provinces[transfer.provinceId]?.displayName ?? transfer.provinceId,
        nation: toNation?.name ?? transfer.to,
      },
      affectedNations: [transfer.from, transfer.to],
    });
  }

  // Create peace treaty
  const peaceTreaty: Treaty = {
    id: generateId("treaty"),
    type: "peace",
    parties: [actingNationId, action.target],
    startTurn: state.currentTurn,
    endTurn: state.currentTurn + 60, // 5 years truce
    terms: {
      ...action.terms,
      transferredProvinces: transferredProvinces.map((t) => t.provinceId),
    },
  };
  newTreaties.push(peaceTreaty);

  events.push({
    id: generateId("evt"),
    type: "peace_signed",
    turn: state.currentTurn,
    date: state.currentDate,
    source: "engine",
    data: {
      warId: ongoingWar.id,
      treatyId: peaceTreaty.id,
      provincesTransferred: transferredProvinces.length,
    },
    description: transferredProvinces.length > 0
      ? `${proposer.name} and ${target.name} have signed a peace treaty. ${transferredProvinces.length} province(s) changed hands.`
      : `${proposer.name} and ${target.name} have signed a white peace.`,
    descriptionKey: "events.peace_signed",
    descriptionParams: { nation1: proposer.name, nation2: target.name },
    affectedNations: [actingNationId, action.target],
  });

  // Clear occupation state from all provinces in this war
  for (const [provId, prov] of Object.entries(state.provinces)) {
    if (prov.occupation) {
      const occupierInWar =
        attackerSide.includes(prov.occupation.occupier) || defenderSide.includes(prov.occupation.occupier);
      if (occupierInWar) {
        // Reset occupation (will be applied via provinceChanges downstream or directly)
        if (!provinceChanges[provId]) {
          // Province not transferred — just clear occupation
          provinceChanges[provId] = { owner: prov.owner }; // keep original owner
        }
      }
    }
  }
}

function handleImproveRelations(
  state: GameState,
  actingNationId: string,
  action: DiplomacyAction,
  nationUpdates: Record<string, Partial<Nation>>,
  events: GameEvent[]
): void {
  const nation = state.nations[actingNationId];
  if (!nation) return;

  const currentRelation = nation.diplomacy.relations[action.target] ?? 0;
  // Ruler diplomacy skill bonus: base 15 + 2 per skill point
  const baseImprovement = 15 + nation.ruler.diplomacySkill * 2;
  const improvement = Math.min(baseImprovement, 200 - currentRelation);

  nationUpdates[actingNationId] = {
    diplomacy: {
      ...nation.diplomacy,
      relations: {
        ...nation.diplomacy.relations,
        [action.target]: currentRelation + improvement,
      },
    },
  };
}
