import type {
  GameState,
  Nation,
  Army,
  GameEvent,
  BattleRecord,
  MilitaryAction,
  Province,
} from "@historia/shared";
import { generateId, createRNG } from "@historia/shared";

export interface MilitaryResult {
  nationUpdates: Record<string, Partial<Nation>>;
  battles: BattleRecord[];
  events: GameEvent[];
  provinceChanges: Record<string, Partial<Province>>;
}

/**
 * Resolve military actions and auto-battles for a turn.
 */
export function resolveMilitary(
  state: GameState,
  actions: MilitaryAction[],
  actingNationId: string,
  seed: number
): MilitaryResult {
  const rng = createRNG(seed);
  const nationUpdates: Record<string, Partial<Nation>> = {};
  const battles: BattleRecord[] = [];
  const events: GameEvent[] = [];
  const provinceChanges: Record<string, Partial<Province>> = {};

  const nation = state.nations[actingNationId];
  if (!nation) return { nationUpdates, battles, events, provinceChanges };

  for (const action of actions) {
    switch (action.subtype) {
      case "move_army":
        handleMoveArmy(state, nation, actingNationId, action, nationUpdates);
        break;

      case "recruit":
        handleRecruit(state, nation, actingNationId, action, nationUpdates, events);
        break;
    }
  }

  // Auto-resolve battles when armies share a province during war
  resolveBattles(state, rng, battles, nationUpdates, events);

  // Siege & occupy enemy provinces where armies are present
  resolveSieges(state, nationUpdates, provinceChanges, events);

  return { nationUpdates, battles, events, provinceChanges };
}

function handleMoveArmy(
  state: GameState,
  nation: Nation,
  nationId: string,
  action: MilitaryAction,
  nationUpdates: Record<string, Partial<Nation>>
): void {
  if (!action.armyId || !action.target) return;

  const targetProvince = action.target;
  const army = nation.military.armies.find((a) => a.id === action.armyId);
  if (!army) return;

  // Check target is a neighbor of current location
  const currentProvince = state.provinces[army.location];
  if (!currentProvince?.neighbors.includes(targetProvince)) return;

  const updatedArmies = nation.military.armies.map((a) =>
    a.id === action.armyId ? { ...a, location: targetProvince } : a
  );

  nationUpdates[nationId] = {
    ...nationUpdates[nationId],
    military: {
      ...nation.military,
      armies: updatedArmies,
    },
  };
}

function handleRecruit(
  state: GameState,
  nation: Nation,
  nationId: string,
  action: MilitaryAction,
  nationUpdates: Record<string, Partial<Nation>>,
  events: GameEvent[]
): void {
  const requested = action.units ?? {};
  const totalRequested =
    (requested.infantry ?? 0) +
    (requested.cavalry ?? 0) +
    (requested.artillery ?? 0);

  if (totalRequested <= 0) return;

  // Check manpower
  const available = nation.military.manpower;
  if (available < totalRequested) return;

  // Check treasury (rough cost: 1 gold per 100 troops)
  const cost = totalRequested * 0.01;
  if (nation.economy.treasury < cost) return;

  const location = nation.capital;
  const newArmy: Army = {
    id: generateId("army"),
    name: `New ${nation.tag} Army`,
    location,
    units: {
      infantry: requested.infantry ?? 0,
      cavalry: requested.cavalry ?? 0,
      artillery: requested.artillery ?? 0,
    },
    morale: 0.5,
    supply: 1.0,
  };

  const existingUpdates = nationUpdates[nationId] ?? {};
  const currentArmies =
    (existingUpdates as Partial<Nation>).military?.armies ??
    nation.military.armies;

  nationUpdates[nationId] = {
    ...existingUpdates,
    military: {
      ...nation.military,
      ...((existingUpdates as Partial<Nation>).military ?? {}),
      armies: [...currentArmies, newArmy],
      manpower: available - totalRequested,
    },
    economy: {
      ...nation.economy,
      ...((existingUpdates as Partial<Nation>).economy ?? {}),
      treasury: nation.economy.treasury - cost,
    },
  };

  events.push({
    id: generateId("evt"),
    type: "building_completed",
    turn: state.currentTurn,
    date: state.currentDate,
    source: "engine",
    data: { type: "recruitment", armyId: newArmy.id, units: newArmy.units },
    description: `${nation.name} has recruited ${totalRequested} new troops.`,
    descriptionKey: "events.troops_recruited",
    descriptionParams: { nation: nation.name, count: totalRequested },
    affectedNations: [nationId],
  });
}

/**
 * Simplified Lanchester combat model.
 * Resolve battles when opposing armies occupy the same province.
 * Also applies losses to armies and updates war exhaustion.
 */
