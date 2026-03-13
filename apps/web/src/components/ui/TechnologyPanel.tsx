"use client";

import { useState } from "react";
import type { Nation, TechTree, TechCategory, Technology, NationTechState } from "@historia/shared";
import { DEFAULT_TECH_TREE } from "@historia/shared";
import { useTranslation } from "@/i18n";

interface TechnologyPanelProps {
  nation: Nation;
  onResearch?: (techId: string) => void;
}

export function TechnologyPanel({ nation, onResearch }: TechnologyPanelProps) {
  const { t } = useTranslation();
  const tree = DEFAULT_TECH_TREE;
  const tech: NationTechState = nation.technology ?? {
    researched: [],
    currentResearch: null,
    researchProgress: 0,
    researchPerTurn: 10 + nation.ruler.adminSkill * 2,
  };

  const [selectedCategory, setSelectedCategory] = useState(tree.categories[0].id);
  const category = tree.categories.find((c) => c.id === selectedCategory)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.75rem" }}>
      {/* Current Research */}
      <CurrentResearch tech={tech} tree={tree} />

      {/* Category tabs */}
      <div style={{ display: "flex", gap: "0.3rem" }}>
        {tree.categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            style={{
              flex: 1,
              padding: "0.35rem 0",
              background: selectedCategory === cat.id ? "#1a1a2e" : "transparent",
              border: selectedCategory === cat.id ? "1px solid #333" : "1px solid #1a1a1a",
              borderRadius: 4,
              color: selectedCategory === cat.id ? "#60a5fa" : "#666",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            {t(`nation_dashboard.${cat.id}`) || cat.name}
          </button>
        ))}
      </div>

      {/* Tech list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {category.techs.map((techItem) => (
          <TechCard
            key={techItem.id}
            tech={techItem}
            nationTech={tech}
            allTechs={tree.categories.flatMap((c) => c.techs)}
            onResearch={onResearch}
          />
        ))}
      </div>
    </div>
  );
}

function CurrentResearch({ tech, tree }: { tech: NationTechState; tree: TechTree }) {
  const { t } = useTranslation();

  if (!tech.currentResearch) {
    return (
      <div style={{
        padding: "0.5rem",
        backgroundColor: "#111",
        borderRadius: 6,
        border: "1px solid #1a1a1a",
        textAlign: "center",
        color: "#555",
        fontSize: "0.8rem",
      }}>
        {t("tech_panel.no_research")}
      </div>
    );
  }

  const allTechs = tree.categories.flatMap((c) => c.techs);
  const current = allTechs.find((techItem) => techItem.id === tech.currentResearch);
  if (!current) return null;

  const progress = Math.min(100, (tech.researchProgress / current.cost) * 100);
  const turnsLeft = Math.ceil((current.cost - tech.researchProgress) / tech.researchPerTurn);

  return (
    <div style={{
      padding: "0.5rem",
      backgroundColor: "#111",
      borderRadius: 6,
      border: "1px solid #2563eb44",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "#60a5fa" }}>
          {t(`tech_tree.${current.id}.name`) || current.name}
        </span>
        <span style={{ color: "#666", fontSize: "0.72rem" }}>
          {t("tech_panel.turns_left", { count: turnsLeft })}
        </span>
      </div>
      <div style={{ height: 5, backgroundColor: "#1a1a1a", borderRadius: 3 }}>
        <div style={{
          height: "100%",
          width: `${progress}%`,
          backgroundColor: "#2563eb",
          borderRadius: 3,
          transition: "width 0.3s",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.2rem", fontSize: "0.7rem", color: "#555" }}>
        <span>{tech.researchProgress.toFixed(0)} / {current.cost}</span>
        <span>{t("tech_panel.per_turn", { amount: tech.researchPerTurn })}</span>
      </div>
    </div>
  );
}

function TechCard({
  tech,
  nationTech,
  allTechs,
  onResearch,
}: {
  tech: Technology;
  nationTech: NationTechState;
  allTechs: Technology[];
  onResearch?: (techId: string) => void;
}) {
  const { t } = useTranslation();
  const isResearched = nationTech.researched.includes(tech.id);
  const isCurrent = nationTech.currentResearch === tech.id;
  const prereqsMet = tech.prerequisites.every((p) => nationTech.researched.includes(p));
  const isAvailable = !isResearched && !isCurrent && prereqsMet;

  const borderColor = isResearched ? "#4ade8044" : isCurrent ? "#2563eb66" : isAvailable ? "#33333366" : "#1a1a1a";
  const bgColor = isResearched ? "#0a1a0f" : isCurrent ? "#0f1528" : "#0f0f0f";

  return (
    <div
      style={{
        padding: "0.5rem",
        backgroundColor: bgColor,
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        opacity: isResearched || isAvailable || isCurrent ? 1 : 0.5,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{
            fontWeight: 600,
            fontSize: "0.8rem",
            color: isResearched ? "#4ade80" : isCurrent ? "#60a5fa" : "#ccc",
          }}>
            {isResearched ? "\u2713 " : ""}{t(`tech_tree.${tech.id}.name`) || tech.name}
          </span>
          <span style={{ color: "#444", fontSize: "0.7rem", marginLeft: "0.4rem" }}>
            T{tech.tier}
          </span>
        </div>
        {isAvailable && onResearch && (
          <button
            onClick={() => onResearch(tech.id)}
            style={{
              padding: "0.2rem 0.5rem",
              backgroundColor: "#2563eb",
              border: "none",
              borderRadius: 3,
              color: "white",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("tech_panel.research")}
          </button>
        )}
        {isCurrent && (
          <span style={{ color: "#2563eb", fontSize: "0.7rem", fontWeight: 600 }}>
            {t("tech_panel.in_progress")}
          </span>
        )}
      </div>
      <div style={{ color: "#666", fontSize: "0.72rem", marginTop: "0.2rem" }}>
        {t(`tech_tree.${tech.id}.desc`) || tech.description}
      </div>
      {tech.effects.length > 0 && (
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
          {tech.effects.map((effect, i) => (
            <EffectBadge key={i} effect={effect} />
          ))}
        </div>
      )}
      {tech.prerequisites.length > 0 && !prereqsMet && (
        <div style={{ color: "#f8717188", fontSize: "0.68rem", marginTop: "0.2rem" }}>
          {t("tech_panel.requires")}: {tech.prerequisites.map((p) => allTechs.find((techItem) => techItem.id === p)?.name ?? p).join(", ")}
        </div>
      )}
    </div>
  );
}

function EffectBadge({ effect }: { effect: Technology["effects"][0] }) {
  const { t } = useTranslation();
  let label = "";
  let color = "#888";

  switch (effect.type) {
    case "military_bonus":
      label = `${effect.stat} +${(effect.value * 100).toFixed(0)}%`;
      color = "#f87171";
      break;
    case "economy_bonus":
      label = `${effect.stat} ${effect.value > 0 ? "+" : ""}${effect.value < 1 && effect.value > -1 ? (effect.value * 100).toFixed(0) + "%" : effect.value}`;
      color = "#fbbf24";
      break;
    case "diplomacy_bonus":
      label = `${effect.stat} ${effect.value > 0 ? "+" : ""}${effect.value}`;
      color = "#60a5fa";
      break;
    case "population_bonus":
      label = `${effect.stat} +${effect.value < 1 ? (effect.value * 100).toFixed(1) + "%" : effect.value}`;
      color = "#4ade80";
      break;
    case "unlock_building":
      label = `${t("tech_panel.unlock")}: ${effect.building}`;
      color = "#a78bfa";
      break;
    case "unlock_unit":
      label = `${t("tech_panel.unlock")}: ${effect.unit}`;
      color = "#e879f9";
      break;
  }

  return (
    <span style={{
      display: "inline-block",
      padding: "1px 5px",
      borderRadius: 3,
      backgroundColor: `${color}15`,
      border: `1px solid ${color}33`,
      color,
      fontSize: "0.65rem",
      fontWeight: 600,
    }}>
      {label}
    </span>
  );
}
