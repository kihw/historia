import type { FastifyInstance } from "fastify";
import { resolveTurn, type TurnActions } from "@historia/engine";
import type { GameState, ParsedAction, TurnHistoryEntry, DiplomaticMessage, TurnDuration } from "@historia/shared";
import { createLLMProvider, createLLMProviderFromEnv, extractMechanicalFacts, type LLMProvider, type LLMProviderConfig, type GameContext } from "@historia/llm";
import { getDefaultActionSchemas } from "@historia/llm";
import { listScenarios, loadScenario, loadScenarioRaw, saveScenario, deleteScenario } from "../services/scenario-loader.js";
import { getCountryIndex } from "../services/country-index.js";
import { GameService } from "../services/game-service.js";
import { saveGame, loadAllGames, deleteGameSave } from "../services/game-store.js";

// In-memory game store (populated from disk on startup)
let games = new Map<string, GameState>();

// Pending actions per game per nation (not persisted — reset on restart)
const pendingActions = new Map<string, Map<string, ParsedAction[]>>();

// Turn history per game
let turnHistory = new Map<string, TurnHistoryEntry[]>();

// Diplomatic chat history per game: gameId -> Map<conversationKey, DiplomaticMessage[]>
let diplomaticChats = new Map<string, Map<string, DiplomaticMessage[]>>();

function chatKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

// LLM provider - starts from env, can be reconfigured via API
let llmProvider: LLMProvider | null = createLLMProviderFromEnv();
let gameService = new GameService(llmProvider ?? undefined);

function requireLLM(reply: { status: (code: number) => { send: (body: unknown) => unknown } }): LLMProvider | null {
  if (!llmProvider) {
    reply.status(503).send({
      error: "NO_LLM_PROVIDER",
      message: "No LLM provider configured. Go to Settings to configure OpenRouter or Ollama.",
    });
    return null;
  }
  return llmProvider;
}

/** Persist a game after mutation (fire-and-forget). */
function persistGame(gameId: string): void {
  const state = games.get(gameId);
  if (!state) return;
  const history = turnHistory.get(gameId) ?? [];
  const chats = diplomaticChats.get(gameId) ?? new Map();
  saveGame(gameId, state, history, chats).catch(() => {});
}

/**
 * Apply fog of war: strip detailed information about nations the player shouldn't fully see.
 * Players can see:
 * - Full details of their own nation
 * - Province ownership and basic info for all provinces
 * - Other nations: basic info only (name, tag, color, government, ruler name, province count)
 * - Wars and treaties they're involved in
 */
function applyFogOfWar(state: GameState, playerNationId: string): GameState {
  const filtered = { ...state };
  const filteredNations: Record<string, import("@historia/shared").Nation> = {};

  for (const [nId, nation] of Object.entries(state.nations)) {
    if (nId === playerNationId) {
      filteredNations[nId] = nation;
      continue;
    }

    // For other nations: reveal basic info but hide detailed internals
    const playerRelation = nation.diplomacy.relations[playerNationId] ?? 0;
    const isNeighbor = nation.provinces.some((pId) => {
      const prov = state.provinces[pId];
      return prov?.neighbors?.some((nProv) => state.provinces[nProv]?.owner === playerNationId);
    });

    filteredNations[nId] = {
      ...nation,
      economy: {
        ...nation.economy,
        // Hide exact treasury and income from non-neighbors
        treasury: isNeighbor ? Math.round(nation.economy.treasury / 100) * 100 : 0,
        monthlyIncome: isNeighbor ? Math.round(nation.economy.monthlyIncome / 10) * 10 : 0,
        monthlyExpenses: 0,
      },
      military: {
        ...nation.military,
        // Show approximate manpower, hide exact army positions unless at war or neighbor
        manpower: Math.round(nation.military.manpower / 1000) * 1000,
        armies: isNeighbor
          ? nation.military.armies.map((a) => ({
              ...a,
              morale: 0,
              supply: 0,
            }))
          : nation.military.armies.map((a) => ({
              ...a,
              units: { infantry: 0, cavalry: 0, artillery: 0 },
              morale: 0,
              supply: 0,
            })),
      },
      diplomacy: {
        ...nation.diplomacy,
        // Only show the player's relation + public info (alliances, rivals)
        relations: { [playerNationId]: playerRelation },
      },
    };
  }

  filtered.nations = filteredNations;
  return filtered;
}

