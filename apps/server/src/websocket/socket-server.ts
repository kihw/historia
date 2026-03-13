import { Server as SocketIOServer, Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameRoom,
  PlayerSlot,
  TurnTimerConfig,
} from "@historia/shared";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedIO = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

// In-memory multiplayer rooms
const rooms = new Map<string, GameRoom>();
// Map socket.id → { playerId, playerName, gameId }
const socketPlayers = new Map<string, { playerId: string; playerName: string; gameId: string }>();
// Turn timers
const turnTimers = new Map<string, NodeJS.Timeout>();

// Callback when all players are ready
let onAllPlayersReady: ((gameId: string, readyNationIds: string[]) => Promise<void>) | null = null;

export function setOnAllPlayersReady(cb: (gameId: string, readyNationIds: string[]) => Promise<void>) {
  onAllPlayersReady = cb;
}

export function getRoom(gameId: string): GameRoom | undefined {
  return rooms.get(gameId);
}

export function getOrCreateRoom(gameId: string, hostPlayerId?: string): GameRoom {
  let room = rooms.get(gameId);
  if (!room) {
    room = {
      gameId,
      players: [],
      hostPlayerId: hostPlayerId ?? "",
      status: "lobby",
      readyPlayers: [],
    };
    rooms.set(gameId, room);
  }
  return room;
}

