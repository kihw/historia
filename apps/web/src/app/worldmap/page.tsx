"use client";

import { useState } from "react";
import { HistoricalWorldMap } from "../../components/map/HistoricalWorldMap";
import type { GeoJSONFeature } from "@historia/shared";
import { useTranslation } from "@/i18n";

export default function WorldMapPage() {
  const { t } = useTranslation();
  const [selectedCountry, setSelectedCountry] = useState<{
    name: string;
    iso?: string;
    sovereignty?: string;
    properties: Record<string, unknown>;
  } | null>(null);

  const handleCountryClick = (feature: GeoJSONFeature) => {
    setSelectedCountry({
      name:
        feature.properties.NAME ||
        feature.properties.ADMIN ||
        "Unknown",
      iso: feature.properties.ISO_A3 as string | undefined,
      sovereignty: (feature.properties.SOVEREIGNT ||
        feature.properties.SUBJECTO) as string | undefined,
      properties: feature.properties,
    });
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#0a0a0a",
        color: "#e0e0e0",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.5rem 1rem",
          backgroundColor: "#0f0f0f",
          borderBottom: "1px solid #1a1a1a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <a
            href="/"
            style={{ color: "#555", textDecoration: "none", fontSize: "0.85rem" }}
          >
            HISTORIA
          </a>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 600 }}>{t("worldmap.title")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <a
            href="/editor"
            style={{
              padding: "0.3rem 0.8rem",
              backgroundColor: "#1a1a2e",
              border: "1px solid #222",
              borderRadius: 4,
              color: "#60a5fa",
              textDecoration: "none",
              fontSize: "0.78rem",
            }}
          >
            {t("home.scenario_editor")}
          </a>
        </div>
      </div>

      {/* Map + Info panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1 }}>
          <HistoricalWorldMap
            initialYear={2010}
            height="100%"
            showTimeline={true}
            onCountryClick={handleCountryClick}
          />
        </div>

        {/* Side panel */}
        {selectedCountry && (
          <div
            style={{
              width: 300,
              borderLeft: "1px solid #1a1a1a",
              backgroundColor: "#0f0f0f",
              padding: "1rem",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                {selectedCountry.name}
              </h3>
              <button
                onClick={() => setSelectedCountry(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#666",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                }}
              >
                x
              </button>
            </div>

            {selectedCountry.iso && (
              <InfoRow label={t("worldmap.iso_a3")} value={selectedCountry.iso} />
            )}
            {selectedCountry.sovereignty && (
              <InfoRow label={t("worldmap.sovereignty")} value={selectedCountry.sovereignty} />
            )}

            <div
              style={{
                marginTop: "1rem",
                fontSize: "0.7rem",
                color: "#555",
                fontWeight: 600,
                textTransform: "uppercase",
                marginBottom: "0.3rem",
              }}
            >
              {t("worldmap.all_properties")}
            </div>
            {Object.entries(selectedCountry.properties)
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([key, val]) => (
                <InfoRow key={key} label={key} value={String(val)} />
              ))}
          </div>
        )}
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        borderBottom: "1px solid #1a1a1a",
        fontSize: "0.8rem",
      }}
    >
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ color: "#ddd", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
