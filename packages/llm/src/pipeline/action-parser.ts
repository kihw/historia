import type { GameContext, ActionSchema } from "../providers/base.js";

/**
 * Build the system prompt for the action parser.
 * This prompt instructs the LLM to parse natural language commands
 * into structured game actions.
 */
export function buildActionParserPrompt(
  context: GameContext,
  actionSchemas: ActionSchema[]
): string {
  const nation = context.state.nations[context.nationId];
  const nationName = nation?.name ?? context.nationId;

  const schemasText = actionSchemas
    .map(
      (s) =>
        `- ${s.type}/${s.subtype}: ${s.description}\n  Parameters: ${JSON.stringify(s.parameters)}`
    )
    .join("\n");

  return `You are an action parser for a geopolitical simulation game called Historia.
The player controls ${nationName}.

Your job is to parse the player's natural language command into structured game actions.

Available action types:
${schemasText}

Known nations: ${Object.keys(context.state.nations).join(", ")}
Known provinces: ${Object.keys(context.state.provinces).join(", ")}

You MUST respond with valid JSON in this exact format:
{
  "actions": [
    {
      "type": "diplomacy|military|economy|internal",
      "subtype": "...",
      ...action-specific fields
    }
  ],
  "confidence": 0.0-1.0,
  "clarification": "optional - only if confidence < 0.5",
  "warnings": ["optional warnings about consequences"]
}

Rules:
- Parse the player's intent as accurately as possible
- If the command is ambiguous, set confidence low and provide a clarification question
- If the command implies multiple actions, return all of them
- Validate nation/province names against the known lists (use fuzzy matching)
- Warn about obvious consequences (declaring war on an ally, spending more than treasury, etc.)
- Only return valid action types from the schemas above`;
}

/**
 * Default action schemas for the game.
 */
export function getDefaultActionSchemas(): ActionSchema[] {
  return [
    {
      type: "diplomacy",
      subtype: "declare_war",
      description: "Declare war on another nation",
      parameters: {
        target: {
          type: "string",
          description: "Nation ID to declare war on",
          required: true,
        },
      },
    },
    {
      type: "diplomacy",
      subtype: "propose_alliance",
      description: "Propose an alliance with another nation",
      parameters: {
        target: {
          type: "string",
          description: "Nation ID to propose alliance to",
          required: true,
        },
      },
    },
    {
      type: "diplomacy",
      subtype: "propose_peace",
      description: "Propose peace to end an ongoing war",
      parameters: {
        target: {
          type: "string",
          description: "Nation ID to propose peace to",
          required: true,
        },
      },
    },
    {
      type: "diplomacy",
      subtype: "improve_relations",
      description: "Send a diplomat to improve relations",
      parameters: {
        target: {
          type: "string",
          description: "Nation ID to improve relations with",
          required: true,
        },
      },
    },
    {
      type: "military",
      subtype: "move_army",
      description: "Move an army to an adjacent province",
      parameters: {
        armyId: {
          type: "string",
          description: "ID of the army to move",
          required: true,
        },
        target: {
          type: "string",
          description: "Province ID to move to",
          required: true,
        },
      },
    },
    {
      type: "military",
      subtype: "recruit",
      description: "Recruit new troops",
      parameters: {
        units: {
          type: "object" as "string",
          description:
            "Object with infantry, cavalry, artillery counts",
          required: true,
        },
      },
    },
    {
      type: "economy",
      subtype: "set_tax",
      description: "Change the tax rate",
      parameters: {
        value: {
          type: "number",
          description: "New tax rate (0.0 to 0.5)",
          required: true,
        },
      },
    },
    {
      type: "economy",
      subtype: "build",
      description: "Build a structure in a province",
      parameters: {
        province: {
          type: "string",
          description: "Province ID to build in",
          required: true,
        },
        building: {
          type: "string",
          description: "Building type to construct",
          required: true,
        },
      },
    },
    {
      type: "internal",
      subtype: "enact_policy",
      description: "Enact a new domestic policy",
      parameters: {
        value: {
          type: "string",
          description: "Policy description",
          required: true,
        },
      },
    },
    {
      type: "internal",
      subtype: "research",
      description: "Research a technology",
      parameters: {
        value: {
          type: "string",
          description: "Technology ID to research",
          required: true,
        },
      },
    },
    {
      type: "espionage",
      subtype: "spy_on",
      description: "Send spies to gather intelligence on a nation",
      parameters: {
        target: {
          type: "string",
          description: "Nation ID to spy on",
          required: true,
        },
      },
    },
    {
      type: "espionage",
      subtype: "sabotage",
      description: "Sabotage a nation's economy or infrastructure",
      parameters: {
        target: {
          type: "string",
          description: "Nation ID to sabotage",
          required: true,
        },
      },
    },
    {
      type: "espionage",
      subtype: "sow_discord",
      description: "Sow unrest and discord in a nation to reduce stability",
      parameters: {
        target: {
          type: "string",
          description: "Nation ID to destabilize",
          required: true,
        },
      },
    },
    {
      type: "espionage",
      subtype: "steal_tech",
      description: "Attempt to steal technological secrets from a nation",
      parameters: {
        target: {
          type: "string",
          description: "Nation ID to steal tech from",
          required: true,
        },
      },
    },
    {
      type: "espionage",
      subtype: "counter_intel",
      description: "Strengthen counter-intelligence to resist enemy espionage",
      parameters: {
        target: {
          type: "string",
          description: "Own nation ID (defensive action)",
          required: true,
        },
      },
    },
  ];
}
