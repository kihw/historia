import type {
  StateDelta,
  GameEvent,
  NarrativeStyle,
} from "@historia/shared";

/**
 * Build a prompt for the narrative generator.
 * Takes state changes and events, produces historical narrative text.
 */
export function buildNarrativePrompt(
  delta: StateDelta,
  events: GameEvent[],
  perspective: string,
  style: NarrativeStyle
): string {
  const styleGuide = getStyleGuide(style);
  const eventsText = events
    .map(
      (e) =>
        `- [${e.type}] ${e.description} (affecting: ${e.affectedNations.join(", ")})`
    )
    .join("\n");

  const changesText = Object.entries(delta.nationChanges)
    .map(([nationId, changes]) => `- ${nationId}: ${JSON.stringify(changes)}`)
    .join("\n");

  return `You are a narrative generator for a geopolitical simulation game called Historia.

${styleGuide}

Write a narrative summary of what happened this turn from the perspective of ${perspective}.

Events this turn:
${eventsText || "No major events."}

State changes:
${changesText || "Minor changes only."}

New wars: ${delta.newWars.map((w) => w.name).join(", ") || "None"}
Ended wars: ${delta.endedWars.length > 0 ? delta.endedWars.join(", ") : "None"}
New treaties: ${delta.newTreaties.map((t) => `${t.type} between ${t.parties.join(" & ")}`).join(", ") || "None"}

Write 1-3 paragraphs of engaging narrative. Be specific and reference actual nations and events.
Do NOT make up events that didn't happen. Only narrate what's in the data above.`;
}

function getStyleGuide(style: NarrativeStyle): string {
  switch (style) {
    case "historical_chronicle":
      return "Write in the style of a medieval chronicle. Use formal, archaic language. Reference dates and places precisely.";
    case "news_broadcast":
      return "Write in the style of a modern news broadcast. Be factual, concise, and use journalistic language.";
    case "royal_court":
      return "Write as if reporting to a royal court. Use courtly language, be diplomatic and measured.";
    case "war_report":
      return "Write as a military field report. Be tactical, precise, and focus on strategic implications.";
    case "diplomatic_cable":
      return "Write as a diplomatic cable between embassies. Be formal, coded, and politically aware.";
    default:
      return "Write in a clear, engaging historical narrative style.";
  }
}
