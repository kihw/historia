import type {
  StateDelta,
  GameEvent,
  GameState,
  DeterminismConfig,
  NarrativeStyle,
  GameDate,
  EventEffect,
} from "@historia/shared";

/**
 * Mechanical facts produced by the engine — no narrative, just data.
 * The LLM transforms these into rich, historically-grounded GameEvents.
 */
export interface MechanicalFact {
  type: string;
  data: Record<string, unknown>;
  affectedNations: string[];
}

/**
 * LLM-suggested territorial effect for post-validation.
 * The game loop validates these before applying.
 */
export interface SuggestedEffect {
  type: "annex_province" | "annex_nation";
  from: string;
  to: string;
  provinces?: string[];
  reason: string;
}

/**
 * Build the prompt that asks the LLM to generate narrative events
 * based on the mechanical state delta produced by the engine.
 *
 * The LLM uses the determinism config to decide:
 * - historicalConstraint high → events based on real historical facts for the era/date
 * - historicalConstraint low → events can be invented / uchronic
 * - fantasyFreedom high → anything is possible (supernatural, anachronistic)
 * - fantasyFreedom low → strict realism
 */
export function buildEventGeneratorPrompt(
  state: GameState,
  delta: StateDelta,
  mechanicalFacts: MechanicalFact[],
  perspective: string,
  style: NarrativeStyle
): string {
  const det = state.determinism;
  const era = describeEra(state.currentDate);
  const styleGuide = getStyleGuide(style);
  const constraintGuide = getConstraintGuide(det);

  // Summarize what mechanically happened
  const factsText = mechanicalFacts.length > 0
    ? mechanicalFacts.map((f, i) => `  ${i + 1}. [${f.type}] ${JSON.stringify(f.data)} — nations: ${f.affectedNations.join(", ")}`).join("\n")
    : "  No major mechanical events.";

  // Summarize nation state changes
  const changesText = Object.entries(delta.nationChanges)
    .map(([nId, changes]) => {
      const nation = state.nations[nId];
      const name = nation?.name ?? nId;
      const parts: string[] = [];
      const c = changes as Record<string, unknown>;
      if (c.economy) parts.push(`economy changed`);
      if (c.military) parts.push(`military changed`);
      if (c.population) parts.push(`population/stability changed`);
      if (c.diplomacy) parts.push(`diplomatic relations changed`);
      if (c.technology) parts.push(`technology advanced`);
      if (c.ruler) parts.push(`ruler affected`);
      return `  - ${name}: ${parts.join(", ") || "minor changes"}`;
    })
    .join("\n");

  // Wars context
  const warsText = [
    delta.newWars.length > 0
      ? `New wars: ${delta.newWars.map(w => `${w.name} (${w.attackers.join("+")} vs ${w.defenders.join("+")})`).join("; ")}`
      : null,
    delta.endedWars.length > 0
      ? `Wars ended: ${delta.endedWars.join(", ")}`
      : null,
    delta.newTreaties.length > 0
      ? `New treaties: ${delta.newTreaties.map(t => `${t.type} between ${t.parties.join(" & ")}`).join("; ")}`
      : null,
  ].filter(Boolean).join("\n") || "No war/treaty changes.";

  // Nation list for context
  const nationList = Object.values(state.nations)
    .map(n => `${n.name} (${n.tag}) — ${n.government}, ruler: ${n.ruler.name}, provinces: ${n.provinces.length}`)
    .join("\n  ");

  // Territory suggestion section (only when simulation intensity allows)
  const territorySuggestionGuide = getTerritorySuggestionGuide(det, state);

  return `You are the event and narrative generator for Historia, a geopolitical simulation game.

${styleGuide}

${constraintGuide}

CURRENT CONTEXT:
- Date: ${state.currentDate.year}-${String(state.currentDate.month).padStart(2, "0")}
- Era context: ${era}
- Turn: ${state.currentTurn}
- Perspective nation: ${perspective}
- Nations in play:
  ${nationList}

MECHANICAL FACTS (what the game engine computed this turn):
${factsText}

STATE CHANGES:
${changesText || "  No significant changes."}

WARS & TREATIES:
${warsText}
${territorySuggestionGuide}
YOUR TASK:
Based on the mechanical facts above, generate a JSON array of narrative events. Each event should:
1. Transform the dry mechanical fact into a historically plausible (or creative, based on settings) narrative event
2. Add context, causes, consequences that make sense for the era and political situation
3. Optionally generate ADDITIONAL events that aren't direct mechanical facts but make sense given the situation (rumors, cultural shifts, religious developments, natural events, etc.)

The number of additional events should depend on how eventful the turn was:
- Quiet turn: 0-1 extra events
- Active turn: 1-3 extra events
- Major turn (wars, crises): 2-4 extra events

Respond with ONLY valid JSON in this exact format:
{
  "events": [
    {
      "type": "war_declared|peace_signed|treaty_signed|alliance_formed|battle_fought|province_conquered|revolt|revolution|economy_crisis|natural_disaster|technology_discovered|espionage|historical_event|custom",
      "description": "Rich narrative description of the event (2-4 sentences)",
      "affectedNations": ["nation_id_1", "nation_id_2"],
      "significance": "minor|moderate|major|critical"
    }
  ],${det.simulationIntensity < 0.7 ? `
  "suggestedEffects": [
    {
      "type": "annex_province|annex_nation",
      "from": "nation_id_losing_territory",
      "to": "nation_id_gaining_territory",
      "provinces": ["province_id"],
      "reason": "Why this territorial change makes sense"
    }
  ],` : ""}
  "turnNarrative": "1-3 paragraphs summarizing the turn from the perspective nation's point of view"
}`;
}

