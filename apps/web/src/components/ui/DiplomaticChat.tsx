"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import type { Nation, DiplomaticMessage } from "@historia/shared";
import { api } from "@/lib/api";
import { useTranslation } from "@/i18n";

interface DiplomaticChatProps {
  gameId: string;
  playerNationId: string;
  nations: Record<string, Nation>;
  activeWars: { attackers: string[]; defenders: string[] }[];
}

export function DiplomaticChat({ gameId, playerNationId, nations, activeWars }: DiplomaticChatProps) {
  const { t } = useTranslation();
  const [selectedNation, setSelectedNation] = useState<string | null>(null);
  const [messages, setMessages] = useState<DiplomaticMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const otherNations = Object.values(nations).filter((n) => n.id !== playerNationId);
  const playerNation = nations[playerNationId];
  const targetNation = selectedNation ? nations[selectedNation] : null;

  // Load chat history when selecting a nation
  useEffect(() => {
    if (!selectedNation) return;
    api
      .getDiplomacyChat(gameId, playerNationId, selectedNation)
      .then(({ messages: msgs }) => setMessages(msgs))
      .catch(() => setMessages([]));
  }, [gameId, playerNationId, selectedNation]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedNation || sending) return;

    setSending(true);
    try {
      const { playerMessage, response } = await api.sendDiplomacyMessage(
        gameId,
        playerNationId,
        selectedNation,
        input.trim()
      );
      setMessages((prev) => [...prev, playerMessage, response]);
      setInput("");
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          turn: 0,
          from: "system",
          to: playerNationId,
          content: `Error: ${err instanceof Error ? err.message : "Failed to send"}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const getRelation = (nationId: string): number => {
    return nations[nationId]?.diplomacy.relations[playerNationId] ?? 0;
  };

  const getRelationColor = (relation: number): string => {
    if (relation > 50) return "#4ade80";
    if (relation > 0) return "#a3e635";
    if (relation > -50) return "#fbbf24";
    return "#f87171";
  };

  const isAtWar = (nationId: string): boolean => {
    return activeWars.some(
      (w) =>
        (w.attackers.includes(playerNationId) && w.defenders.includes(nationId)) ||
        (w.attackers.includes(nationId) && w.defenders.includes(playerNationId))
    );
  };

  const isAlly = (nationId: string): boolean => {
    return nations[nationId]?.diplomacy.alliances.includes(playerNationId) ?? false;
  };

  // Nation list view
  if (!selectedNation) {
    return (
      <div style={{ padding: "0.75rem", fontSize: "0.82rem" }}>
        <div style={{ color: "#888", marginBottom: "0.6rem", fontSize: "0.78rem" }}>
          {t("diplomacy_chat.select_nation")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {otherNations.map((nation) => {
            const relation = getRelation(nation.id);
            const war = isAtWar(nation.id);
            const ally = isAlly(nation.id);
            return (
              <button
                key={nation.id}
                onClick={() => setSelectedNation(nation.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.65rem",
                  backgroundColor: "#111",
                  border: "1px solid #222",
                  borderRadius: "6px",
                  color: "#e0e0e0",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      backgroundColor: nation.color,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{nation.name}</div>
                    <div style={{ color: "#555", fontSize: "0.72rem" }}>
                      {nation.ruler.name}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.72rem" }}>
                  {war && <span style={{ color: "#f87171", fontWeight: 600 }}>{t("diplomacy_chat.at_war")}</span>}
                  {ally && <span style={{ color: "#4ade80", fontWeight: 600 }}>{t("diplomacy_chat.ally")}</span>}
                  <span style={{ color: getRelationColor(relation), fontWeight: 600 }}>
                    {relation > 0 ? "+" : ""}{relation}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          borderBottom: "1px solid #1a1a1a",
          backgroundColor: "#0a0a0a",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => {
            setSelectedNation(null);
            setMessages([]);
          }}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: "0.82rem",
            padding: "0 0.3rem",
          }}
        >
          &larr;
        </button>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: targetNation?.color ?? "#555",
          }}
        />
        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{targetNation?.name}</span>
        <span style={{ color: "#555", fontSize: "0.72rem" }}>
          ({targetNation?.ruler.name})
        </span>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.5rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "#444", textAlign: "center", padding: "2rem 0", fontSize: "0.8rem" }}>
            {t("diplomacy_chat.begin_dialogue", { ruler: targetNation?.ruler.name ?? "", nation: targetNation?.name ?? "" })}
          </div>
        )}
        {messages.map((msg) => {
          const isPlayer = msg.from === playerNationId;
          const isError = msg.from === "system";
          const senderNation = isPlayer ? playerNation : targetNation;
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isPlayer ? "flex-end" : "flex-start",
                maxWidth: "85%",
              }}
            >
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "#555",
                  marginBottom: "0.15rem",
                  textAlign: isPlayer ? "right" : "left",
                }}
              >
                {isError ? "System" : senderNation?.ruler.name ?? msg.from}
              </div>
              <div
                style={{
                  padding: "0.45rem 0.7rem",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  lineHeight: "1.5",
                  backgroundColor: isError
                    ? "#2e1a1a"
                    : isPlayer
                      ? "#1a1a3e"
                      : "#1a1a1a",
                  border: `1px solid ${isError ? "#7f1d1d" : isPlayer ? "#2563eb44" : "#222"}`,
                  color: isError ? "#f87171" : "#e0e0e0",
                }}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
        {sending && (
          <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
            <div style={{ fontSize: "0.68rem", color: "#555", marginBottom: "0.15rem" }}>
              {targetNation?.ruler.name}
            </div>
            <div
              style={{
                padding: "0.45rem 0.7rem",
                borderRadius: "8px",
                fontSize: "0.8rem",
                backgroundColor: "#1a1a1a",
                border: "1px solid #222",
                color: "#555",
                fontStyle: "italic",
              }}
            >
              {t("diplomacy_chat.composing")}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        style={{
          display: "flex",
          gap: "0.4rem",
          padding: "0.5rem 0.75rem",
          borderTop: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("diplomacy_chat.speak_to", { ruler: targetNation?.ruler.name ?? "" })}
          disabled={sending}
          style={{
            flex: 1,
            padding: "0.4rem 0.6rem",
            backgroundColor: "#111",
            border: "1px solid #222",
            borderRadius: "6px",
            color: "#e0e0e0",
            fontSize: "0.8rem",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{
            padding: "0.4rem 0.8rem",
            backgroundColor: "#2563eb",
            border: "none",
            borderRadius: "6px",
            color: "white",
            fontWeight: 600,
            fontSize: "0.78rem",
            cursor: sending || !input.trim() ? "not-allowed" : "pointer",
            opacity: sending || !input.trim() ? 0.4 : 1,
          }}
        >
          {t("common.send")}
        </button>
      </form>
    </div>
  );
}