function resolveBattles(
  state: GameState,
  rng: () => number,
  battles: BattleRecord[],
  nationUpdates: Record<string, Partial<Nation>>,
  events: GameEvent[]
): void {
  // Build current army positions (including updates from this turn)
  const armiesByProvince = new Map<string, { nationId: string; army: Army }[]>();

  for (const [nationId, nation] of Object.entries(state.nations)) {
    const currentArmies =
      (nationUpdates[nationId] as Partial<Nation>)?.military?.armies ??
      nation.military.armies;

    for (const army of currentArmies) {
      const list = armiesByProvince.get(army.location) ?? [];
      list.push({ nationId, army });
      armiesByProvince.set(army.location, list);
    }
  }

  for (const [provinceId, armiesInProvince] of armiesByProvince) {
    if (armiesInProvince.length < 2) continue;

    // Check if any are at war with each other
    for (let i = 0; i < armiesInProvince.length; i++) {
      for (let j = i + 1; j < armiesInProvince.length; j++) {
        const a = armiesInProvince[i];
        const b = armiesInProvince[j];

        const atWar = state.activeWars.some(
          (w) =>
            (w.attackers.includes(a.nationId) &&
              w.defenders.includes(b.nationId)) ||
            (w.defenders.includes(a.nationId) &&
              w.attackers.includes(b.nationId))
        );

        if (!atWar) continue;

        const battle = resolveBattle(
          state,
          rng,
          a.nationId,
          a.army,
          b.nationId,
          b.army,
          provinceId
        );
        battles.push(battle);

        // Apply losses to armies
        applyBattleLosses(state, a.nationId, a.army.id, battle.attackerLosses, nationUpdates);
        applyBattleLosses(state, b.nationId, b.army.id, battle.defenderLosses, nationUpdates);

        // Increase war exhaustion for both
        applyWarExhaustion(state, a.nationId, battle.attackerLosses, nationUpdates);
        applyWarExhaustion(state, b.nationId, battle.defenderLosses, nationUpdates);

        // Loser retreats (if they lost more than 30% strength)
        const loserNationId = battle.winner === a.nationId ? b.nationId : a.nationId;
        const loserArmy = battle.winner === a.nationId ? b.army : a.army;
        const loserLosses = battle.winner === a.nationId ? battle.defenderLosses : battle.attackerLosses;
        const loserStrength = calculateStrength(loserArmy);
        if (loserLosses > loserStrength * 0.3) {
          retreatArmy(state, loserNationId, loserArmy.id, provinceId, nationUpdates);
        }

        const province = state.provinces[provinceId];
        events.push({
          id: generateId("evt"),
          type: "battle_fought",
          turn: state.currentTurn,
          date: state.currentDate,
          source: "engine",
          data: { ...battle } as unknown as Record<string, unknown>,
          description: `Battle of ${province?.name ?? provinceId}: ${state.nations[battle.winner]?.name ?? battle.winner} victorious! (Losses: ${battle.attackerLosses}/${battle.defenderLosses})`,
          descriptionKey: "events.battle_fought",
          descriptionParams: { province: province?.name ?? provinceId, winner: state.nations[battle.winner]?.name ?? battle.winner, attackerLosses: battle.attackerLosses, defenderLosses: battle.defenderLosses },
          affectedNations: [a.nationId, b.nationId],
        });
      }
    }
  }
}

/**
 * Apply troop losses proportionally across unit types.
 */
function applyBattleLosses(
  state: GameState,
  nationId: string,
  armyId: string,
  totalLosses: number,
  nationUpdates: Record<string, Partial<Nation>>
): void {
  const nation = state.nations[nationId];
  if (!nation) return;

  const currentArmies =
    (nationUpdates[nationId] as Partial<Nation>)?.military?.armies ??
    nation.military.armies;

  const updatedArmies = currentArmies.map((army) => {
    if (army.id !== armyId) return army;

    const total = army.units.infantry + army.units.cavalry + army.units.artillery;
    if (total <= 0) return army;

    const lossFraction = Math.min(0.9, totalLosses / total);
    return {
      ...army,
      units: {
        infantry: Math.max(0, Math.floor(army.units.infantry * (1 - lossFraction))),
        cavalry: Math.max(0, Math.floor(army.units.cavalry * (1 - lossFraction))),
        artillery: Math.max(0, Math.floor(army.units.artillery * (1 - lossFraction))),
      },
      morale: Math.max(0.1, army.morale - lossFraction * 0.3),
    };
  }).filter((army) => {
    // Remove destroyed armies (fewer than 100 troops total)
    const total = army.units.infantry + army.units.cavalry + army.units.artillery;
    return total >= 100;
  });

  nationUpdates[nationId] = {
    ...nationUpdates[nationId],
    military: {
      ...nation.military,
      ...((nationUpdates[nationId] as Partial<Nation>)?.military ?? {}),
      armies: updatedArmies,
    },
  };
}

