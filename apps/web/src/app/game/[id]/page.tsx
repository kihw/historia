"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { GameState, GameRoom, TurnDuration } from "@historia/shared";
import { UnifiedGameMap } from "@/components/map/UnifiedGameMap";
import { ProvincePanel } from "@/components/ui/ProvincePanel";
import { NationDashboard } from "@/components/ui/NationDashboard";
import { NationPicker } from "@/components/ui/NationPicker";
import { TurnHistory } from "@/components/ui/TurnHistory";
import { DiplomaticChat } from "@/components/ui/DiplomaticChat";
import { CommandSuggestions } from "@/components/ui/CommandSuggestions";
import { TechnologyPanel } from "@/components/ui/TechnologyPanel";
import { TurnTimer } from "@/components/ui/TurnTimer";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useGameStore } from "@/store/game-store";
import { useGameSocket } from "@/hooks/useGameSocket";
import { useTranslation } from "@/i18n";
import { api } from "@/lib/api";
import { ensureLLMConfigured } from "@/lib/llm-config";

type SideView = "log" | "dashboard" | "province" | "history" | "diplomacy" | "tech" | "players";

export default function GamePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const gameId = params.id as string;
  const isMultiplayer = searchParams.get("mp") === "1";
  const mpPlayerName = searchParams.get("name") ?? "Player";
  const preselectedNation = searchParams.get("nation");
  const { t } = useTranslation();

  const [preGame, setPreGame] = useState<GameState | null>(null);
  const [command, setCommand] = useState("");
  const [sideView, setSideView] = useState<SideView>("log");
  const logEndRef = useRef<HTMLDivElement>(null);
  const [mpRoom, setMpRoom] = useState<GameRoom | null>(null);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [mapMode, setMapMode] = useState<import("@/components/map/layers/types").MapMode>("political");

  const {
    game,
    playerNation,
    selectedProvince,
    eventLog,
    turnHistory,
    loading,
    setGame,
    updateGame,
    selectProvince,
    addEvents,
    addLogEntry,
    setTurnHistory,
    setLoading,
  } = useGameStore();

  // Socket.IO for multiplayer
  const {
    connected: socketConnected,
    room,
    pickNation,
    ready: socketReady,
    unready: socketUnready,
    startGame: socketStartGame,
    submitTurn: socketSubmitTurn,
    sendChat,
    configureTimer,
  } = useGameSocket({
    gameId,
    playerName: mpPlayerName,
    enabled: isMultiplayer,
    onRoomUpdate: (updatedRoom) => {
      setMpRoom(updatedRoom);
    },
    onPlayerJoined: (data) => {
      addLogEntry({
        id: `mp-join-${Date.now()}`,
        type: "system",
        text: t("multiplayer.player_joined", { name: data.playerName }),
        timestamp: Date.now(),
      });
    },
    onPlayerLeft: (data) => {
      addLogEntry({
        id: `mp-leave-${Date.now()}`,
        type: "system",
        text: t("multiplayer.player_left", { name: data.playerName }),
        timestamp: Date.now(),
      });
    },
    onTurnPlayerReady: (data) => {
      addLogEntry({
        id: `mp-ready-${Date.now()}`,
        type: "system",
        text: t("multiplayer.player_ready", { name: data.playerName, ready: data.readyCount, total: data.totalCount }),
        timestamp: Date.now(),
      });
    },
    onTurnResolving: () => {
      addLogEntry({
        id: `mp-resolving-${Date.now()}`,
        type: "system",
        text: t("game.all_submitted"),
        timestamp: Date.now(),
      });
      setLoading(true);
    },
    onTurnResolved: async (data) => {
      addLogEntry({
        id: `mp-resolved-${Date.now()}`,
        type: "system",
        text: t("game.turn_resolved", { turn: data.turn }),
        timestamp: Date.now(),
      });
      if (data.narrative) {
        addLogEntry({
          id: `mp-narr-${Date.now()}`,
          type: "narrative",
          text: data.narrative,
          timestamp: Date.now(),
        });
      }
      // Refetch game state with fog of war
      try {
        const { game: refreshed } = await api.getGame(gameId, playerNation ?? undefined);
        if (refreshed) updateGame(refreshed);
      } catch { /* ignore */ }
      setLoading(false);
      setSideView("log");
    },
    onTimerTick: (data) => {
      setTimerSeconds(data.secondsLeft);
    },
    onTimerExpired: () => {
      setTimerSeconds(null);
      addLogEntry({
        id: `mp-timer-${Date.now()}`,
        type: "system",
        text: t("multiplayer.timer_expired"),
        timestamp: Date.now(),
      });
    },
    onGameStarted: () => {
      addLogEntry({
        id: `mp-started-${Date.now()}`,
        type: "system",
        text: t("multiplayer.game_started"),
        timestamp: Date.now(),
      });
    },
    onChatMessage: (data) => {
      addLogEntry({
        id: `mp-chat-${Date.now()}-${Math.random()}`,
        type: "system",
        text: `[Chat] ${data.playerName}: ${data.message}`,
        timestamp: data.timestamp,
      });
    },
    onError: (data) => {
      addLogEntry({
        id: `mp-err-${Date.now()}`,
        type: "system",
        text: `Error: ${data.message}`,
        timestamp: Date.now(),
      });
    },
  });

  // Sync room from socket
  useEffect(() => {
    if (room) setMpRoom(room);
  }, [room]);

  // Load game data on mount (but don't pick nation yet)
  useEffect(() => {
    ensureLLMConfigured().catch(() => {});

    async function load() {
      try {
        setLoading(true);
        const { game: loadedGame } = await api.getGame(gameId);

        // Auto-select nation if ?nation= is in URL (from lobby country-first flow)
        if (preselectedNation && loadedGame.nations[preselectedNation]) {
          try {
            const { game: filtered } = await api.getGame(gameId, preselectedNation);
            setGame(gameId, filtered, preselectedNation);
          } catch {
            setGame(gameId, loadedGame, preselectedNation);
          }
        } else {
          setPreGame(loadedGame);
        }
      } catch (err) {
        addLogEntry({
          id: `err-${Date.now()}`,
          type: "system",
          text: `Failed to load game: ${err instanceof Error ? err.message : "Unknown error"}`,
          timestamp: Date.now(),
        });
      } finally {
        setLoading(false);
      }
    }
    if (!game) load();
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNationSelect = async (nationId: string) => {
    if (!preGame) return;
    // In multiplayer, also notify the socket server of nation pick
    if (isMultiplayer) {
      pickNation(nationId);
    }
    try {
      const { game: filtered } = await api.getGame(gameId, nationId);
      setGame(gameId, filtered, nationId);
    } catch {
      setGame(gameId, preGame, nationId);
    }
    setPreGame(null);
  };

  // Auto-scroll event log
  useEffect(() => {
    if (sideView === "log") {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [eventLog.length, sideView]);

  // Show province panel when clicking on map
  useEffect(() => {
    if (selectedProvince) {
      setSideView("province");
    }
  }, [selectedProvince]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !game || !playerNation) return;

    addLogEntry({
      id: `cmd-${Date.now()}`,
      type: "command",
      text: `> ${command}`,
      turn: game.currentTurn,
      timestamp: Date.now(),
    });

    try {
      const result = await api.submitCommand(gameId, playerNation, command);
      addLogEntry({
        id: `res-${Date.now()}`,
        type: "narrative",
        text: result.message,
        turn: game.currentTurn,
        timestamp: Date.now(),
      });
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          addLogEntry({
            id: `warn-${Date.now()}-${Math.random()}`,
            type: "system",
            text: `Warning: ${warning}`,
            turn: game.currentTurn,
            timestamp: Date.now(),
          });
        }
      }
      if (result.pendingCount > 0) {
        addLogEntry({
          id: `pending-${Date.now()}`,
          type: "system",
          text: isMultiplayer
            ? t("game.actions_queued_mp", { count: result.pendingCount })
            : t("game.actions_queued_solo", { count: result.pendingCount }),
          turn: game.currentTurn,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const isLlmError = message.includes("No LLM provider") || message.includes("503");
      addLogEntry({
        id: `err-${Date.now()}`,
        type: "system",
        text: isLlmError
          ? t("game.no_llm")
          : `Error: ${message}`,
        timestamp: Date.now(),
      });
    }

    setCommand("");
    setSideView("log");
  };

  const handleEndTurn = async () => {
    if (!game || !playerNation) return;

    if (isMultiplayer) {
      // In multiplayer, just signal readiness — server resolves when all are ready
      socketSubmitTurn();
      addLogEntry({
        id: `mp-submit-${Date.now()}`,
        type: "system",
        text: t("game.turn_submitted"),
        timestamp: Date.now(),
      });
      return;
    }

    // Solo mode — resolve immediately
    setLoading(true);
    try {
      const result = await api.submitTurn(gameId, playerNation);
      updateGame(result.game);
      addEvents(result.events);
      if (result.history) {
        setTurnHistory(result.history);
      }

      addLogEntry({
        id: `turn-${Date.now()}`,
        type: "system",
        text: `--- Turn ${result.turn} | ${result.date.year}-${String(result.date.month).padStart(2, "0")} ---`,
        turn: result.turn,
        timestamp: Date.now(),
      });

      if (result.narrative) {
        addLogEntry({
          id: `narr-${Date.now()}`,
          type: "narrative",
          text: result.narrative,
          turn: result.turn,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      addLogEntry({
        id: `err-${Date.now()}`,
        type: "system",
        text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
      setSideView("log");
    }
  };

  // Loading state
  if (!game && !preGame) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#888",
          backgroundColor: "#0a0a0a",
        }}
      >
        {loading ? t("game.loading") : t("game.not_found")}
      </div>
    );
  }

  // Nation selection screen
  if (!game && preGame) {
    return <NationPicker game={preGame} onSelect={handleNationSelect} />;
  }

  if (!game) return null;

  const selectedProv = selectedProvince ? game.provinces[selectedProvince] : null;
  const nation = playerNation ? game.nations[playerNation] : null;
  const activeWars = game.activeWars.filter(
    (w) => nation && (w.attackers.includes(nation.id) || w.defenders.includes(nation.id))
  );

  // Multiplayer ready state
  const mySocketPlayer = mpRoom?.players.find((p) => p.playerName === mpPlayerName);
  const iAmReady = mySocketPlayer ? mpRoom?.readyPlayers.includes(mySocketPlayer.playerId) ?? false : false;
  const connectedPlayers = mpRoom?.players.filter((p) => p.connected) ?? [];
  const readyCount = mpRoom?.readyPlayers.length ?? 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 360px",
        gridTemplateRows: "auto 1fr auto",
        height: "100vh",
        gap: 0,
        backgroundColor: "#0a0a0a",
        color: "#e0e0e0",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1rem",
          height: 44,
          background: "linear-gradient(to right, rgba(15,15,15,1), rgba(12,12,18,1), rgba(15,15,15,1))",
          borderBottom: "1px solid #1a1a1a",
          fontSize: "0.82rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
          <span style={{
            fontWeight: 700,
            fontSize: "0.92rem",
            color: nation?.color ?? "#fff",
            borderBottom: `2px solid ${nation?.color ?? "#333"}`,
            paddingBottom: 2,
          }}>
            {nation?.name ?? "Unknown"}
          </span>
          <TopSep />
          <span style={{ color: "#999", fontSize: "0.82rem" }}>
            {game.turnDuration === "1_year"
              ? `${game.currentDate.year}`
              : game.turnDuration === "1_week" && game.currentDate.day
                ? `${String(game.currentDate.day).padStart(2, "0")}/${String(game.currentDate.month).padStart(2, "0")}/${game.currentDate.year}`
                : `${String(game.currentDate.month).padStart(2, "0")}/${game.currentDate.year}`}
          </span>
          <TopSep />
          <span style={{ color: "#777" }}>{t("game.turn", { turn: game.currentTurn })}</span>
          {activeWars.length > 0 && (
            <>
              <TopSep />
              <span style={{ color: "#f87171", fontWeight: 600, fontSize: "0.8rem" }}>
                {activeWars.length > 1
                  ? t("game.wars_count", { count: activeWars.length })
                  : t("game.war_count", { count: activeWars.length })}
              </span>
            </>
          )}
          {isMultiplayer && (
            <>
              <TopSep />
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: "0.78rem",
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: socketConnected ? "#4ade80" : "#f87171",
                  display: "inline-block",
                }} />
                {socketConnected ? t("game.online", { count: connectedPlayers.length }) : t("game.disconnected")}
              </span>
              {readyCount > 0 && (
                <span style={{ color: "#fbbf24", fontSize: "0.78rem" }}>
                  {t("game.ready_count", { ready: readyCount, total: connectedPlayers.length })}
                </span>
              )}
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: "1rem", color: "#aaa", fontSize: "0.8rem", alignItems: "center", position: "relative" }}>
          {isMultiplayer && (
            <TurnTimer
              secondsLeft={timerSeconds}
              isHost={mySocketPlayer?.isHost ?? false}
              enabled={mpRoom?.turnTimer?.enabled ?? false}
              durationSeconds={mpRoom?.turnTimer?.durationSeconds ?? 120}
              autoResolve={mpRoom?.turnTimer?.autoResolve ?? true}
              onConfigure={configureTimer}
            />
          )}
          <TopStat icon="$" label={t("game.treasury")} value={nation?.economy.treasury.toFixed(0) ?? "?"} color={
            (nation?.economy.monthlyIncome ?? 0) >= (nation?.economy.monthlyExpenses ?? 0) ? "#fbbf24" : "#f87171"
          } />
          <TopStat icon="\u2696" label={t("game.stability")} value={String(nation?.population.stability ?? "?")} color={
            (nation?.population.stability ?? 50) > 60 ? "#4ade80" : (nation?.population.stability ?? 50) > 30 ? "#fbbf24" : "#f87171"
          } />
          <TopStat icon="\u2694" label={t("game.manpower")} value={nation?.military.manpower.toLocaleString() ?? "?"} color="#60a5fa" />
          <LanguageSwitcher compact />
        </div>
      </div>

      {/* Map area */}
      <div style={{ backgroundColor: "#0a1628", overflow: "hidden", position: "relative" }}>
        <UnifiedGameMap
          provinces={game.provinces}
          nations={game.nations}
          wars={game.activeWars}
          onProvinceClick={(id) => {
            selectProvince(id);
            setSideView("province");
          }}
          selectedProvince={selectedProvince}
          mapMode={mapMode}
          onMapModeChange={setMapMode}
          playerNation={playerNation}
        />
        {/* Nation legend */}
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            backgroundColor: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(6px)",
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.05)",
            fontSize: "0.7rem",
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            maxWidth: 420,
          }}
        >
          {Object.values(game.nations)
            .filter((n) => n.provinces.length > 0)
            .sort((a, b) => b.provinces.length - a.provinces.length)
            .slice(0, 12)
            .map((n) => (
              <span
                key={n.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "1px 4px",
                  borderRadius: 3,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  cursor: "default",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: n.color,
                    display: "inline-block",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                />
                <span style={{ color: "#aaa" }}>{n.tag}</span>
                <span style={{ color: "#555", fontSize: "0.6rem" }}>({n.provinces.length})</span>
              </span>
            ))}
        </div>
      </div>

      {/* Side panel */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0f0f0f",
          borderLeft: "1px solid #1a1a1a",
          overflow: "hidden",
        }}
      >
        {/* Side panel tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #1a1a1a",
            backgroundColor: "#0a0a0a",
          }}
        >
          <SideTab icon={"\u2630"} label={t("game.tabs.log")} active={sideView === "log"} onClick={() => setSideView("log")} />
          <SideTab icon={"\u2691"} label={t("game.tabs.nation")} active={sideView === "dashboard"} onClick={() => setSideView("dashboard")} />
          <SideTab
            icon={"\u2302"}
            label={t("game.tabs.province")}
            active={sideView === "province"}
            onClick={() => setSideView("province")}
            disabled={!selectedProv}
          />
          <SideTab icon={"\u231A"} label={t("game.tabs.history")} active={sideView === "history"} onClick={() => setSideView("history")} />
          <SideTab icon={"\u2694"} label={t("game.tabs.diplomacy")} active={sideView === "diplomacy"} onClick={() => setSideView("diplomacy")} />
          <SideTab icon={"\u2699"} label={t("game.tabs.tech")} active={sideView === "tech"} onClick={() => setSideView("tech")} />
          {isMultiplayer && (
            <SideTab icon={"\u263A"} label={t("game.tabs.players")} active={sideView === "players"} onClick={() => setSideView("players")} />
          )}
        </div>

        {/* Side panel content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sideView === "log" && (
            <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", lineHeight: 1.7 }}>
              {eventLog.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    marginBottom: "0.3rem",
                    padding: "0.15rem 0",
                    color:
                      entry.type === "command"
                        ? "#60a5fa"
                        : entry.type === "event"
                          ? "#fbbf24"
                          : entry.type === "narrative"
                            ? "#ccc"
                            : "#555",
                    borderLeft:
                      entry.type === "narrative"
                        ? "2px solid #333"
                        : entry.type === "event"
                          ? "2px solid #fbbf2444"
                          : "none",
                    paddingLeft:
                      entry.type === "narrative" || entry.type === "event"
                        ? "0.5rem"
                        : undefined,
                  }}
                >
                  {entry.descriptionKey ? t(entry.descriptionKey, entry.descriptionParams) : entry.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {sideView === "dashboard" && nation && (
            <NationDashboard nation={nation} game={game} />
          )}

          {sideView === "province" && selectedProv && (
            <ProvincePanel
              province={selectedProv}
              owner={game.nations[selectedProv.owner]}
            />
          )}

          {sideView === "province" && !selectedProv && (
            <div style={{ padding: "2rem", color: "#555", textAlign: "center", fontSize: "0.85rem" }}>
              {t("game.province_hint")}
            </div>
          )}

          {sideView === "history" && (
            <TurnHistory history={turnHistory} nations={game.nations} />
          )}

          {sideView === "diplomacy" && playerNation && (
            <DiplomaticChat
              gameId={gameId}
              playerNationId={playerNation}
              nations={game.nations}
              activeWars={game.activeWars}
            />
          )}

          {sideView === "tech" && nation && (
            <TechnologyPanel
              nation={nation}
              onResearch={(techId) => {
                setCommand(`Research ${techId}`);
              }}
            />
          )}

          {sideView === "players" && isMultiplayer && (
            <MultiplayerPanel
              room={mpRoom}
              myPlayerName={mpPlayerName}
              nations={game.nations}
              onStartGame={socketStartGame}
              socketConnected={socketConnected}
              gameId={gameId}
              t={t}
            />
          )}
        </div>
      </div>

      {/* Command bar */}
      <div
        style={{
          gridColumn: "1 / -1",
          borderTop: "1px solid #1a1a1a",
          padding: "0.3rem 1rem 0.5rem",
          background: "linear-gradient(to top, rgba(15,15,15,1), rgba(12,12,16,1))",
        }}
      >
        {nation && (
          <CommandSuggestions
            game={game}
            nation={nation}
            onSelect={(cmd) => setCommand(cmd)}
          />
        )}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", gap: "0.5rem" }}
        >
          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{
              position: "absolute",
              left: 10,
              color: "#444",
              fontSize: "0.82rem",
              pointerEvents: "none",
              fontFamily: "monospace",
            }}>&gt;</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t("game.command_placeholder")}
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.5rem 0.8rem 0.5rem 1.6rem",
                backgroundColor: "#141414",
                border: "1px solid #222",
                borderRadius: "8px",
                color: "#e0e0e0",
                fontSize: "0.85rem",
                outline: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#2563eb";
                e.currentTarget.style.boxShadow = "0 0 0 2px rgba(37,99,235,0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#222";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !command.trim()}
            style={{
              padding: "0.5rem 1.2rem",
              backgroundColor: "#2563eb",
              border: "none",
              borderRadius: "8px",
              color: "white",
              fontWeight: 600,
              fontSize: "0.82rem",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading || !command.trim() ? 0.4 : 1,
              transition: "all 0.2s",
              boxShadow: loading || !command.trim() ? "none" : "0 0 12px rgba(37,99,235,0.15)",
            }}
          >
            {t("common.send")}
          </button>
          {isMultiplayer ? (
            <button
              type="button"
              onClick={handleEndTurn}
              disabled={loading || iAmReady}
              style={{
                padding: "0.45rem 1rem",
                backgroundColor: iAmReady ? "#854d0e" : "#166534",
                border: "none",
                borderRadius: "6px",
                color: "white",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: loading || iAmReady ? "not-allowed" : "pointer",
                opacity: loading || iAmReady ? 0.6 : 1,
                transition: "opacity 0.2s, background-color 0.2s",
              }}
            >
              {iAmReady ? t("game.waiting", { ready: readyCount, total: connectedPlayers.length }) : t("game.ready_btn")}
            </button>
          ) : (
            <>
              <SpeedSelector
                gameId={gameId}
                currentDuration={game.turnDuration}
                onDurationChange={(d) => {
                  if (game) updateGame({ ...game, turnDuration: d });
                }}
              />
              <button
                type="button"
                onClick={handleEndTurn}
                disabled={loading}
                style={{
                  padding: "0.45rem 1rem",
                  backgroundColor: "#166534",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.4 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {t("game.end_turn")}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

function TopSep() {
  return (
    <span style={{
      width: 1,
      height: 16,
      background: "linear-gradient(to bottom, transparent, #333, transparent)",
      display: "inline-block",
    }} />
  );
}

function TopStat({ icon, label, value, color }: { icon?: string; label: string; value: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {icon && <span style={{ fontSize: "0.75rem", color: "#555" }}>{icon}</span>}
      <span style={{ color: "#555", fontSize: "0.78rem" }}>{label}:</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </span>
  );
}

function SideTab({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon?: string;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: "0.45rem 0",
        background: active ? "rgba(26,26,46,0.6)" : "transparent",
        border: "none",
        borderBottom: active ? "2px solid #60a5fa" : "2px solid transparent",
        color: disabled ? "#333" : active ? "#60a5fa" : "#666",
        cursor: disabled ? "default" : "pointer",
        fontSize: "0.72rem",
        fontWeight: 600,
        transition: "all 0.15s",
        textShadow: active ? "0 0 12px rgba(96,165,250,0.3)" : "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) e.currentTarget.style.background = "rgba(26,26,46,0.3)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {icon && <span style={{ fontSize: "0.8rem" }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

function MultiplayerPanel({
  room,
  myPlayerName,
  nations,
  onStartGame,
  socketConnected,
  gameId,
  t,
}: {
  room: GameRoom | null;
  myPlayerName: string;
  nations: Record<string, import("@historia/shared").Nation>;
  onStartGame: () => void;
  socketConnected: boolean;
  gameId: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [copied, setCopied] = useState(false);

  if (!room) {
    return (
      <div style={{ padding: "2rem", color: "#555", textAlign: "center", fontSize: "0.85rem" }}>
        {socketConnected ? t("multiplayer.loading_room") : t("multiplayer.connecting")}
      </div>
    );
  }

  const mySlot = room.players.find((p) => p.playerName === myPlayerName);
  const isHost = mySlot?.isHost ?? false;

  return (
    <div style={{ padding: "0.8rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#e0e0e0" }}>{t("multiplayer.players")}</span>
        <span style={{
          fontSize: "0.72rem",
          padding: "0.2rem 0.5rem",
          borderRadius: 4,
          backgroundColor: room.status === "lobby" ? "#1a1a2e" : "#162e16",
          color: room.status === "lobby" ? "#60a5fa" : "#4ade80",
        }}>
          {room.status}
        </span>
      </div>

      {/* Game ID for sharing */}
      <div style={{
        display: "flex",
        gap: "0.4rem",
        alignItems: "center",
        marginBottom: "0.8rem",
        padding: "0.5rem",
        backgroundColor: "#1a1a1a",
        borderRadius: 6,
        fontSize: "0.75rem",
      }}>
        <span style={{ color: "#555" }}>ID:</span>
        <span style={{ color: "#aaa", flex: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
          {gameId}
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(gameId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          style={{
            padding: "0.2rem 0.5rem",
            backgroundColor: "#222",
            border: "1px solid #333",
            borderRadius: 4,
            color: copied ? "#4ade80" : "#888",
            fontSize: "0.7rem",
            cursor: "pointer",
          }}
        >
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>

      {/* Player list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.8rem" }}>
        {room.players.map((player) => {
          const nationInfo = player.nationId ? nations[player.nationId] : null;
          const isReady = room.readyPlayers.includes(player.playerId);
          return (
            <div
              key={player.playerId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.6rem",
                backgroundColor: player.playerName === myPlayerName ? "#1a1a2e" : "#111",
                borderRadius: 6,
                border: `1px solid ${player.playerName === myPlayerName ? "#2563eb44" : "#1a1a1a"}`,
              }}
            >
              {/* Connection indicator */}
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                backgroundColor: player.connected ? "#4ade80" : "#555",
                flexShrink: 0,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#e0e0e0" }}>
                  {player.playerName}
                  {player.isHost && <span style={{ color: "#fbbf24", marginLeft: 4, fontSize: "0.7rem" }}>{t("multiplayer.host")}</span>}
                </div>
                {nationInfo && (
                  <div style={{ fontSize: "0.72rem", color: nationInfo.color, marginTop: 1 }}>
                    {nationInfo.name} ({nationInfo.tag})
                  </div>
                )}
                {!nationInfo && (
                  <div style={{ fontSize: "0.72rem", color: "#555", marginTop: 1 }}>
                    {t("multiplayer.picking_nation")}
                  </div>
                )}
              </div>

              {isReady && (
                <span style={{ fontSize: "0.7rem", color: "#4ade80", fontWeight: 600 }}>{t("multiplayer.ready")}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Host controls */}
      {isHost && room.status === "lobby" && (
        <button
          onClick={onStartGame}
          style={{
            width: "100%",
            padding: "0.5rem",
            backgroundColor: "#166534",
            border: "none",
            borderRadius: 6,
            color: "white",
            fontWeight: 600,
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
        >
          {t("multiplayer.start_game")}
        </button>
      )}
    </div>
  );
}

const SPEED_OPTIONS: TurnDuration[] = ["1_week", "1_month", "3_months", "6_months", "1_year"];
const SPEED_LABELS: Record<TurnDuration, string> = {
  "1_week": "1W",
  "1_month": "1M",
  "3_months": "3M",
  "6_months": "6M",
  "1_year": "1Y",
};

function SpeedSelector({
  gameId,
  currentDuration,
  onDurationChange,
}: {
  gameId: string;
  currentDuration: TurnDuration;
  onDurationChange: (d: TurnDuration) => void;
}) {
  const idx = SPEED_OPTIONS.indexOf(currentDuration);

  const cycle = (dir: -1 | 1) => {
    const next = SPEED_OPTIONS[idx + dir];
    if (!next) return;
    onDurationChange(next);
    api.setGameSpeed(gameId, next).catch(() => {});
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 2,
      backgroundColor: "#111",
      border: "1px solid #222",
      borderRadius: 6,
      padding: "0 2px",
    }}>
      <button
        type="button"
        onClick={() => cycle(-1)}
        disabled={idx <= 0}
        style={{
          padding: "0.3rem 0.4rem",
          background: "none",
          border: "none",
          color: idx <= 0 ? "#333" : "#888",
          cursor: idx <= 0 ? "default" : "pointer",
          fontSize: "0.7rem",
          fontWeight: 700,
        }}
      >
        ◀
      </button>
      <span style={{
        minWidth: 28,
        textAlign: "center",
        fontSize: "0.72rem",
        fontWeight: 600,
        color: "#ccc",
        userSelect: "none",
      }}>
        {SPEED_LABELS[currentDuration]}
      </span>
      <button
        type="button"
        onClick={() => cycle(1)}
        disabled={idx >= SPEED_OPTIONS.length - 1}
        style={{
          padding: "0.3rem 0.4rem",
          background: "none",
          border: "none",
          color: idx >= SPEED_OPTIONS.length - 1 ? "#333" : "#888",
          cursor: idx >= SPEED_OPTIONS.length - 1 ? "default" : "pointer",
          fontSize: "0.7rem",
          fontWeight: 700,
        }}
      >
        ▶
      </button>
    </div>
  );
}
