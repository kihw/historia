"use client";

import { useTranslation } from "@/i18n";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

const features = [
  { key: "economy", icon: "\u2696", accentColor: "#fbbf24" },
  { key: "diplomacy", icon: "\u2694", accentColor: "#60a5fa" },
  { key: "military", icon: "\u2618", accentColor: "#f87171" },
  { key: "ai_narrative", icon: "\u270E", accentColor: "#a78bfa" },
];

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        background:
          "radial-gradient(ellipse at 50% 25%, rgba(37,99,235,0.07) 0%, transparent 60%), " +
          "radial-gradient(ellipse at 80% 80%, rgba(99,37,235,0.04) 0%, transparent 50%), " +
          "radial-gradient(ellipse at 20% 70%, rgba(37,160,100,0.03) 0%, transparent 40%), " +
          "#0a0a0a",
      }}
    >
      {/* Title with gradient text */}
      <h1
        style={{
          fontSize: "3.2rem",
          fontWeight: 800,
          letterSpacing: "0.12em",
          marginBottom: "0.5rem",
          background: "linear-gradient(135deg, #e0e0e0 0%, #60a5fa 50%, #e0e0e0 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {t("home.title")}
      </h1>
      <p
        style={{
          fontSize: "1.15rem",
          color: "#777",
          marginBottom: "3rem",
          textAlign: "center",
          maxWidth: "600px",
          lineHeight: 1.6,
        }}
      >
        {t("home.subtitle")}
      </p>

      {/* Buttons */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
        <a
          href="/lobby"
          style={{
            padding: "0.9rem 2.5rem",
            backgroundColor: "#2563eb",
            color: "white",
            borderRadius: "10px",
            textDecoration: "none",
            fontSize: "1.1rem",
            fontWeight: 700,
            transition: "all 0.25s ease",
            boxShadow: "0 0 20px rgba(37,99,235,0.15), 0 4px 12px rgba(0,0,0,0.3)",
            border: "1px solid rgba(96,165,250,0.2)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 0 30px rgba(37,99,235,0.3), 0 6px 20px rgba(0,0,0,0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(37,99,235,0.15), 0 4px 12px rgba(0,0,0,0.3)";
          }}
        >
          {t("home.new_game")}
        </a>
        <a
          href="/editor"
          style={{
            padding: "0.9rem 2rem",
            backgroundColor: "transparent",
            color: "#888",
            border: "1px solid #333",
            borderRadius: "10px",
            textDecoration: "none",
            fontSize: "1.05rem",
            fontWeight: 500,
            transition: "all 0.25s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#2563eb";
            e.currentTarget.style.color = "#ccc";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#333";
            e.currentTarget.style.color = "#888";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          {t("home.scenario_editor")}
        </a>
        <a
          href="/settings"
          style={{
            padding: "0.9rem 2rem",
            backgroundColor: "transparent",
            color: "#888",
            border: "1px solid #333",
            borderRadius: "10px",
            textDecoration: "none",
            fontSize: "1.05rem",
            fontWeight: 500,
            transition: "all 0.25s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#2563eb";
            e.currentTarget.style.color = "#ccc";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#333";
            e.currentTarget.style.color = "#888";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          {t("common.settings")}
        </a>
        <LanguageSwitcher />
      </div>

      {/* Feature cards */}
      <div
        style={{
          marginTop: "4rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "1.2rem",
          maxWidth: "880px",
          width: "100%",
        }}
      >
        {features.map((f) => (
          <div
            key={f.key}
            style={{
              padding: "1.5rem",
              backgroundColor: "#111",
              borderRadius: "10px",
              border: "1px solid #1e1e1e",
              borderTop: `2px solid ${f.accentColor}`,
              transition: "all 0.25s ease",
              cursor: "default",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.borderColor = "#333";
              e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "#1e1e1e";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{ fontSize: "1.4rem", marginBottom: "0.6rem" }}>{f.icon}</div>
            <h3 style={{ margin: "0 0 0.4rem", fontSize: "1rem", fontWeight: 600, color: "#e0e0e0" }}>
              {t(`home.features.${f.key}.title`)}
            </h3>
            <p style={{ margin: 0, color: "#666", fontSize: "0.85rem", lineHeight: 1.5 }}>
              {t(`home.features.${f.key}.desc`)}
            </p>
          </div>
        ))}
      </div>

      {/* Footer tagline */}
      <p style={{ marginTop: "3rem", color: "#333", fontSize: "0.75rem", letterSpacing: "0.05em" }}>
        Deterministic simulation + LLM-powered narratives
      </p>
    </main>
  );
}
