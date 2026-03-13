import type {
  CommandInterpreterResult,
  GameState,
  GameEvent,
  StateDelta,
  NarrativeStyle,
  ParsedAction,
} from "@historia/shared";
import type { MechanicalFact, SuggestedEffect } from "../pipeline/event-generator.js";

export interface GameContext {
  nationId: string;
  state: GameState;
  recentEvents: GameEvent[];
  turnHistory: string[];
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Abstract LLM provider interface.
 * Supported providers: OpenRouter (cloud) and Ollama (local).
 */
export interface LLMProvider {
  id: string;
  name: string;

  /**
   * Parse a natural language command into structured game actions.
   * Uses structured output / tool_use for reliable parsing.
   */
  parseAction(
    command: string,
    context: GameContext,
    actionSchemas: ActionSchema[]
  ): Promise<CommandInterpreterResult>;

  /**
   * Generate narrative text from state changes and events.
   */
  generateNarrative(
    delta: StateDelta,
    events: GameEvent[],
    perspective: string,
    style: NarrativeStyle
  ): Promise<string>;

  /**
   * Generate narrative events from mechanical facts.
   * The LLM creates historically-grounded or creative events based on:
   * - The mechanical state delta from the engine
   * - The determinism config (historical vs sandbox vs fantasy)
   * - The current era and geopolitical context
   *
   * Returns both rich narrative events and a turn summary.
   */
  generateEvents(
    state: GameState,
    delta: StateDelta,
    mechanicalFacts: MechanicalFact[],
    perspective: string,
    style: NarrativeStyle
  ): Promise<{
    events: GameEvent[];
    turnNarrative: string;
    suggestedEffects: SuggestedEffect[];
  }>;

  /**
   * Conversational advisor - answer strategy questions.
   */
  chat(messages: Message[], context: GameContext): Promise<string>;

  /**
   * Streaming variant for long responses.
   */
  streamChat(
    messages: Message[],
    context: GameContext
  ): AsyncIterable<string>;
}

export interface ActionSchema {
  type: string;
  subtype: string;
  description: string;
  parameters: Record<string, ActionParameter>;
}

export interface ActionParameter {
  type: "string" | "number" | "boolean" | "array";
  description: string;
  required: boolean;
  enum?: string[];
}

/**
 * Configuration for an LLM provider.
 */
export interface LLMProviderConfig {
  provider: "openrouter" | "ollama";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}
