import { resolveTurn, evaluateAction, type TurnActions } from "@historia/engine";
import type {
  GameState,
  ParsedAction,
  DeterminismConfig,
} from "@historia/shared";
import type { LLMProvider, GameContext } from "@historia/llm";
import { getDefaultActionSchemas, summarizeState } from "@historia/llm";

/**
 * Game service orchestrates the engine and LLM for a game session.
 */
export class GameService {
  constructor(private llmProvider?: LLMProvider) {}

  /**
   * Process a natural language command from a player.
   */
  async processCommand(
    state: GameState,
    nationId: string,
    command: string
  ): Promise<{
    actions: ParsedAction[];
    narrative: string;
    warnings: string[];
  }> {
    if (!this.llmProvider) {
      return {
        actions: [],
        narrative: "LLM provider not configured.",
        warnings: ["No LLM provider available"],
      };
    }

    const context: GameContext = {
      nationId,
      state,
      recentEvents: [],
      turnHistory: [],
    };

    // 1. Parse command via LLM
    const parseResult = await this.llmProvider.parseAction(
      command,
      context,
      getDefaultActionSchemas()
    );

    if (parseResult.confidence < 0.5 && parseResult.clarification) {
      return {
        actions: [],
        narrative: parseResult.clarification,
        warnings: parseResult.warnings ?? [],
      };
    }

    // 2. Run each action through determinism gate
    const validActions: ParsedAction[] = [];
    const warnings: string[] = [...(parseResult.warnings ?? [])];

    for (const action of parseResult.actions) {
      const decision = evaluateAction(
        action,
        state,
        state.determinism
      );

      switch (decision.verdict) {
        case "allow":
          validActions.push(decision.action ?? action);
          break;
        case "modify":
          validActions.push(decision.action ?? action);
          warnings.push(decision.reason ?? "Action was modified.");
          break;
        case "reject":
          warnings.push(
            decision.reason ?? "Action rejected by game rules."
          );
          break;
        case "defer_to_llm":
          validActions.push(action);
          break;
      }
    }

    return {
      actions: validActions,
      narrative: `Command understood. ${validActions.length} action(s) queued.`,
      warnings,
    };
  }

  /**
   * Resolve a full turn with actions from all nations.
   */
  resolveTurn(
    state: GameState,
    allActions: TurnActions[],
    seed: number
  ) {
    return resolveTurn(state, allActions, seed);
  }
}