/**
 * Resolve a multiplayer turn externally (called by socket server when all players are ready).
 * Uses the same in-memory game state and engine as the HTTP /turn endpoint.
 */
export async function resolveMultiplayerTurnViaAPI(
  gameId: string,
  _readyNationIds: string[]
): Promise<{ turn: number; narrative: string } | null> {
  const game = games.get(gameId);
  if (!game) return null;

  const gamePending = pendingActions.get(gameId) ?? new Map();
  const allTurnActions: TurnActions[] = [];

  for (const [nId, nActions] of gamePending.entries()) {
    if (nActions.length > 0) {
      allTurnActions.push({ nationId: nId, actions: nActions });
    }
  }

  const seed = game.currentTurn * 1000 + Date.now();
  const turnResult = resolveTurn(game, allTurnActions, seed);

  // LLM generates narrative events from mechanical facts
  const mechanicalFacts = extractMechanicalFacts(turnResult.events);
  let narrative = "";
  let allEvents = turnResult.events;

  if (llmProvider) {
    try {
      const generated = await llmProvider.generateEvents(
        game,
        turnResult.delta,
        mechanicalFacts,
        _readyNationIds[0] ?? "",
        "historical_chronicle"
      );
      narrative = generated.turnNarrative;
      allEvents = [...turnResult.events, ...generated.events];
    } catch {
      narrative = turnResult.events.length > 0
        ? turnResult.events.map((e) => e.description).join("\n")
        : "Time passes quietly.";
    }
  } else {
    narrative = turnResult.events.length > 0
      ? turnResult.events.map((e) => e.description).join("\n")
      : "Time passes quietly.";
  }

  games.set(gameId, turnResult.newState);

  const historyEntry: TurnHistoryEntry = {
    turn: turnResult.newState.currentTurn,
    date: turnResult.newState.currentDate,
    delta: turnResult.delta,
    narrative,
    events: allEvents,
  };
  const gameHistory = turnHistory.get(gameId) ?? [];
  gameHistory.push(historyEntry);
  turnHistory.set(gameId, gameHistory);

  pendingActions.set(gameId, new Map());
  persistGame(gameId);

  return { turn: turnResult.newState.currentTurn, narrative };
}

