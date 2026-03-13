"use client";

import type { GameState, Nation } from "@historia/shared";
import { useTranslation } from "@/i18n";

interface NationPickerProps {
  game: GameState;
  onSelect: (nationId: string) => void;
}

export function NationPicker({ game, onSelect }: NationPickerProps) {
  const { t } = useTranslation();
  const playableNations = Object.values(game.nations).filter((n) => n.playable);
  const allNations = playableNations.length > 0 ? playableNations : Object.values(game.nations);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        backgroundColor: "#0a0a0a",
        color: "#e0e0e0",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>
          {t("nation_picker.choose_nation")}
        </h1>
        <p style={{ color: "#666", fontSize: "0.9rem" }}>
          {game.currentDate.year}-{String(game.currentDate.month).padStart(2, "0")}
          {" | "}
          {Object.keys(game.provinces).length} provinces
          {" | "}
          {allNations.length} nations
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1rem",
          maxWidth: "950px",
          width: "100%",
        }}
      >
        {allNations
          .sort((a, b) => b.provinces.length - a.provinces.length)
          .map((nation) => (
            <NationCard key={nation.id} nation={nation} game={game} onSelect={onSelect} />
          ))}
      </div>

      <a
        href="/lobby"
        style={{
          marginTop: "2rem",
          color: "#555",
          textDecoration: "none",
          fontSize: "0.85rem",
        }}
      >
        {t("common.back_lobby")}
      </a>
    </div>
  );
}

function NationCard({
  nation,
  game,
  onSelect,
}: {
  nation: Nation;
  game: GameState;
  onSelect: (nationId: string) => void;
}) {
  const { t } = useTranslation();
  const totalTroops = nation.military.armies.reduce(
    (sum, a) => sum + a.units.infantry + a.units.cavalry + a.units.artillery,
    0
  );

  const difficulty = getDifficulty(nation, game);

  return (
    <button
      onClick={() => onSelect(nation.id)}
      style={{
        padding: "1rem 1.2rem",
        backgroundColor: "#111",
        border: "2px solid #222",
        borderRadius: "8px",
        color: "#e0e0e0",
        textAlign: "left",
        cursor: "pointer",
        transition: "border-color 0.2s, background-color 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = nation.color;
        e.currentTarget.style.backgroundColor = "#1a1a1a";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#222";
        e.currentTarget.style.backgroundColor = "#111";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              backgroundColor: nation.color,
              display: "inline-block",
              border: "1px solid #444",
            }}
          />
          <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{nation.name}</span>
        </div>
        <span
          style={{
            fontSize: "0.7rem",
            padding: "2px 6px",
            borderRadius: 3,
            backgroundColor:
              difficulty === "easy" ? "#166534" :
              difficulty === "normal" ? "#854d0e" :
              difficulty === "hard" ? "#7f1d1d" : "#4a044e",
            color:
              difficulty === "easy" ? "#4ade80" :
              difficulty === "normal" ? "#fbbf24" :
              difficulty === "hard" ? "#f87171" : "#e879f9",
            fontWeight: 600,
          }}
        >
          {t(`nation_picker.difficulty.${difficulty}`)}
        </span>
      </div>

      {/* Ruler */}
      <div style={{ fontSize: "0.78rem", color: "#888", marginBottom: "0.5rem" }}>
        {nation.ruler.name} | {nation.government.replace(/_/g, " ")}
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.3rem 1rem",
          fontSize: "0.78rem",
        }}
      >
        <StatLine label={t("nation_dashboard.provinces")} value={String(nation.provinces.length)} />
        <StatLine label={t("nation_dashboard.treasury")} value={nation.economy.treasury.toFixed(0)} />
        <StatLine label={t("nation_picker.troops")} value={formatNumber(totalTroops)} />
        <StatLine label={t("nation_dashboard.manpower")} value={formatNumber(nation.military.manpower)} />
        <StatLine label={t("nation_dashboard.stability")} value={String(nation.population.stability)} />
        <StatLine label={t("nation_picker.trade")} value={String(nation.economy.tradePower)} />
      </div>

      {/* Alliances / Rivals */}
      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
        {nation.diplomacy.alliances.slice(0, 3).map((id) => (
          <MiniTag key={id} label={game.nations[id]?.tag ?? id} color="#4ade80" />
        ))}
        {nation.diplomacy.rivals.slice(0, 3).map((id) => (
          <MiniTag key={id} label={game.nations[id]?.tag ?? id} color="#f87171" />
        ))}
      </div>

      {/* Goals */}
      {nation.aiPersonality?.historicalGoals && nation.aiPersonality.historicalGoals.length > 0 && (
        <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "#555", fontStyle: "italic" }}>
          {nation.aiPersonality.historicalGoals[0]}
        </div>
      )}
    </button>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function MiniTag({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: "0.68rem",
        padding: "1px 5px",
        borderRadius: 3,
        backgroundColor: `${color}18`,
        border: `1px solid ${color}33`,
        color,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function getDifficulty(nation: Nation, game: GameState): string {
  const provinces = nation.provinces.length;
  const totalProvinces = Object.keys(game.provinces).length;
  const pctOwned = provinces / totalProvinces;
  const rivals = nation.diplomacy.rivals.length;
  const alliances = nation.diplomacy.alliances.length;
  const stability = nation.population.stability;

  let score = 0;
  if (pctOwned > 0.15) score += 2;
  else if (pctOwned > 0.08) score += 1;
  if (alliances >= 2) score += 1;
  if (stability > 60) score += 1;
  if (rivals <= 1) score += 1;
  if (nation.economy.treasury > 300) score += 1;

  if (score >= 5) return "easy";
  if (score >= 3) return "normal";
  if (score >= 1) return "hard";
  return "very_hard";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}
