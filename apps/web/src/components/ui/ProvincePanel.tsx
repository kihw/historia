"use client";

import type { Province, Nation } from "@historia/shared";
import { useTranslation } from "@/i18n";

interface ProvincePanelProps {
  province: Province;
  owner: Nation | undefined;
}

const RESOURCE_COLORS: Record<string, string> = {
  grain: "#d4a017",
  wine: "#8b2252",
  iron: "#8a8a8a",
  gold: "#ffd700",
  coal: "#666",
  oil: "#444",
  cotton: "#ddd",
  spices: "#ff6347",
  silk: "#dda0dd",
  fish: "#4682b4",
  wood: "#8b5513",
  copper: "#b87333",
  salt: "#ccc",
};

export function ProvincePanel({ province, owner }: ProvincePanelProps) {
  const { t } = useTranslation();

  return (
    <div style={{ padding: "1rem" }}>
      {/* Header with nation color bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: "0.8rem" }}>
        <div
          style={{
            width: 4,
            borderRadius: 2,
            backgroundColor: owner?.color ?? "#555",
            flexShrink: 0,
          }}
        />
        <div>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
            {province.displayName}
          </h3>
          <div style={{ color: owner?.color ?? "#888", fontSize: "0.82rem", marginTop: 2 }}>
            {owner?.name ?? province.owner}
          </div>
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: "flex", gap: 4, marginBottom: "0.8rem", flexWrap: "wrap" }}>
        <Badge label={province.terrain} />
        {province.isCoastal && <Badge label={t("province_panel.coastal")} color="#38bdf8" />}
        {province.isCapital && <Badge label={t("province_panel.capital")} color="#fbbf24" />}
        {province.hasPort && <Badge label="Port" color="#38bdf8" />}
        {province.fortLevel > 0 && <Badge label={`Fort ${province.fortLevel}`} color="#888" />}
      </div>

      {/* Stats with progress bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: "0.8rem" }}>
        <StatBar label={t("province_panel.tax")} value={province.baseTax} max={8} color="#fbbf24" />
        <StatBar label={t("province_panel.production")} value={province.baseProduction} max={8} color="#60a5fa" />
        <StatBar label={t("province_panel.manpower")} value={province.baseManpower} max={10} color="#4ade80" />
      </div>

      {/* Resources */}
      {province.resources.length > 0 && (
        <div style={{ marginBottom: "0.6rem" }}>
          <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("province_panel.resources")}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {province.resources.map((r) => (
              <span
                key={r}
                style={{
                  fontSize: "0.72rem",
                  padding: "2px 7px",
                  borderRadius: 4,
                  backgroundColor: `${RESOURCE_COLORS[r] ?? "#555"}15`,
                  color: RESOURCE_COLORS[r] ?? "#888",
                  border: `1px solid ${RESOURCE_COLORS[r] ?? "#555"}25`,
                  textTransform: "capitalize",
                }}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Buildings */}
      {province.buildings.length > 0 && (
        <div>
          <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("province_panel.buildings")}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {province.buildings.map((b) => (
              <span
                key={b}
                style={{
                  fontSize: "0.72rem",
                  padding: "2px 7px",
                  borderRadius: 4,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: "#aaa",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <span
      style={{
        fontSize: "0.68rem",
        padding: "2px 7px",
        borderRadius: 4,
        backgroundColor: color ? `${color}15` : "rgba(255,255,255,0.05)",
        color: color ?? "#888",
        border: `1px solid ${color ? `${color}28` : "rgba(255,255,255,0.08)"}`,
        textTransform: "capitalize",
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  );
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
      <span style={{ color: "#666", width: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, backgroundColor: "#1a1a1a", borderRadius: 2 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            backgroundColor: color,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ fontWeight: 700, color: "#ccc", width: 20, textAlign: "right" }}>{value}</span>
    </div>
  );
}