/**
 * Increase war exhaustion based on losses.
 */
function applyWarExhaustion(
  state: GameState,
  nationId: string,
  losses: number,
  nationUpdates: Record<string, Partial<Nation>>
): void {
  const nation = state.nations[nationId];
  if (!nation) return;

  const currentExhaustion =
    (nationUpdates[nationId] as Partial<Nation>)?.population?.warExhaustion ??
    nation.population.warExhaustion;

  const exhaustionIncrease = Math.min(10, losses / 1000);

  nationUpdates[nationId] = {
    ...nationUpdates[nationId],
    population: {
      ...nation.population,
      ...((nationUpdates[nationId] as Partial<Nation>)?.population ?? {}),
      warExhaustion: Math.min(100, currentExhaustion + exhaustionIncrease),
    },
  };
}

/**
 * Retreat an army to a friendly neighbor province.
 */
function retreatArmy(
  state: GameState,
  nationId: string,
  armyId: string,
  currentProvinceId: string,
  nationUpdates: Record<string, Partial<Nation>>
): void {
  const nation = state.nations[nationId];
  if (!nation) return;

  const currentProvince = state.provinces[currentProvinceId];
  if (!currentProvince) return;

  // Find a friendly neighbor to retreat to
  const retreatTarget = currentProvince.neighbors.find((nId) => {
    const neighbor = state.provinces[nId];
    return neighbor && neighbor.owner === nationId;
  }) ?? currentProvince.neighbors[0];

  if (!retreatTarget) return;

  const currentArmies =
    (nationUpdates[nationId] as Partial<Nation>)?.military?.armies ??
    nation.military.armies;

  const updatedArmies = currentArmies.map((army) =>
    army.id === armyId ? { ...army, location: retreatTarget } : army
  );

  nationUpdates[nationId] = {
    ...nationUpdates[nationId],
    military: {
      ...nation.military,
      ...((nationUpdates[nationId] as Partial<Nation>)?.military ?? {}),
      armies: updatedArmies,
    },
  };
}

function resolveBattle(
  state: GameState,
  rng: () => number,
  attackerNation: string,
  attackerArmy: Army,
  defenderNation: string,
  defenderArmy: Army,
  province: string
): BattleRecord {
  // Ruler military skill bonus: +5% strength per skill point above 5
  const atkRuler = state.nations[attackerNation]?.ruler;
  const defRuler = state.nations[defenderNation]?.ruler;
  const atkSkillBonus = 1 + Math.max(0, ((atkRuler?.militarySkill ?? 5) - 5) * 0.05);
  const defSkillBonus = 1 + Math.max(0, ((defRuler?.militarySkill ?? 5) - 5) * 0.05);

  const attackerStrength = calculateStrength(attackerArmy) * atkSkillBonus;
  const defenderStrength = calculateStrength(defenderArmy) * 1.1 * defSkillBonus; // defender bonus

  const totalStrength = attackerStrength + defenderStrength;
  const attackerWinChance = attackerStrength / totalStrength;

  // Add randomness
  const roll = rng();
  const attackerWins = roll < attackerWinChance;

  // Calculate losses (modified Lanchester)
  const ratio = attackerWins
    ? defenderStrength / attackerStrength
    : attackerStrength / defenderStrength;
  const winnerLossPct = 0.05 + ratio * 0.1 + rng() * 0.05;
  const loserLossPct = 0.15 + (1 - ratio) * 0.2 + rng() * 0.1;

  const attackerLosses = Math.floor(
    attackerStrength * (attackerWins ? winnerLossPct : loserLossPct)
  );
  const defenderLosses = Math.floor(
    defenderStrength * (attackerWins ? loserLossPct : winnerLossPct)
  );

  return {
    id: generateId("battle"),
    turn: state.currentTurn,
    province,
    attacker: attackerNation,
    defender: defenderNation,
    attackerLosses,
    defenderLosses,
    winner: attackerWins ? attackerNation : defenderNation,
  };
}

function calculateStrength(army: Army): number {
  return (
    (army.units.infantry * 1 +
      army.units.cavalry * 2.5 +
      army.units.artillery * 4) *
    army.morale *
    army.supply
  );
}

function armyTroopCount(army: Army): number {
  return army.units.infantry + army.units.cavalry + army.units.artillery;
}

