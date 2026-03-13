import Fastify from "fastify";
import cors from "@fastify/cors";
import { createLLMProviderFromEnv } from "@historia/llm";
import { gameRoutes, resolveMultiplayerTurnViaAPI } from "./routes/games.js";
import { createSocketServer, setOnAllPlayersReady, getRoom } from "./websocket/socket-server.js";

const server = Fastify({
  logger: true,
});

await server.register(cors, {
  origin: process.env.CORS_ORIGIN ?? "*",
});

const llmInfo = createLLMProviderFromEnv();

// Health check
server.get("/health", async () => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    provider: llmInfo?.name ?? "Not configured",
    configured: llmInfo !== null,
  };
});

// API routes
server.register(gameRoutes, { prefix: "/api" });

// Start
const port = parseInt(process.env.PORT ?? "4000", 10);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await server.listen({ port, host });

  // Attach Socket.IO to the underlying Node HTTP server
  const io = createSocketServer(server.server);

  // Wire multiplayer turn resolution — when all players submit, resolve via the game engine
  setOnAllPlayersReady(async (gameId, readyNationIds) => {
    const room = getRoom(gameId);
    if (!room) return;

    try {
      const result = await resolveMultiplayerTurnViaAPI(gameId, readyNationIds);
      if (result) {
        io.to(gameId).emit("turn:resolved", {
          turn: result.turn,
          narrative: result.narrative,
        });
        io.to(gameId).emit("game:room_update", room);
      }
    } catch (err) {
      io.to(gameId).emit("game:error", {
        message: `Turn resolution failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  });

  server.log.info(`Historia server running on http://${host}:${port}`);
  server.log.info(`Socket.IO attached and listening for WebSocket connections`);

  if (!llmInfo) {
    server.log.warn("No LLM provider configured. Use the Settings page or set OPENROUTER_API_KEY / OLLAMA_HOST env vars.");
  }
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
