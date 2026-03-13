"use client";

import { useState } from "react";
import type { TurnHistoryEntry } from "@historia/shared";
import { useTranslation } from "@/i18n";

interface TurnHistoryProps {
  history: TurnHistoryEntry[];
  nations: Record<string, { name: string; color: string }>;
}

export function TurnHistory({ history, nations }: TurnHistoryProps) {
  const { t } = useTranslation();
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null);

  if (history.length === 0) {
    return (
      <div style={{ padding: "2rem", color: "#555", textAlign: "center", fontSize: "0.85rem" }}>
        {t("history.no_history")}
      </div>
    );
  }

  return (
    <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>
      <div style={{ color: "#666", marginBottom: "0.5rem", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {t("history.title", { count: history.length })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {[...history].reverse().map((entry) => {
          const isExpanded = expandedTurn === entry.turn;

          return (
            <div key={entry.turn} style={{ borderRadius: 6, backgroundColor: "#111", border: "1px solid #1a1a1a", overflow: "hidden" }}>
              {/* Turn header */}
              <button
                onClick={() => setExpandedTurn(isExpanded ? null : entry.turn)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem 0.65rem",
                  background: "none",
                  border: "none",
                  color: "#ccc",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "0.8rem",
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {t("history.turn", { turn: entry.turn })}
                </span>
                <span style={{ color: "#666", fontSize: "0.75rem" }}>
                  {entry.date.year}-{String(entry.date.month).padStart(2, "0")}
                  <span style={{ marginLeft: "0.4rem" }}>{isExpanded ? "\u25B2" : "\u25BC"}</span>
                </span>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{ padding: "0 0.65rem 0.65rem", borderTop: "1px solid #1a1a1a" }}>
                  {/* Narrative */}
                  {entry.narrative && (
                    <div style={{ padding: "0.5rem 0", color: "#bbb", borderLeft: "2px solid #333", paddingLeft: "0.5rem", marginTop: "0.4rem", lineHeight: 1.6, fontStyle: "italic" }}>
                      {entry.narrative}
                    </div>
                  )}

                  {/* Events */}
                  {entry.events.length > 0 && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <div style={{ color: "#666", fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.25rem", textTransform: "uppercase" }}>
                        {t("history.events")}
                      </div>
                      {entry.events.map((evt) => (
                        <div key={evt.id} style={{ padding: "0.2rem 0", color: "#fbbf24", borderLeft: "2px solid #fbbf2444", paddingLeft: "0.4rem", fontSize: "0.78rem" }}>
                          {evt.descriptionKey ? t(evt.descriptionKey, evt.descriptionParams) : evt.description}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Changes summary */}
                  {entry.delta && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <div style={{ color: "#666", fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.25rem", textTransform: "uppercase" }}>
                        {t("history.changes")}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                        {entry.delta.newWars.length > 0 && (
                          <Badge color="#f87171" text={t("history.new_wars", { count: entry.delta.newWars.length })} />
                        )}
                        {entry.delta.endedWars.length > 0 && (
                          <Badge color="#4ade80" text={t("history.ended_wars", { count: entry.delta.endedWars.length })} />
                        )}
                        {entry.delta.newTreaties.length > 0 && (
                          <Badge color="#60a5fa" text={t("history.new_treaties", { count: entry.delta.newTreaties.length })} />
                        )}
                        {Object.keys(entry.delta.nationChanges).length > 0 && (
                          <Badge color="#a78bfa" text={t("history.nations_updated", { count: Object.keys(entry.delta.nationChanges).length })} />
                        )}
                      </div>

                      {/* Nation changes detail */}
                      {Object.entries(entry.delta.nationChanges).map(([nationId, changes]) => {
                        const nationName = nations[nationId]?.name ?? nationId;
                        const nationColor = nations[nationId]?.color ?? "#888";
                        const details: string[] = [];

                        if (changes.economy) {
                          if (changes.economy.treasury !== undefined) {
                            details.push(`${t("nation_dashboard.treasury")}: ${changes.economy.treasury.toFixed(0)}`);
                          }
                        }
                        if (changes.military) {
                          const totalTroops = changes.military.armies?.reduce(
                            (sum, a) => sum + a.units.infantry + a.units.cavalry + a.units.artillery, 0
                          );
                          if (totalTroops !== undefined) {
                            details.push(`${t("nation_dashboard.total_troops")}: ${totalTroops.toLocaleString()}`);
                          }
                        }

                        if (details.length === 0) return null;

                        return (
                          <div key={nationId} style={{ marginTop: "0.3rem", fontSize: "0.75rem" }}>
                            <span style={{ color: nationColor, fontWeight: 600 }}>{nationName}</span>
                            <span style={{ color: "#555" }}> - </span>
                            <span style={{ color: "#999" }}>{details.join(" | ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Badge({ color, text }: { color: string; text: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "0.15rem 0.4rem",
      borderRadius: 4,
      backgroundColor: `${color}22`,
      color,
      fontSize: "0.7rem",
      fontWeight: 600,
    }}>
      {text}
    </span>
  );
}