/**
 * Siege & occupation system.
 * When an army is in an enemy province during war, it begins/advances a siege.
 * Once siege progress reaches 100, the province becomes occupied (controller changes).
 */
function resolveSieges(
  state: GameState,
  nationUpdates: Record<string, Partial<Nation>>,
  provinceChanges: Record<string, Partial<Province>>,
  events: GameEvent[]
): void {
  // Build current army positions (including this turn's updates)
  const armiesByProvince = new Map<string, { nationId: string; army: Army }[]>();

  for (const [nationId, nation] of Object.entries(state.nations)) {
    const currentArmies =
      (nationUpdates[nationId] as Partial<Nation>)?.military?.armies ??
      nation.military.armies;

    for (const army of currentArmies) {
      const list = armiesByProvince.get(army.location) ?? [];
      list.push({ nationId, army });
      armiesByProvince.set(army.location, list);
    }
  }

  for (const [provinceId, armiesInProvince] of armiesByProvince) {
    const province = state.provinces[provinceId];
    if (!province) continue;

    // Find enemy armies in this province (armies whose owner ≠ province owner)
    for (const { nationId, army } of armiesInProvince) {
      if (nationId === province.owner) continue;
      if (province.controller === nationId) continue; // already occupied by us

      // Must be at war with province owner
      const atWar = state.activeWars.some(
        (w) =>
          (w.attackers.includes(nationId) && w.defenders.includes(province.owner)) ||
          (w.defenders.includes(nationId) && w.attackers.includes(province.owner))
      );
      if (!atWar) continue;

      // No enemy armies defending this province — siege can proceed
      const hasDefender = armiesInProvince.some(
        (a) => a.nationId === province.owner && armyTroopCount(a.army) > 0
      );
      if (hasDefender) continue; // battle should handle this, not siege

      // Get or create occupation state
      const currentOccupation = province.occupation;
      const armyStrength = armyTroopCount(army);
      const fortResistance = province.fortLevel * 1000 + 500;
      const progressPerTurn = Math.min(50, (armyStrength / fortResistance) * 100);

      if (!currentOccupation || currentOccupation.occupier !== nationId) {
        // Start new siege
        const newProgress = Math.min(100, progressPerTurn);
        provinceChanges[provinceId] = {
          ...provinceChanges[provinceId],
          occupation: {
            occupier: nationId,
            progress: newProgress,
            startTurn: state.currentTurn,
          },
        };

        if (newProgress >= 100) {
          // Instant occupation (weak province, strong army)
          provinceChanges[provinceId].controller = nationId;
          events.push({
            id: generateId("evt"),
            type: "province_conquered",
            turn: state.currentTurn,
            date: state.currentDate,
            source: "engine",
            data: { province: provinceId, occupier: nationId, previousOwner: province.owner },
            description: `${state.nations[nationId]?.name ?? nationId} has occupied ${province.displayName ?? province.name}!`,
            descriptionKey: "events.province_occupied",
            descriptionParams: { nation: state.nations[nationId]?.name ?? nationId, province: province.displayName ?? province.name },
            affectedNations: [nationId, province.owner],
          });
        }
      } else {
        // Advance existing siege
        const newProgress = Math.min(100, currentOccupation.progress + progressPerTurn);
        provinceChanges[provinceId] = {
          ...provinceChanges[provinceId],
          occupation: {
            ...currentOccupation,
            progress: newProgress,
          },
        };

        if (currentOccupation.progress < 100 && newProgress >= 100) {
          // Siege complete — province occupied
          provinceChanges[provinceId].controller = nationId;
          events.push({
            id: generateId("evt"),
            type: "province_conquered",
            turn: state.currentTurn,
            date: state.currentDate,
            source: "engine",
            data: { province: provinceId, occupier: nationId, previousOwner: province.owner },
            description: `${state.nations[nationId]?.name ?? nationId} has occupied ${province.displayName ?? province.name} after a siege!`,
            descriptionKey: "events.province_occupied",
            descriptionParams: { nation: state.nations[nationId]?.name ?? nationId, province: province.displayName ?? province.name },
            affectedNations: [nationId, province.owner],
          });
        }
      }

      // Update war score for occupation
      if (provinceChanges[provinceId]?.controller === nationId) {
        for (const war of state.activeWars) {
          const isAttacker = war.attackers.includes(nationId) && war.defenders.includes(province.owner);
          const isDefender = war.defenders.includes(nationId) && war.attackers.includes(province.owner);
          if (isAttacker) war.warScore += 5;
          else if (isDefender) war.warScore -= 5;
        }
      }

      break; // Only one army can siege a province per turn
    }
  }
}
