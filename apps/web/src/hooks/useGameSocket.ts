"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameRoom,
} from "@historia/shared";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

interface UseGameSocketOptions {
  gameId: string;
  playerName: string;
  enabled?: boolean;
  onRoomUpdate?: (room: GameRoom) => void;
  onPlayerJoined?: (data: { playerId: string; playerName: string }) => void;
  onPlayerLeft?: (data: { playerId: string; playerName: string }) => void;
  onTurnPlayerReady?: (data: { playerId: string; playerName: string; readyCount: number; totalCount: number }) => void;
  onTurnResolving?: () => void;
  onTurnResolved?: (data: { turn: number; narrative: string }) => void;
  onTimerTick?: (data: { secondsLeft: number }) => void;
  onTimerExpired?: () => void;
  onGameStarted?: () => void;
  onChatMessage?: (data: { playerId: string; playerName: string; message: string; timestamp: number }) => void;
  onNotification?: (data: { type: "info" | "warning" | "error"; message: string }) => void;
  onError?: (data: { message: string }) => void;
}

export function useGameSocket({
  gameId,
  playerName,
  enabled = true,
  onRoomUpdate,
  onPlayerJoined,
  onPlayerLeft,
  onTurnPlayerReady,
  onTurnResolving,
  onTurnResolved,
  onTimerTick,
  onTimerExpired,
  onGameStarted,
  onChatMessage,
  onNotification,
  onError,
}: UseGameSocketOptions) {
  const socketRef = useRef<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<GameRoom | null>(null);

  useEffect(() => {
    if (!enabled || !gameId || !playerName) return;

    const socket: TypedSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("game:join", { gameId, playerName });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("game:room_update", (updatedRoom) => {
      setRoom(updatedRoom);
      onRoomUpdate?.(updatedRoom);
    });

    socket.on("player:joined", (data) => onPlayerJoined?.(data));
    socket.on("player:left", (data) => onPlayerLeft?.(data));
    socket.on("turn:player_ready", (data) => onTurnPlayerReady?.(data));
    socket.on("turn:resolving", () => onTurnResolving?.());
    socket.on("turn:resolved", (data) => onTurnResolved?.(data));
    socket.on("turn:timer_tick", (data) => onTimerTick?.(data));
    socket.on("turn:timer_expired", () => onTimerExpired?.());
    socket.on("game:started", () => onGameStarted?.());
    socket.on("chat:message", (data) => onChatMessage?.(data));
    socket.on("notification", (data) => onNotification?.(data));
    socket.on("game:error", (data) => onError?.(data));

    return () => {
      socket.emit("game:leave", { gameId });
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setRoom(null);
    };
  }, [gameId, playerName, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickNation = useCallback((nationId: string) => {
    socketRef.current?.emit("game:pick_nation", { gameId, nationId });
  }, [gameId]);

  const ready = useCallback(() => {
    socketRef.current?.emit("game:ready", { gameId });
  }, [gameId]);

  const unready = useCallback(() => {
    socketRef.current?.emit("game:unready", { gameId });
  }, [gameId]);

  const startGame = useCallback(() => {
    socketRef.current?.emit("game:start", { gameId });
  }, [gameId]);

  const submitTurn = useCallback(() => {
    socketRef.current?.emit("turn:submit", { gameId });
  }, [gameId]);

  const sendChat = useCallback((message: string) => {
    socketRef.current?.emit("chat:message", { gameId, message });
  }, [gameId]);

  const configureTimer = useCallback((config: { enabled: boolean; durationSeconds: number; autoResolve: boolean }) => {
    socketRef.current?.emit("turn:timer_config", { gameId, config });
  }, [gameId]);

  return {
    connected,
    room,
    pickNation,
    ready,
    unready,
    startGame,
    submitTurn,
    sendChat,
    configureTimer,
    socket: socketRef.current,
  };
}