function describeEra(date: GameDate): string {
  const y = date.year;
  if (y < 500) return "Classical Antiquity — Roman Empire, barbarian migrations";
  if (y < 1000) return "Early Middle Ages — feudalism, Viking raids, Byzantine Empire";
  if (y < 1300) return "High Middle Ages — Crusades, Mongol Empire, cathedral building";
  if (y < 1500) return "Late Middle Ages / Early Renaissance — Hundred Years War, printing press, Age of Exploration begins";
  if (y < 1650) return "Early Modern — Reformation, colonization, gunpowder empires, religious wars";
  if (y < 1800) return "Age of Enlightenment — absolutism, revolutions, global trade, Seven Years War";
  if (y < 1900) return "Industrial Age — nationalism, imperialism, industrial revolution, Scramble for Africa";
  if (y < 1945) return "World Wars era — total war, fascism, communism, nuclear weapons";
  if (y < 1991) return "Cold War — superpower rivalry, decolonization, space race, proxy wars";
  return "Contemporary — globalization, information age, regional conflicts";
}

function getStyleGuide(style: NarrativeStyle): string {
  switch (style) {
    case "historical_chronicle":
      return "STYLE: Write as a medieval chronicler. Formal, archaic language. Reference dates and places.";
    case "news_broadcast":
      return "STYLE: Write as a modern news broadcast. Factual, concise, journalistic.";
    case "royal_court":
      return "STYLE: Write as if reporting to a royal court. Courtly, diplomatic, measured.";
    case "war_report":
      return "STYLE: Write as a military field report. Tactical, precise, strategic.";
    case "diplomatic_cable":
      return "STYLE: Write as a diplomatic cable. Formal, coded, politically aware.";
    default:
      return "STYLE: Clear, engaging historical narrative.";
  }
}

function getConstraintGuide(det: DeterminismConfig): string {
  const parts: string[] = [];

  // Historical constraint
  if (det.historicalConstraint > 0.7) {
    parts.push(
      "HISTORICAL MODE: You MUST base events on real historical facts for this era and date. " +
      "Reference actual historical events, treaties, battles, and figures that occurred around this time. " +
      "If the player's actions diverge from history, narrate the consequences realistically."
    );
  } else if (det.historicalConstraint > 0.3) {
    parts.push(
      "HYBRID MODE: Use real history as inspiration but allow divergence. " +
      "Historical events can be delayed, altered, or prevented by player actions. " +
      "Invent plausible alternative events when the timeline diverges from reality."
    );
  } else {
    parts.push(
      "SANDBOX MODE: You are free to invent events entirely. " +
      "There is no obligation to follow real history. " +
      "Create interesting, plausible events that fit the political situation."
    );
  }

  // Fantasy freedom
  if (det.fantasyFreedom > 0.5) {
    parts.push(
      "FANTASY ALLOWED: Supernatural, mythical, or anachronistic events are permitted. " +
      "Dragons, magic, divine intervention, time anomalies — if it makes for a good story."
    );
  } else if (det.fantasyFreedom > 0.1) {
    parts.push(
      "LOW FANTASY: Occasional unexplained phenomena are acceptable (omens, plagues, unusual weather) " +
      "but nothing overtly supernatural."
    );
  } else {
    parts.push(
      "STRICT REALISM: Only historically and scientifically plausible events. No supernatural elements."
    );
  }

  // Simulation intensity affects how much the LLM can override engine results
  if (det.simulationIntensity > 0.7) {
    parts.push(
      "ENGINE-DOMINANT: The mechanical facts are authoritative. Your narrative must explain and enrich them, " +
      "not contradict them. Additional events should be minor context, not game-changing."
    );
  } else if (det.simulationIntensity > 0.3) {
    parts.push(
      "BALANCED: The mechanical facts set the framework. You can add significant contextual events " +
      "that create interesting situations for the player."
    );
  } else {
    parts.push(
      "NARRATIVE-DOMINANT: You have wide latitude to generate impactful events. " +
      "The mechanical facts are suggestions — you can amplify, diminish, or add major events."
    );
  }

  return parts.join("\n\n");
}

