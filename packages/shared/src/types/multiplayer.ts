export interface GameRoom {
  gameId: string;
  players: PlayerSlot[];
  hostPlayerId: string;
  status: "lobby" | "playing" | "paused" | "finished";
  turnTimer?: TurnTimerConfig;
  currentTurnDeadline?: number;
  readyPlayers: string[];
}

export interface PlayerSlot {
  playerId: string;
  playerName: string;
  nationId: string | null;
  connected: boolean;
  isHost: boolean;
  joinedAt: number;
}

export interface TurnTimerConfig {
  enabled: boolean;
  durationSeconds: number;
  autoResolve: boolean;
}

// ── Socket Events: Client → Server ─────────────────────────────────

export interface ClientToServerEvents {
  "game:join": (data: { gameId: string; playerName: string }) => void;
  "game:leave": (data: { gameId: string }) => void;
  "game:pick_nation": (data: { gameId: string; nationId: string }) => void;
  "game:ready": (data: { gameId: string }) => void;
  "game:unready": (data: { gameId: string }) => void;
  "game:start": (data: { gameId: string }) => void;
  "turn:submit": (data: { gameId: string }) => void;
  "turn:timer_config": (data: { gameId: string; config: TurnTimerConfig }) => void;
  "chat:message": (data: { gameId: string; message: string }) => void;
}

// ── Socket Events: Server → Client ─────────────────────────────────

export interface ServerToClientEvents {
  "game:room_update": (room: GameRoom) => void;
  "game:started": (data: { gameId: string }) => void;
  "game:error": (data: { message: string }) => void;
  "turn:player_ready": (data: { playerId: string; playerName: string; readyCount: number; totalCount: number }) => void;
  "turn:resolving": () => void;
  "turn:resolved": (data: { turn: number; narrative: string }) => void;
  "turn:timer_tick": (data: { secondsLeft: number }) => void;
  "turn:timer_expired": () => void;
  "player:joined": (data: { playerId: string; playerName: string }) => void;
  "player:left": (data: { playerId: string; playerName: string }) => void;
  "player:picked_nation": (data: { playerId: string; nationId: string }) => void;
  "chat:message": (data: { playerId: string; playerName: string; message: string; timestamp: number }) => void;
  "notification": (data: { type: "info" | "warning" | "error"; message: string }) => void;
}