export async function gameRoutes(app: FastifyInstance) {
  app.log.info(`LLM provider: ${llmProvider?.name ?? "NONE - awaiting configuration"}`);

  // Load persisted games from disk
  try {
    const loaded = await loadAllGames();
    games = loaded.games;
    turnHistory = loaded.turnHistory;
    diplomaticChats = loaded.diplomaticChats;
    app.log.info(`Loaded ${games.size} saved game(s) from disk`);
  } catch (err) {
    app.log.warn(`Failed to load saved games: ${err}`);
  }

  // ── LLM Configuration ──────────────────────────────────────────────

  // Get current LLM status
  app.get("/llm/status", async () => {
    return {
      configured: llmProvider !== null,
      provider: llmProvider?.id ?? null,
      name: llmProvider?.name ?? null,
    };
  });

  // Configure LLM provider dynamically (BYOK)
  app.post<{
    Body: { provider: string; apiKey?: string; model?: string; baseUrl?: string };
  }>("/llm/configure", async (request, reply) => {
    const { provider, apiKey, model, baseUrl } = request.body;

    if (provider !== "openrouter" && provider !== "ollama") {
      return reply.status(400).send({ error: "INVALID_PROVIDER", message: "Provider must be 'openrouter' or 'ollama'" });
    }

    const config: LLMProviderConfig = {
      provider,
      apiKey,
      model,
      baseUrl,
    };

    const newProvider = createLLMProvider(config);
    if (!newProvider) {
      return reply.status(400).send({
        error: "INVALID_PROVIDER",
        message: provider === "openrouter"
          ? "OpenRouter requires an API key"
          : "Failed to create Ollama provider",
      });
    }

    llmProvider = newProvider;
    gameService = new GameService(llmProvider);
    app.log.info(`LLM provider switched to: ${llmProvider.name}`);

    return {
      success: true,
      provider: llmProvider.id,
      name: llmProvider.name,
    };
  });

  // Test LLM connection
  app.post<{
    Body: { provider: string; apiKey?: string; model?: string; baseUrl?: string };
  }>("/llm/test", async (request, reply) => {
    const { provider, apiKey, model, baseUrl } = request.body;

    if (provider !== "openrouter" && provider !== "ollama") {
      return reply.status(400).send({ error: "INVALID_PROVIDER", message: "Provider must be 'openrouter' or 'ollama'" });
    }

    const config: LLMProviderConfig = {
      provider,
      apiKey,
      model,
      baseUrl,
    };

    const testProvider = createLLMProvider(config);
    if (!testProvider) {
      return reply.status(400).send({
        error: "INVALID_PROVIDER",
        message: provider === "openrouter"
          ? "OpenRouter requires an API key"
          : "Failed to create Ollama provider",
      });
    }

    // Try a simple chat to verify the connection works
    try {
      const response = await testProvider.chat(
        [{ role: "user", content: "Reply with exactly: OK" }],
        {
          nationId: "test",
          state: { nations: {}, provinces: {} } as GameState,
          recentEvents: [],
          turnHistory: [],
        }
      );

      return {
        success: true,
        provider: testProvider.id,
        name: testProvider.name,
        response: response.substring(0, 100),
      };
    } catch (err) {
      return reply.status(502).send({
        error: "CONNECTION_FAILED",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ── Scenarios ──────────────────────────────────────────────────────

  app.get("/scenarios", async () => {
    const scenarios = await listScenarios();
    return { scenarios };
  });

  app.get<{ Params: { id: string } }>("/scenarios/:id", async (request, reply) => {
    try {
      const scenario = await loadScenarioRaw(request.params.id);
      return { scenario };
    } catch {
      return reply.status(404).send({ error: "SCENARIO_NOT_FOUND", message: "Scenario not found" });
    }
  });

  app.post<{ Body: { scenarioId: string; data: unknown } }>(
    "/scenarios",
    async (request, reply) => {
      try {
        const { scenarioId, data } = request.body;
        await saveScenario(scenarioId, data as import("@historia/shared").ScenarioInput);
        return { success: true, scenarioId };
      } catch (err) {
        return reply.status(400).send({
          error: "SAVE_FAILED",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  );

  // Duplicate a scenario
  app.post<{ Params: { id: string }; Body: { newId?: string } }>(
    "/scenarios/:id/duplicate",
    async (request, reply) => {
      try {
        const original = await loadScenarioRaw(request.params.id);
        const newId = request.body.newId ?? `${request.params.id}-copy`;
        const dup = JSON.parse(JSON.stringify(original));
        dup.meta.id = newId;
        dup.meta.name = `${dup.meta.name} (Copy)`;
        await saveScenario(newId, dup);
        return { success: true, scenarioId: newId };
      } catch (err) {
        return reply.status(400).send({
          error: "SAVE_FAILED",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  );

  // Delete a scenario
  app.delete<{ Params: { id: string } }>(
    "/scenarios/:id",
    async (request, reply) => {
      try {
        await deleteScenario(request.params.id);
        return { success: true };
      } catch (err) {
        return reply.status(400).send({
          error: "DELETE_FAILED",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  );

  // ── Country Index ────────────────────────────────────────────────

  app.get("/countries", async () => {
    const countries = await getCountryIndex();
    return { countries };
  });

  // ── Games ──────────────────────────────────────────────────────────

  app.get("/games", async () => {
    const gameList = Array.from(games.entries()).map(([id, state]) => ({
      id,
      turn: state.currentTurn,
      date: state.currentDate,
      nations: Object.keys(state.nations),
      scenarioId: state.scenarioId,
    }));
    return { games: gameList };
  });

  app.get<{ Params: { id: string }; Querystring: { nationId?: string } }>(
    "/games/:id",
    async (request, reply) => {
      const game = games.get(request.params.id);
      if (!game) {
        return reply.status(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
      }
      // Apply fog of war if nationId is provided
      const nationId = request.query.nationId;
      if (nationId && game.nations[nationId]) {
        return { game: applyFogOfWar(game, nationId) };
      }
      return { game };
    }
  );

  app.post<{ Body: { scenarioId: string; nationId?: string } }>(
    "/games",
    async (request, reply) => {
      try {
        const initialState = await loadScenario(request.body.scenarioId);
        const gameId = crypto.randomUUID();
        const state: GameState = { ...initialState, gameId };
        games.set(gameId, state);
        pendingActions.set(gameId, new Map());
        turnHistory.set(gameId, []);
        diplomaticChats.set(gameId, new Map());

        // Persist to disk
        persistGame(gameId);

        // If nationId provided, return fog-of-war filtered state
        const nationId = request.body.nationId;
        if (nationId && state.nations[nationId]) {
          return { gameId, game: applyFogOfWar(state, nationId), nationId };
        }
        return { gameId, game: state };
      } catch (err) {
        return reply.status(400).send({
          error: "LOAD_FAILED",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  );

  // Update game settings (turn speed)
  app.patch<{ Params: { id: string }; Body: { turnDuration?: TurnDuration } }>(
    "/games/:id/settings",
    async (request, reply) => {
      const game = games.get(request.params.id);
      if (!game) {
        return reply.status(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
      }

      const validDurations: TurnDuration[] = ["1_week", "1_month", "3_months", "6_months", "1_year"];
      if (request.body.turnDuration && validDurations.includes(request.body.turnDuration)) {
        game.turnDuration = request.body.turnDuration;
        persistGame(request.params.id);
      }

      return { success: true, turnDuration: game.turnDuration };
    }
  );

  // Delete a game
  app.delete<{ Params: { id: string } }>("/games/:id", async (request, reply) => {
    const gameId = request.params.id;
    if (!games.has(gameId)) {
      return reply.status(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
    }

    games.delete(gameId);
    pendingActions.delete(gameId);
    turnHistory.delete(gameId);
    diplomaticChats.delete(gameId);
    await deleteGameSave(gameId);

    return { success: true };
  });

  // ── Commands & Turns ───────────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: { nationId: string; command: string };
  }>("/games/:id/command", async (request, reply) => {
    const provider = requireLLM(reply);
    if (!provider) return;

    const game = games.get(request.params.id);
    if (!game) {
      return reply.status(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
    }

    const { nationId, command } = request.body;

    if (!game.nations[nationId]) {
      return reply.status(400).send({ error: "NATION_NOT_FOUND", message: `Nation '${nationId}' not found` });
    }

    const result = await gameService.processCommand(game, nationId, command);

    if (result.actions.length > 0) {
      const gamePending = pendingActions.get(request.params.id) ?? new Map();
      const nationPending = gamePending.get(nationId) ?? [];
      nationPending.push(...result.actions);
      gamePending.set(nationId, nationPending);
      pendingActions.set(request.params.id, gamePending);
    }

    return {
      message: result.narrative,
      actions: result.actions,
      warnings: result.warnings,
      pendingCount: pendingActions.get(request.params.id)?.get(nationId)?.length ?? 0,
    };
  });

  app.post<{
    Params: { id: string };
    Body: { nationId: string; actions?: ParsedAction[] };
  }>("/games/:id/turn", async (request, reply) => {
    const game = games.get(request.params.id);
    if (!game) {
      return reply.status(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
    }

    const { nationId, actions: extraActions } = request.body;

    const gamePending = pendingActions.get(request.params.id) ?? new Map();
    const allTurnActions: TurnActions[] = [];

    for (const [nId, nActions] of gamePending.entries()) {
      if (nActions.length > 0) {
        allTurnActions.push({ nationId: nId, actions: nActions });
      }
    }

    if (extraActions && extraActions.length > 0) {
      const existing = allTurnActions.find((a) => a.nationId === nationId);
      if (existing) {
        existing.actions.push(...extraActions);
      } else {
        allTurnActions.push({ nationId, actions: extraActions });
      }
    }

    const seed = game.currentTurn * 1000 + Date.now();
    const turnResult = resolveTurn(game, allTurnActions, seed);

    // The engine produces mechanical facts (state changes + raw events).
    // The LLM transforms these into rich, historically-grounded narrative events.
    const mechanicalFacts = extractMechanicalFacts(turnResult.events);
    const scenarioStyle = game.scenarioId ? "historical_chronicle" as const : "historical_chronicle" as const;

    let narrative = "";
    let llmEvents = turnResult.events; // fallback: use engine events as-is
    if (llmProvider) {
      try {
        const generated = await llmProvider.generateEvents(
          game,
          turnResult.delta,
          mechanicalFacts,
          nationId,
          scenarioStyle
        );
        narrative = generated.turnNarrative;
        // Merge: keep engine events for data, add LLM events for narrative richness
        llmEvents = [...turnResult.events, ...generated.events];
      } catch {
        // Graceful fallback: use engine event descriptions
        narrative = turnResult.events.length > 0
          ? turnResult.events.map((e) => e.description).join("\n")
          : "Time passes quietly.";
      }
    } else {
      narrative = turnResult.events.length > 0
        ? turnResult.events.map((e) => e.description).join("\n")
        : "Time passes quietly. (Configure an LLM provider for richer narratives)";
    }

    games.set(request.params.id, turnResult.newState);

    const historyEntry: TurnHistoryEntry = {
      turn: turnResult.newState.currentTurn,
      date: turnResult.newState.currentDate,
      delta: turnResult.delta,
      narrative,
      events: llmEvents,
    };
    const gameHistory = turnHistory.get(request.params.id) ?? [];
    gameHistory.push(historyEntry);
    turnHistory.set(request.params.id, gameHistory);

    pendingActions.set(request.params.id, new Map());

    // Persist to disk after turn resolution
    persistGame(request.params.id);

    // Return fog-of-war filtered state to the requesting nation
    const filteredState = nationId && turnResult.newState.nations[nationId]
      ? applyFogOfWar(turnResult.newState, nationId)
      : turnResult.newState;

    return {
      turn: turnResult.newState.currentTurn,
      date: turnResult.newState.currentDate,
      events: llmEvents,
      narrative,
      delta: turnResult.delta,
      game: filteredState,
      history: turnHistory.get(request.params.id) ?? [],
    };
  });

  // ── History ────────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>("/games/:id/history", async (request, reply) => {
    const game = games.get(request.params.id);
    if (!game) return reply.status(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
    return { history: turnHistory.get(request.params.id) ?? [] };
  });

  // ── Advice ─────────────────────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: { nationId: string; question: string };
  }>("/games/:id/advice", async (request, reply) => {
    const provider = requireLLM(reply);
    if (!provider) return;

    const game = games.get(request.params.id);
    if (!game) {
      return reply.status(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });
    }

    const { nationId, question } = request.body;
    const context: GameContext = {
      nationId,
      state: game,
      recentEvents: [],
      turnHistory: [],
    };

    const advice = await provider.chat(
      [{ role: "user", content: question }],
      context
    );

    return { advice };
  });

  // ── Diplomatic Chat ─────────────────────────────────────────────

  // Get conversation history
  app.get<{ Params: { id: string }; Querystring: { nationA: string; nationB: string } }>(
    "/games/:id/diplomacy/chat",
    async (request, reply) => {
      const game = games.get(request.params.id);
      if (!game) return reply.status(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });

      const { nationA, nationB } = request.query;
      const key = chatKey(nationA, nationB);
      const gameChats = diplomaticChats.get(request.params.id);
      const messages = gameChats?.get(key) ?? [];
      return { messages };
    }
  );

  // Send message to AI-controlled nation leader
  app.post<{
    Params: { id: string };
    Body: { playerNationId: string; targetNationId: string; message: string };
  }>("/games/:id/diplomacy/chat", async (request, reply) => {
    const provider = requireLLM(reply);
    if (!provider) return;

    const game = games.get(request.params.id);
    if (!game) return reply.status(404).send({ error: "GAME_NOT_FOUND", message: "Game not found" });

    const { playerNationId, targetNationId, message } = request.body;

    const playerNation = game.nations[playerNationId];
    const targetNation = game.nations[targetNationId];
    if (!playerNation) return reply.status(400).send({ error: "NATION_NOT_FOUND", message: `Nation '${playerNationId}' not found` });
    if (!targetNation) return reply.status(400).send({ error: "NATION_NOT_FOUND", message: `Nation '${targetNationId}' not found` });

    // Get or create conversation
    const gameChats = diplomaticChats.get(request.params.id) ?? new Map();
    const key = chatKey(playerNationId, targetNationId);
    const history = gameChats.get(key) ?? [];

    // Store player message
    const playerMsg: DiplomaticMessage = {
      id: `dm-${Date.now()}-p`,
      turn: game.currentTurn,
      from: playerNationId,
      to: targetNationId,
      content: message,
      timestamp: Date.now(),
    };
    history.push(playerMsg);

    // Build system prompt for the AI leader
    const relation = targetNation.diplomacy.relations[playerNationId] ?? 0;
    const isAlly = targetNation.diplomacy.alliances.includes(playerNationId);
    const isRival = targetNation.diplomacy.rivals.includes(playerNationId);
    const atWar = game.activeWars.some(
      (w) =>
        (w.attackers.includes(playerNationId) && w.defenders.includes(targetNationId)) ||
        (w.attackers.includes(targetNationId) && w.defenders.includes(playerNationId))
    );

    const personality = targetNation.aiPersonality;
    const ruler = targetNation.ruler;

    const systemPrompt = [
      `You are ${ruler.name}, the ruler of ${targetNation.name}.`,
      `Government: ${targetNation.government}. Your traits: ${ruler.traits.join(", ") || "none"}.`,
      `Diplomacy skill: ${ruler.diplomacySkill}/10, Military: ${ruler.militarySkill}/10.`,
      personality ? `Personality: aggressiveness ${personality.aggressiveness}/10, diplomacy focus ${personality.diplomacyFocus}/10, expansion desire ${personality.expansionDesire}/10.` : "",
      personality?.historicalGoals?.length ? `Your goals: ${personality.historicalGoals.join("; ")}.` : "",
      "",
      `Diplomatic context with ${playerNation.name}:`,
      `- Relations: ${relation} (range -100 to 100)`,
      isAlly ? "- You are ALLIES." : "",
      isRival ? "- They are your RIVAL." : "",
      atWar ? "- You are AT WAR with them." : "",
      `- Your military: ${targetNation.military.manpower.toLocaleString()} manpower, ${targetNation.military.armies.length} armies.`,
      `- Their military: ${playerNation.military.manpower.toLocaleString()} manpower, ${playerNation.military.armies.length} armies.`,
      `- Your treasury: ${targetNation.economy.treasury.toFixed(0)} gold.`,
      "",
      "Respond in character as this historical leader. Be diplomatic but authentic to your nation's interests and personality.",
      "Keep responses concise (2-4 sentences). Speak in first person.",
      atWar ? "You are hostile. You may demand terms or refuse to negotiate." : "",
      relation < -50 ? "You are very suspicious and cold." : "",
      relation > 50 ? "You are warm and open to cooperation." : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Build chat messages from history (last 20 exchanges max)
    const recentHistory = history.slice(-20);
    const chatMessages: { role: "user" | "assistant" | "system"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const msg of recentHistory) {
      if (msg.from === playerNationId) {
        chatMessages.push({ role: "user", content: msg.content });
      } else {
        chatMessages.push({ role: "assistant", content: msg.content });
      }
    }

    const context: import("@historia/llm").GameContext = {
      nationId: targetNationId,
      state: game,
      recentEvents: [],
      turnHistory: [],
    };

    try {
      const response = await provider.chat(chatMessages, context);

      // Store AI response
      const aiMsg: DiplomaticMessage = {
        id: `dm-${Date.now()}-a`,
        turn: game.currentTurn,
        from: targetNationId,
        to: playerNationId,
        content: response,
        timestamp: Date.now(),
      };
      history.push(aiMsg);

      gameChats.set(key, history);
      diplomaticChats.set(request.params.id, gameChats);

      // Persist chat history
      persistGame(request.params.id);

      return { playerMessage: playerMsg, response: aiMsg };
    } catch (err) {
      return reply.status(502).send({
        error: "CONNECTION_FAILED",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