function getTerritorySuggestionGuide(det: DeterminismConfig, state: GameState): string {
  if (det.simulationIntensity > 0.7) {
    return ""; // Engine-dominant: LLM cannot suggest territorial changes
  }

  // Build active wars context
  const warsContext = state.activeWars.length > 0
    ? `Active wars: ${state.activeWars.map(w => `${w.name} (score: ${w.warScore})`).join(", ")}`
    : "No active wars.";

  // Build province ownership summary
  const provinceOwners = new Map<string, string[]>();
  for (const [provId, prov] of Object.entries(state.provinces)) {
    const list = provinceOwners.get(prov.owner) ?? [];
    list.push(provId);
    provinceOwners.set(prov.owner, list);
  }

  if (det.simulationIntensity <= 0.3) {
    return `
TERRITORIAL SUGGESTIONS:
You may suggest territorial changes (province transfers, nation annexations) that make historical/narrative sense.
${warsContext}
Rules:
- Only suggest changes involving existing nations and provinces
- Provide a clear reason for each change
- Keep suggestions rare (0-1 per turn) and impactful
- Include "suggestedEffects" array in your response
`;
  }

  // 0.3 < intensity <= 0.7: Only during active wars
  if (state.activeWars.length === 0) {
    return ""; // No wars, no suggestions in balanced mode
  }

  return `
TERRITORIAL SUGGESTIONS (WAR ONLY):
Since there are active wars, you may suggest territorial changes for nations at war.
${warsContext}
Rules:
- ONLY suggest changes involving nations currently at war with each other
- Province transfers should reflect military occupation or decisive victories
- Provide a clear reason tied to the ongoing conflict
- Keep suggestions rare (0-1 per turn)
- Include "suggestedEffects" array in your response
`;
}

/**
 * Validate LLM-suggested territorial effects against the game state.
 * Returns only effects that pass all validation checks.
 */
export function validateSuggestedEffects(
  suggestions: SuggestedEffect[],
  state: GameState
): SuggestedEffect[] {
  return suggestions.filter((s) => {
    // Both nations must exist
    if (!state.nations[s.from] || !state.nations[s.to]) return false;

    if (s.type === "annex_province") {
      // All provinces must exist and belong to 'from'
      if (!s.provinces || s.provinces.length === 0) return false;
      for (const provId of s.provinces) {
        const prov = state.provinces[provId];
        if (!prov || prov.owner !== s.from) return false;
      }
    }

    // Must have justification: at war, occupied, or very hostile relations
    const fromNation = state.nations[s.from]!;
    const toNation = state.nations[s.to]!;

    const atWarWithEachOther = state.activeWars.some(
      (w) =>
        (w.attackers.includes(s.to) && w.defenders.includes(s.from)) ||
        (w.defenders.includes(s.to) && w.attackers.includes(s.from))
    );

    const relation = toNation.diplomacy.relations[s.from] ?? 0;
    const veryHostile = relation < -50;

    if (!atWarWithEachOther && !veryHostile) return false;

    return true;
  });
}

/**
 * Extract mechanical facts from engine events.
 * These are the raw data that the LLM will transform into narrative events.
 */
export function extractMechanicalFacts(events: GameEvent[]): MechanicalFact[] {
  return events.map((e) => ({
    type: e.type,
    data: e.data,
    affectedNations: e.affectedNations,
  }));
}
