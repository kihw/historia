"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ensureLLMConfigured } from "@/lib/llm-config";
import { useTranslation } from "@/i18n";
import type { CountryIndexEntry, CountryEraInfo } from "@historia/shared";

const ERA_COLORS: Record<string, string> = {
  medieval: "#a855f7",
  early_modern: "#2563eb",
  modern: "#dc2626",
  contemporary: "#16a34a",
  custom: "#6b7280",
};

const ERA_LABELS: Record<string, string> = {
  medieval: "Medieval",
  early_modern: "Early Modern",
  modern: "Modern",
  contemporary: "Contemporary",
  custom: "Custom",
};

const REGION_LABELS: Record<string, string> = {
  europe: "Europe",
  middle_east: "Middle East",
  africa: "Africa",
  central_asia: "Central Asia",
  east_asia: "East Asia",
  south_asia: "South Asia",
  southeast_asia: "Southeast Asia",
  americas: "Americas",
  oceania: "Oceania",
  other: "Other",
};

interface SavedGame {
  id: string;
  turn: number;
  date: { year: number; month: number };
  nations: string[];
  scenarioId: string;
}

type LobbyStep = "countries" | "era" | "join";

export default function LobbyPage() {
  const [countries, setCountries] = useState<CountryIndexEntry[]>([]);
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [eraFilter, setEraFilter] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryIndexEntry | null>(null);
  const [step, setStep] = useState<LobbyStep>("countries");
  const [playerName, setPlayerName] = useState("");
  const [joinGameId, setJoinGameId] = useState("");
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    api.listCountries()
      .then(({ countries: c }) => setCountries(c))
      .catch(() => {});
    api.listGames()
      .then(({ games }) => setSavedGames(games))
      .catch(() => {});
    ensureLLMConfigured()
      .then((configured) => setLlmConfigured(configured))
      .catch(() => setLlmConfigured(false));

    const saved = localStorage.getItem("historia_player_name");
    if (saved) setPlayerName(saved);
  }, []);

  const savePlayerName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem("historia_player_name", name);
  };

  // Filtered countries
  const filteredCountries = useMemo(() => {
    let result = countries;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.tag.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      );
    }
    if (regionFilter) {
      result = result.filter((c) => c.region === regionFilter);
    }
    if (eraFilter) {
      result = result.filter((c) => c.eras.some((e) => e.era === eraFilter));
    }
    return result;
  }, [countries, search, regionFilter, eraFilter]);

  // Available regions and eras from data
  const availableRegions = useMemo(() => {
    const set = new Set(countries.map((c) => c.region));
    return Array.from(set).sort();
  }, [countries]);

  const availableEras = useMemo(() => {
    const set = new Set(countries.flatMap((c) => c.eras.map((e) => e.era)));
    return Array.from(set).sort();
  }, [countries]);

  const handleSelectCountry = (country: CountryIndexEntry) => {
    setSelectedCountry(country);
    setStep("era");
  };

  const handleStartGame = async (era: CountryEraInfo, multiplayer: boolean) => {
    if (!selectedCountry) return;
    setLoading(true);
    setError(null);

    try {
      const { gameId } = await api.createGame(era.scenarioId, selectedCountry.id);
      if (multiplayer) {
        router.push(`/game/${gameId}?mp=1&name=${encodeURIComponent(playerName || "Player")}&nation=${selectedCountry.id}`);
      } else {
        router.push(`/game/${gameId}?nation=${selectedCountry.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lobby.create_failed"));
      setLoading(false);
    }
  };

  const handleJoinGame = () => {
    if (!joinGameId.trim()) return;
    const name = playerName || "Player";
    router.push(`/game/${joinGameId.trim()}?mp=1&name=${encodeURIComponent(name)}`);
  };

  const handleBack = () => {
    if (step === "era") {
      setSelectedCountry(null);
      setStep("countries");
    } else if (step === "join") {
      setStep("countries");
      setJoinGameId("");
    }
  };

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "2rem",
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.04) 0%, transparent 50%), #0a0a0a",
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.3rem", fontWeight: 700 }}>
        {t("lobby.title")}
      </h1>
      <p style={{ color: "#555", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        {step === "countries" ? t("lobby.choose_country") : step === "era" ? t("lobby.choose_era") : t("lobby.subtitle")}
      </p>

      {/* LLM warning */}
      {llmConfigured === false && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "1rem 1.2rem",
            backgroundColor: "rgba(37,99,235,0.06)",
            border: "1px solid rgba(37,99,235,0.2)",
            borderRadius: "10px",
            maxWidth: "900px",
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: "#60a5fa", fontSize: "0.9rem", marginBottom: "0.3rem" }}>
              {t("lobby.llm_required")}
            </div>
            <div style={{ color: "#888", fontSize: "0.82rem" }}>
              {t("lobby.llm_required_desc")}
            </div>
          </div>
          <button
            onClick={() => router.push("/settings")}
            style={{
              padding: "0.5rem 1.2rem",
              backgroundColor: "#2563eb",
              border: "none",
              borderRadius: "8px",
              color: "white",
              fontWeight: 600,
              fontSize: "0.82rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t("common.configure")}
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.8rem 1.2rem",
            backgroundColor: "rgba(127,29,29,0.15)",
            border: "1px solid rgba(127,29,29,0.4)",
            borderRadius: "8px",
            color: "#fca5a5",
            fontSize: "0.9rem",
            maxWidth: "900px",
            width: "100%",
          }}
        >
          {error}
        </div>
      )}

      {/* Navigation */}
      {step !== "countries" && (
        <div style={{ maxWidth: "900px", width: "100%", marginBottom: "1rem" }}>
          <button
            onClick={handleBack}
            style={{
              padding: "0.4rem 0.8rem",
              backgroundColor: "transparent",
              border: "1px solid #2a2a2a",
              borderRadius: "6px",
              color: "#888",
              fontSize: "0.82rem",
              cursor: "pointer",
            }}
          >
            &larr; {t("common.back")}
          </button>
        </div>
      )}

      {/* Step 1: Country Selection */}
      {step === "countries" && (
        <div style={{ maxWidth: "900px", width: "100%" }}>
          {/* Player name + join */}
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.8rem 1rem",
              backgroundColor: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: "10px",
              display: "flex",
              gap: "0.8rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label style={{ fontSize: "0.82rem", color: "#888", whiteSpace: "nowrap" }}>
              {t("lobby.player_name")}
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => savePlayerName(e.target.value)}
              placeholder={t("lobby.player_name_placeholder")}
              style={{
                flex: 1,
                minWidth: 140,
                padding: "0.4rem 0.8rem",
                backgroundColor: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: "6px",
                color: "#e0e0e0",
                fontSize: "0.85rem",
                outline: "none",
              }}
            />
            <div style={{ borderLeft: "1px solid #2a2a2a", height: 24 }} />
            <button
              onClick={() => setStep("join")}
              style={{
                padding: "0.4rem 0.9rem",
                backgroundColor: "rgba(37,99,235,0.08)",
                border: "1px solid rgba(37,99,235,0.2)",
                borderRadius: "6px",
                color: "#60a5fa",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t("lobby.join_game")}
            </button>
          </div>

          {/* Saved Games */}
          {savedGames.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <SectionHeader title={t("lobby.continue_game")} />
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {savedGames.map((game) => (
                  <div key={game.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button
                      onClick={() => router.push(`/game/${game.id}`)}
                      style={{
                        flex: 1,
                        padding: "0.7rem 1rem",
                        backgroundColor: "#111",
                        border: "1px solid #1e1e1e",
                        borderRadius: "8px",
                        color: "#e0e0e0",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#333"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                          {game.nations.slice(0, 3).join(", ")}
                          {game.nations.length > 3 ? ` +${game.nations.length - 3}` : ""}
                        </div>
                        <div style={{ color: "#555", fontSize: "0.75rem", marginTop: "0.2rem" }}>
                          {game.scenarioId} &middot; {game.id.substring(0, 8)}
                        </div>
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "#888" }}>
                        <span>{t("lobby.turn", { turn: game.turn })}</span>
                        <span style={{ marginLeft: "0.8rem" }}>
                          {game.date.year}-{String(game.date.month).padStart(2, "0")}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(t("lobby.delete_confirm"))) return;
                        try {
                          await api.deleteGame(game.id);
                          setSavedGames((prev) => prev.filter((g) => g.id !== game.id));
                        } catch {
                          setError(t("lobby.delete_failed"));
                        }
                      }}
                      title={t("lobby.delete_game")}
                      style={{
                        padding: "0.4rem 0.5rem",
                        backgroundColor: "#111",
                        border: "1px solid #1e1e1e",
                        borderRadius: "6px",
                        color: "#666",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#666"; }}
                    >
                      &#x2715;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search + Filters */}
          <SectionHeader title={t("lobby.new_game")} />
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("lobby.search_countries")}
              style={{
                flex: 1,
                minWidth: 200,
                padding: "0.45rem 0.8rem",
                backgroundColor: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: "6px",
                color: "#e0e0e0",
                fontSize: "0.85rem",
                outline: "none",
              }}
            />
            {/* Region filter chips */}
            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
              {availableRegions.map((r) => (
                <button
                  key={r}
                  onClick={() => setRegionFilter(regionFilter === r ? null : r)}
                  style={{
                    padding: "0.3rem 0.6rem",
                    backgroundColor: regionFilter === r ? "rgba(37,99,235,0.15)" : "#1a1a1a",
                    border: `1px solid ${regionFilter === r ? "#2563eb" : "#2a2a2a"}`,
                    borderRadius: "4px",
                    color: regionFilter === r ? "#60a5fa" : "#888",
                    fontSize: "0.72rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {REGION_LABELS[r] ?? r}
                </button>
              ))}
            </div>
            {/* Era filter chips */}
            <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
              {availableEras.map((e) => (
                <button
                  key={e}
                  onClick={() => setEraFilter(eraFilter === e ? null : e)}
                  style={{
                    padding: "0.3rem 0.6rem",
                    backgroundColor: eraFilter === e ? `${ERA_COLORS[e] ?? "#555"}20` : "#1a1a1a",
                    border: `1px solid ${eraFilter === e ? (ERA_COLORS[e] ?? "#555") : "#2a2a2a"}`,
                    borderRadius: "4px",
                    color: eraFilter === e ? (ERA_COLORS[e] ?? "#888") : "#888",
                    fontSize: "0.72rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {ERA_LABELS[e] ?? e}
                </button>
              ))}
            </div>
          </div>

          {/* Country Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "0.6rem",
            }}
          >
            {filteredCountries.map((country) => (
              <button
                key={country.id}
                onClick={() => handleSelectCountry(country)}
                style={{
                  padding: "0.9rem 1rem",
                  backgroundColor: "#111",
                  border: "1px solid #1e1e1e",
                  borderLeft: `3px solid ${country.color}`,
                  borderRadius: "8px",
                  color: "#e0e0e0",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#333";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#1e1e1e";
                  e.currentTarget.style.borderLeftColor = country.color;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{country.name}</span>
                  <span style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600 }}>{country.tag}</span>
                </div>
                <div style={{ color: "#666", fontSize: "0.75rem", marginTop: "0.3rem" }}>
                  {country.government} &middot; {REGION_LABELS[country.region] ?? country.region}
                </div>
                <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.4rem" }}>
                  {country.eras.map((era) => (
                    <span
                      key={era.scenarioId}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: ERA_COLORS[era.era] ?? "#555",
                      }}
                      title={`${era.scenarioName} (${era.startYear})`}
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>

          {filteredCountries.length === 0 && countries.length > 0 && (
            <div style={{ textAlign: "center", color: "#555", padding: "2rem", fontSize: "0.9rem" }}>
              {t("lobby.no_results")}
            </div>
          )}

          {countries.length === 0 && (
            <div style={{ textAlign: "center", color: "#555", padding: "2rem", fontSize: "0.9rem" }}>
              {t("common.loading")}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Era Selection */}
      {step === "era" && selectedCountry && (
        <div style={{ maxWidth: "700px", width: "100%" }}>
          {/* Country header */}
          <div
            style={{
              padding: "1.2rem 1.5rem",
              backgroundColor: "#111",
              border: "1px solid #1e1e1e",
              borderLeft: `4px solid ${selectedCountry.color}`,
              borderRadius: "10px",
              marginBottom: "1.5rem",
            }}
          >
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0, marginBottom: "0.3rem" }}>
              {selectedCountry.name}
            </h2>
            <div style={{ color: "#666", fontSize: "0.85rem" }}>
              {selectedCountry.tag} &middot; {selectedCountry.government} &middot; {REGION_LABELS[selectedCountry.region] ?? selectedCountry.region}
              {selectedCountry.capitalName && <> &middot; {selectedCountry.capitalName}</>}
            </div>
          </div>

          {/* Era cards */}
          <SectionHeader title={t("lobby.select_era")} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            {selectedCountry.eras.map((era) => {
              const eraColor = ERA_COLORS[era.era] ?? "#555";
              return (
                <div
                  key={era.scenarioId}
                  style={{
                    padding: "1.1rem 1.3rem",
                    backgroundColor: "#111",
                    border: "1px solid #1e1e1e",
                    borderTop: `2px solid ${eraColor}`,
                    borderRadius: "10px",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#333";
                    e.currentTarget.style.borderTopColor = eraColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#1e1e1e";
                    e.currentTarget.style.borderTopColor = eraColor;
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "1rem" }}>{era.scenarioName}</span>
                    <span
                      style={{
                        color: eraColor,
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        backgroundColor: `${eraColor}15`,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {era.startYear}
                    </span>
                  </div>
                  <div style={{ color: "#666", fontSize: "0.82rem", marginBottom: "0.8rem" }}>
                    {era.provinceCount} {t("lobby.provinces")} &middot; {ERA_LABELS[era.era] ?? era.era}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      disabled={loading}
                      onClick={() => handleStartGame(era, false)}
                      style={{
                        flex: 1,
                        padding: "0.5rem 0.8rem",
                        backgroundColor: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        borderRadius: "6px",
                        color: "#ccc",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.5 : 1,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) e.currentTarget.style.borderColor = "#444";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#2a2a2a";
                      }}
                    >
                      {loading ? t("common.creating") : t("common.solo")}
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => handleStartGame(era, true)}
                      style={{
                        flex: 1,
                        padding: "0.5rem 0.8rem",
                        backgroundColor: "rgba(37,99,235,0.08)",
                        border: "1px solid rgba(37,99,235,0.2)",
                        borderRadius: "6px",
                        color: "#60a5fa",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.5 : 1,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "rgba(37,99,235,0.15)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(37,99,235,0.08)";
                      }}
                    >
                      {t("common.multiplayer")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Join Game */}
      {step === "join" && (
        <div style={{ maxWidth: "500px", width: "100%" }}>
          <div
            style={{
              padding: "1.5rem",
              backgroundColor: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: "10px",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", color: "#e0e0e0" }}>
              {t("lobby.join_game")}
            </h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={joinGameId}
                onChange={(e) => setJoinGameId(e.target.value)}
                placeholder={t("lobby.game_id_placeholder")}
                onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
                style={{
                  flex: 1,
                  padding: "0.5rem 0.8rem",
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #2a2a2a",
                  borderRadius: "6px",
                  color: "#e0e0e0",
                  fontSize: "0.85rem",
                  outline: "none",
                }}
              />
              <button
                onClick={handleJoinGame}
                disabled={!joinGameId.trim()}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#2563eb",
                  border: "none",
                  borderRadius: "6px",
                  color: "white",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: !joinGameId.trim() ? "not-allowed" : "pointer",
                  opacity: !joinGameId.trim() ? 0.4 : 1,
                }}
              >
                {t("common.join")}
              </button>
            </div>
          </div>
        </div>
      )}

      <a
        href="/"
        style={{
          marginTop: "2rem",
          color: "#444",
          textDecoration: "none",
          fontSize: "0.85rem",
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#888"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#444"; }}
      >
        {t("common.back_home")}
      </a>
    </main>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        marginBottom: "0.8rem",
      }}
    >
      <div style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: "#2563eb" }} />
      <h2 style={{ fontSize: "1rem", color: "#aaa", fontWeight: 600, margin: 0 }}>
        {title}
      </h2>
    </div>
  );
}
