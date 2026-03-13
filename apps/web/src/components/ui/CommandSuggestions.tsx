"use client";

import { useMemo } from "react";
import type { GameState, Nation } from "@historia/shared";

interface CommandSuggestionsProps {
  game: GameState;
  nation: Nation;
  onSelect: (command: string) => void;
}

interface Suggestion {
  text: string;
  category: "diplomacy" | "military" | "economy" | "internal";
}

export function CommandSuggestions({ game, nation, onSelect }: CommandSuggestionsProps) {
  const suggestions = useMemo(() => {
    const result: Suggestion[] = [];

    const otherNations = Object.values(game.nations).filter((n) => n.id !== nation.id);
    const rivals = otherNations.filter((n) => nation.diplomacy.rivals.includes(n.id));
    const neutral = otherNations.filter(
      (n) =>
        !nation.diplomacy.rivals.includes(n.id) &&
        !nation.diplomacy.alliances.includes(n.id)
    );

    const activeWars = game.activeWars.filter(
      (w) => w.attackers.includes(nation.id) || w.defenders.includes(nation.id)
    );
    const enemies = activeWars.flatMap((w) =>
      w.attackers.includes(nation.id) ? w.defenders : w.attackers
    );

    if (enemies.length > 0) {
      const enemyName = game.nations[enemies[0]]?.name;
      if (enemyName) {
        result.push({ text: `Propose peace with ${enemyName}`, category: "diplomacy" });
        result.push({ text: `Move army to attack ${enemyName}`, category: "military" });
      }
    }

    if (rivals.length > 0 && enemies.length === 0) {
      result.push({ text: `Declare war on ${rivals[0].name}`, category: "diplomacy" });
    }

    if (neutral.length > 0) {
      const target = neutral.sort((a, b) =>
        (nation.diplomacy.relations[b.id] ?? 0) - (nation.diplomacy.relations[a.id] ?? 0)
      )[0];
      result.push({ text: `Propose alliance with ${target.name}`, category: "diplomacy" });
      result.push({ text: `Improve relations with ${target.name}`, category: "diplomacy" });
    }

    if (nation.military.manpower > 1000) {
      result.push({ text: "Recruit 5000 infantry", category: "military" });
    }
    if (nation.military.armies.length > 0) {
      const army = nation.military.armies[0];
      result.push({ text: `Move ${army.name} to ${nation.capital}`, category: "military" });
    }

    if (nation.economy.treasury > 100) {
      result.push({ text: `Build marketplace in ${nation.capital}`, category: "economy" });
    }
    if (nation.economy.taxRate < 20) {
      result.push({ text: "Increase tax rate to 15%", category: "economy" });
    } else {
      result.push({ text: "Lower tax rate to 10%", category: "economy" });
    }

    if (nation.population.stability < 50) {
      result.push({ text: "Enact policy to improve stability", category: "internal" });
    }

    return result.slice(0, 6);
  }, [game, nation]);

  if (suggestions.length === 0) return null;

  const catColor: Record<string, string> = {
    diplomacy: "#60a5fa",
    military: "#f87171",
    economy: "#fbbf24",
    internal: "#a78bfa",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "0.35rem",
        flexWrap: "wrap",
        padding: "0.3rem 0",
      }}
    >
      {suggestions.map((s) => {
        const color = catColor[s.category];
        return (
          <button
            key={s.text}
            onClick={() => onSelect(s.text)}
            style={{
              padding: "0.2rem 0.55rem 0.2rem 0.45rem",
              backgroundColor: "#111",
              border: `1px solid ${color}25`,
              borderLeft: `3px solid ${color}50`,
              borderRadius: "6px",
              color: "#aaa",
              fontSize: "0.72rem",
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${color}12`;
              e.currentTarget.style.color = "#e0e0e0";
              e.currentTarget.style.borderColor = `${color}40`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#111";
              e.currentTarget.style.color = "#aaa";
              e.currentTarget.style.borderColor = `${color}25`;
            }}
          >
            {s.text}
          </button>
        );
      })}
    </div>
  );
}