export function createSocketServer(httpServer: HttpServer): TypedIO {
  const io: TypedIO = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: TypedSocket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // ── Join Game ────────────────────────────────────────────────────
    socket.on("game:join", ({ gameId, playerName }) => {
      const playerId = socket.id;
      const room = getOrCreateRoom(gameId, playerId);

      // Check if player already in room (reconnect)
      const existing = room.players.find((p) => p.playerName === playerName);
      if (existing) {
        existing.playerId = playerId;
        existing.connected = true;
      } else {
        const isHost = room.players.length === 0;
        const player: PlayerSlot = {
          playerId,
          playerName,
          nationId: null,
          connected: true,
          isHost,
          joinedAt: Date.now(),
        };
        room.players.push(player);
        if (isHost) room.hostPlayerId = playerId;
      }

      socketPlayers.set(socket.id, { playerId, playerName, gameId });
      socket.join(gameId);

      // Notify everyone
      io.to(gameId).emit("player:joined", { playerId, playerName });
      io.to(gameId).emit("game:room_update", room);
    });

    // ── Leave Game ───────────────────────────────────────────────────
    socket.on("game:leave", ({ gameId }) => {
      handlePlayerLeave(io, socket, gameId);
    });

    // ── Pick Nation ──────────────────────────────────────────────────
    socket.on("game:pick_nation", ({ gameId, nationId }) => {
      const room = rooms.get(gameId);
      if (!room) return;

      // Check nation not already taken
      const taken = room.players.some((p) => p.nationId === nationId && p.playerId !== socket.id);
      if (taken) {
        socket.emit("game:error", { message: "Nation already taken by another player" });
        return;
      }

      const player = room.players.find((p) => p.playerId === socket.id);
      if (player) {
        player.nationId = nationId;
        io.to(gameId).emit("player:picked_nation", { playerId: socket.id, nationId });
        io.to(gameId).emit("game:room_update", room);
      }
    });

    // ── Ready / Unready ──────────────────────────────────────────────
    socket.on("game:ready", ({ gameId }) => {
      const room = rooms.get(gameId);
      if (!room) return;

      if (!room.readyPlayers.includes(socket.id)) {
        room.readyPlayers.push(socket.id);
      }

      const player = room.players.find((p) => p.playerId === socket.id);
      const humanPlayers = room.players.filter((p) => p.connected);

      io.to(gameId).emit("turn:player_ready", {
        playerId: socket.id,
        playerName: player?.playerName ?? "Unknown",
        readyCount: room.readyPlayers.length,
        totalCount: humanPlayers.length,
      });
      io.to(gameId).emit("game:room_update", room);

      // Check if all human players are ready
      if (room.readyPlayers.length >= humanPlayers.length && humanPlayers.length > 0) {
        resolveMultiplayerTurn(io, gameId, room);
      }
    });

    socket.on("game:unready", ({ gameId }) => {
      const room = rooms.get(gameId);
      if (!room) return;

      room.readyPlayers = room.readyPlayers.filter((id) => id !== socket.id);
      io.to(gameId).emit("game:room_update", room);
    });

    // ── Start Game (host only) ───────────────────────────────────────
    socket.on("game:start", ({ gameId }) => {
      const room = rooms.get(gameId);
      if (!room) return;
      if (room.hostPlayerId !== socket.id) {
        socket.emit("game:error", { message: "Only the host can start the game" });
        return;
      }

      // Validate all players have picked nations
      const unpicked = room.players.filter((p) => !p.nationId && p.connected);
      if (unpicked.length > 0) {
        socket.emit("game:error", { message: "All players must pick a nation first" });
        return;
      }

      room.status = "playing";
      io.to(gameId).emit("game:started", { gameId });
      io.to(gameId).emit("game:room_update", room);
    });

    // ── Turn Submit ──────────────────────────────────────────────────
    socket.on("turn:submit", ({ gameId }) => {
      // Same as game:ready for turn resolution
      const room = rooms.get(gameId);
      if (!room || room.status !== "playing") return;

      if (!room.readyPlayers.includes(socket.id)) {
        room.readyPlayers.push(socket.id);
      }

      const player = room.players.find((p) => p.playerId === socket.id);
      const humanPlayers = room.players.filter((p) => p.connected);

      io.to(gameId).emit("turn:player_ready", {
        playerId: socket.id,
        playerName: player?.playerName ?? "Unknown",
        readyCount: room.readyPlayers.length,
        totalCount: humanPlayers.length,
      });

      if (room.readyPlayers.length >= humanPlayers.length && humanPlayers.length > 0) {
        resolveMultiplayerTurn(io, gameId, room);
      }
    });

    // ── Turn Timer Config ────────────────────────────────────────────
    socket.on("turn:timer_config", ({ gameId, config }) => {
      const room = rooms.get(gameId);
      if (!room) return;
      if (room.hostPlayerId !== socket.id) {
        socket.emit("game:error", { message: "Only the host can configure the timer" });
        return;
      }

      room.turnTimer = config;
      io.to(gameId).emit("game:room_update", room);

      if (config.enabled && room.status === "playing") {
        startTurnTimer(io, gameId, room);
      } else {
        stopTurnTimer(gameId);
      }
    });

    // ── Lobby Chat ───────────────────────────────────────────────────
    socket.on("chat:message", ({ gameId, message }) => {
      const playerInfo = socketPlayers.get(socket.id);
      if (!playerInfo) return;

      io.to(gameId).emit("chat:message", {
        playerId: socket.id,
        playerName: playerInfo.playerName,
        message,
        timestamp: Date.now(),
      });
    });

    // ── Disconnect ───────────────────────────────────────────────────
    socket.on("disconnect", () => {
      const playerInfo = socketPlayers.get(socket.id);
      if (playerInfo) {
        handlePlayerLeave(io, socket, playerInfo.gameId);
      }
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function handlePlayerLeave(io: TypedIO, socket: TypedSocket, gameId: string) {
  const room = rooms.get(gameId);
  if (!room) return;

  const player = room.players.find((p) => p.playerId === socket.id);
  if (player) {
    player.connected = false;
    room.readyPlayers = room.readyPlayers.filter((id) => id !== socket.id);

    io.to(gameId).emit("player:left", {
      playerId: socket.id,
      playerName: player.playerName,
    });
    io.to(gameId).emit("game:room_update", room);
  }

  socket.leave(gameId);
  socketPlayers.delete(socket.id);

  // If all players disconnected, clean up room after 5 minutes
  const connected = room.players.filter((p) => p.connected);
  if (connected.length === 0) {
    setTimeout(() => {
      const check = rooms.get(gameId);
      if (check && check.players.every((p) => !p.connected)) {
        rooms.delete(gameId);
        stopTurnTimer(gameId);
      }
    }, 5 * 60 * 1000);
  }
}

async function resolveMultiplayerTurn(io: TypedIO, gameId: string, room: GameRoom) {
  stopTurnTimer(gameId);
  io.to(gameId).emit("turn:resolving");

  const readyNationIds = room.players
    .filter((p) => p.connected && p.nationId)
    .map((p) => p.nationId!);

  if (onAllPlayersReady) {
    try {
      await onAllPlayersReady(gameId, readyNationIds);
    } catch (err) {
      io.to(gameId).emit("game:error", {
        message: `Turn resolution failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  }

  // Reset ready state
  room.readyPlayers = [];
  io.to(gameId).emit("game:room_update", room);

  // Restart timer if configured
  if (room.turnTimer?.enabled && room.status === "playing") {
    startTurnTimer(io, gameId, room);
  }
}

function startTurnTimer(io: TypedIO, gameId: string, room: GameRoom) {
  stopTurnTimer(gameId);
  if (!room.turnTimer?.enabled) return;

  let secondsLeft = room.turnTimer.durationSeconds;
  room.currentTurnDeadline = Date.now() + secondsLeft * 1000;

  const timer = setInterval(() => {
    secondsLeft -= 1;
    io.to(gameId).emit("turn:timer_tick", { secondsLeft });

    if (secondsLeft <= 0) {
      clearInterval(timer);
      turnTimers.delete(gameId);
      io.to(gameId).emit("turn:timer_expired");

      if (room.turnTimer?.autoResolve) {
        resolveMultiplayerTurn(io, gameId, room);
      }
    }
  }, 1000);

  turnTimers.set(gameId, timer);
}

function stopTurnTimer(gameId: string) {
  const timer = turnTimers.get(gameId);
  if (timer) {
    clearInterval(timer);
    turnTimers.delete(gameId);
  }
}
