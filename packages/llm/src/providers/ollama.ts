import type {
  CommandInterpreterResult,
  GameState,
  StateDelta,
  GameEvent,
  NarrativeStyle,
} from "@historia/shared";
import type {
  LLMProvider,
  GameContext,
  Message,
  ActionSchema,
  LLMProviderConfig,
} from "./base.js";
import type { MechanicalFact, SuggestedEffect } from "../pipeline/event-generator.js";
import { buildActionParserPrompt } from "../pipeline/action-parser.js";
import { buildNarrativePrompt } from "../pipeline/narrative-engine.js";
import { buildEventGeneratorPrompt, validateSuggestedEffects } from "../pipeline/event-generator.js";
import { summarizeState } from "../context/state-summarizer.js";

/** Error thrown when the Ollama server is unreachable. */
class OllamaConnectionError extends Error {
  constructor(baseUrl: string, cause?: unknown) {
    super(
      `Could not connect to Ollama at ${baseUrl}. ` +
        `Make sure Ollama is running (try: ollama serve).`
    );
    this.name = "OllamaConnectionError";
    this.cause = cause;
  }
}

/** Shape of a non-streaming chat completion response from the OpenAI-compatible API. */
interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

export class OllamaProvider implements LLMProvider {
  id = "ollama";
  name = "Ollama (Local)";
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: LLMProviderConfig) {
    this.baseUrl = (config.baseUrl ?? "http://localhost:11434/v1").replace(
      /\/$/,
      ""
    );
    this.model = config.model ?? "llama3.1";
    this.maxTokens = config.maxTokens ?? 2048;
    this.temperature = config.temperature ?? 0.7;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Make a non-streaming chat completion request to the Ollama OpenAI-compatible API.
   */
  private async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    options?: { responseFormat?: { type: string } }
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: false,
    };

    if (options?.responseFormat) {
      body.response_format = options.responseFormat;
    }

    const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(
        `Ollama API error ${response.status}: ${errorText}`
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return data.choices[0]?.message?.content ?? "";
  }

  /**
   * Make a streaming chat completion request.
   * Yields content delta strings as they arrive via SSE.
   */
  private async *chatCompletionStream(
    messages: Array<{ role: string; content: string }>
  ): AsyncIterable<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: true,
    };

    const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(
        `Ollama API error ${response.status}: ${errorText}`
      );
    }

    // The response is an SSE stream of `data: {...}` lines.
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer.
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const payload = trimmed.slice("data:".length).trim();
          if (payload === "[DONE]") return;

          try {
            const chunk = JSON.parse(payload) as {
              choices: Array<{
                delta: { content?: string };
              }>;
            };
            const text = chunk.choices[0]?.delta?.content;
            if (text) yield text;
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Wrapper around global fetch that translates network errors into a
   * friendlier OllamaConnectionError.
   */
  private async fetch(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err: unknown) {
      throw new OllamaConnectionError(this.baseUrl, err);
    }
  }

  // ---------------------------------------------------------------------------
  // LLMProvider interface
  // ---------------------------------------------------------------------------

  async parseAction(
    command: string,
    context: GameContext,
    actionSchemas: ActionSchema[]
  ): Promise<CommandInterpreterResult> {
    const systemPrompt = buildActionParserPrompt(context, actionSchemas);
    const stateSummary = summarizeState(context.state, context.nationId);

    const text = await this.chatCompletion(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Current state summary:\n${stateSummary}\n\nPlayer command: "${command}"`,
        },
      ],
      { responseFormat: { type: "json_object" } }
    );

    try {
      return JSON.parse(text) as CommandInterpreterResult;
    } catch {
      return {
        actions: [],
        confidence: 0,
        clarification:
          "I could not understand that command. Please try rephrasing.",
      };
    }
  }

  async generateNarrative(
    delta: StateDelta,
    events: GameEvent[],
    perspective: string,
    style: NarrativeStyle
  ): Promise<string> {
    const prompt = buildNarrativePrompt(delta, events, perspective, style);

    return this.chatCompletion([{ role: "user", content: prompt }]);
  }

  async generateEvents(
    state: GameState,
    delta: StateDelta,
    mechanicalFacts: MechanicalFact[],
    perspective: string,
    style: NarrativeStyle
  ): Promise<{ events: GameEvent[]; turnNarrative: string; suggestedEffects: SuggestedEffect[] }> {
    const prompt = buildEventGeneratorPrompt(state, delta, mechanicalFacts, perspective, style);

    const text = await this.chatCompletion(
      [{ role: "user", content: prompt }],
      { responseFormat: { type: "json_object" } }
    );

    try {
      const parsed = JSON.parse(text) as {
        events: Array<{
          type: string;
          description: string;
          affectedNations: string[];
          significance?: string;
        }>;
        suggestedEffects?: SuggestedEffect[];
        turnNarrative: string;
      };

      const gameEvents: GameEvent[] = parsed.events.map((e, i) => ({
        id: `llm-evt-${state.currentTurn}-${i}`,
        type: (e.type as GameEvent["type"]) || "custom",
        turn: state.currentTurn,
        date: { ...state.currentDate },
        source: "llm" as const,
        data: { significance: e.significance ?? "moderate" },
        description: e.description,
        affectedNations: e.affectedNations ?? [],
      }));

      const validatedEffects = parsed.suggestedEffects
        ? validateSuggestedEffects(parsed.suggestedEffects, state)
        : [];

      return {
        events: gameEvents,
        turnNarrative: parsed.turnNarrative || "",
        suggestedEffects: validatedEffects,
      };
    } catch {
      return {
        events: [],
        turnNarrative: text || "Time passes quietly.",
        suggestedEffects: [],
      };
    }
  }

  async chat(messages: Message[], context: GameContext): Promise<string> {
    const stateSummary = summarizeState(context.state, context.nationId);

    return this.chatCompletion([
      {
        role: "system",
        content: `You are a strategic advisor in a geopolitical simulation game. The player controls ${context.state.nations[context.nationId]?.name ?? context.nationId}.\n\nCurrent state:\n${stateSummary}`,
      },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ]);
  }

  async *streamChat(
    messages: Message[],
    context: GameContext
  ): AsyncIterable<string> {
    const stateSummary = summarizeState(context.state, context.nationId);

    yield* this.chatCompletionStream([
      {
        role: "system",
        content: `You are a strategic advisor in a geopolitical simulation game. The player controls ${context.state.nations[context.nationId]?.name ?? context.nationId}.\n\nCurrent state:\n${stateSummary}`,
      },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ]);
  }
}
