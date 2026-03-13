"use client";

import { useState, useCallback, useRef } from "react";
import { validateScenario } from "@historia/shared";
import type { Nation, Province, CausalGraph, Scenario } from "@historia/shared";
import { NationEditor } from "../../components/editor/NationEditor";
import { MapEditor } from "../../components/editor/MapEditor";
import { EventGraphEditor } from "../../components/editor/EventGraphEditor";
import { HistoricalWorldMap } from "../../components/map/HistoricalWorldMap";
import { generateScenarioFromEra } from "../../lib/scenario-from-history";
import { KEY_ERAS } from "../../lib/historical-data";
import type { GeoJSONFeature } from "@historia/shared";
import { useTranslation } from "@/i18n";

type EditorTab = "overview" | "nations" | "map" | "events" | "narrative" | "worldmap" | "json";

const STARTER_TEMPLATE: Scenario = {
  meta: {
    id: "my-scenario",
    name: "My Custom Scenario",
    version: "1.0.0",
    author: "Player",
    description: "A custom scenario",
    era: "custom",
    startDate: { year: 1444, month: 1 },
    tags: ["custom"],
    difficultySuggestion: "normal",
    recommendedPlayers: { min: 1, max: 4 },
  },
  config: {
    determinism: { simulationIntensity: 0.6, historicalConstraint: 0.3, fantasyFreedom: 0.5 },
    turnDuration: { default: "1_month", options: ["1_month", "3_months", "1_year"] },
    victoryConditions: [{ type: "domination", description: "Control 50% of the map", threshold: 0.5 }],
  },
  map: {
    type: "province",
    projection: "mercator",
    bounds: { north: 55, south: 35, west: -5, east: 25 },
    terrainTypes: ["plains", "hills", "mountains", "forest", "coastal", "desert"],
    provinces: [
      {
        id: "capital_a", name: "Capital A", displayName: "Capital of Nation A", terrain: "plains",
        isCoastal: false, polygon: [[0, 50], [2, 50], [2, 48], [0, 48]], center: [1, 49],
        neighbors: ["province_b"], baseTax: 8, baseProduction: 6, baseManpower: 5,
        hasPort: false, fortLevel: 2, resources: ["grain"], buildings: ["marketplace"],
        isCapital: true, owner: "nation_a", controller: "nation_a",
      },
      {
        id: "province_b", name: "Province B", displayName: "Province B", terrain: "hills",
        isCoastal: true, polygon: [[2, 50], [4, 50], [4, 48], [2, 48]], center: [3, 49],
        neighbors: ["capital_a"], baseTax: 5, baseProduction: 4, baseManpower: 3,
        hasPort: true, fortLevel: 0, resources: ["fish"], buildings: [],
        isCapital: true, owner: "nation_b", controller: "nation_b",
      },
    ],
  },
  nations: [
    {
      id: "nation_a", name: "Nation Alpha", tag: "NAA", color: "#3B5998", government: "feudal_monarchy",
      ruler: { name: "King Alpha", adminSkill: 4, diplomacySkill: 5, militarySkill: 3, age: 35, traits: ["just"] },
      capital: "capital_a", provinces: ["capital_a"],
      economy: { treasury: 200, taxRate: 0.1, inflation: 0.01, tradePower: 40, monthlyIncome: 20, monthlyExpenses: 15 },
      military: {
        armies: [{ id: "army_a", name: "Royal Army", location: "capital_a", units: { infantry: 10000, cavalry: 2000, artillery: 500 }, morale: 0.8, supply: 1.0 }],
        manpower: 20000, maxManpower: 40000, forceLimit: 30000, militaryTechnology: 3,
      },
      diplomacy: { relations: { nation_b: 0 }, alliances: [], rivals: [], truces: {}, royalMarriages: [] },
      population: { total: 5000000, growthRate: 0.004, stability: 60, warExhaustion: 0, culture: "alpha", religion: "pantheon" },
      playable: true,
    },
    {
      id: "nation_b", name: "Nation Beta", tag: "NAB", color: "#C8102E", government: "republic",
      ruler: { name: "Consul Beta", adminSkill: 5, diplomacySkill: 3, militarySkill: 4, age: 42, traits: ["ambitious"] },
      capital: "province_b", provinces: ["province_b"],
      economy: { treasury: 150, taxRate: 0.12, inflation: 0.02, tradePower: 35, monthlyIncome: 18, monthlyExpenses: 12 },
      military: {
        armies: [{ id: "army_b", name: "Republican Guard", location: "province_b", units: { infantry: 8000, cavalry: 1500, artillery: 300 }, morale: 0.75, supply: 1.0 }],
        manpower: 15000, maxManpower: 30000, forceLimit: 25000, militaryTechnology: 3,
      },
      diplomacy: { relations: { nation_a: 0 }, alliances: [], rivals: [], truces: {}, royalMarriages: [] },
      population: { total: 3000000, growthRate: 0.005, stability: 55, warExhaustion: 0, culture: "beta", religion: "pantheon" },
      playable: true,
    },
  ],
  events: { causalGraph: { nodes: [], edges: [] } },
  narrative: {
    introduction: "A new world awaits. Two nations stand ready to write their history.",
    style: "historical_chronicle",
    tone: "formal" as const,
    vocabularyEra: "medieval",
  },
};

interface ValidationError {
  path: string;
  message: string;
}

export default function EditorPage() {
  const { t } = useTranslation();
  const [scenario, setScenario] = useState<Scenario>(STARTER_TEMPLATE);
  const [activeTab, setActiveTab] = useState<EditorTab>("overview");
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [generatingFromEra, setGeneratingFromEra] = useState(false);

  const validate = useCallback((data: Scenario) => {
    try {
      validateScenario(data);
      setErrors([]);
      setIsValid(true);
    } catch (err) {
      if (err instanceof Error) {
        try {
          const zodErrors = JSON.parse(err.message);
          if (Array.isArray(zodErrors)) {
            setErrors(zodErrors.map((e: { path?: string[]; message?: string }) => ({
              path: e.path?.join(".") ?? "root",
              message: e.message ?? "Invalid",
            })));
          } else {
            setErrors([{ path: "validation", message: err.message }]);
          }
        } catch {
          setErrors([{ path: "validation", message: err.message }]);
        }
      }
      setIsValid(false);
    }
  }, []);

  const updateScenario = (patch: Partial<Scenario>) => {
    const next = { ...scenario, ...patch };
    setScenario(next);
    setSaveResult(null);
    validate(next);
  };

  const handleSave = async () => {
    validate(scenario);
    if (errors.length > 0) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/scenarios`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarioId: scenario.meta.id, data: scenario }) }
      );
      if (res.ok) {
        setSaveResult(t("editor.scenario_saved", { id: scenario.meta.id }));
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to save" }));
        setSaveResult(`Error: ${err.error}`);
      }
    } catch (err) {
      setSaveResult(`Error: ${err instanceof Error ? err.message : "Failed to save"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scenario.meta.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        setScenario(data);
        validate(data);
      } catch {
        setSaveResult("Error: Invalid JSON file");
      }
    };
    input.click();
  };

  const handleLoadTemplate = async (scenarioId: string) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/scenarios/${scenarioId}`
      );
      if (res.ok) {
        const data = await res.json();
        setScenario(data.scenario);
        validate(data.scenario);
      }
    } catch { /* keep current */ }
  };

  const handleGenerateFromEra = async (year: number) => {
    setGeneratingFromEra(true);
    setSaveResult(null);
    try {
      const generated = await generateScenarioFromEra(year);
      setScenario(generated);
      validate(generated);
      setSaveResult(t("editor.generated_from", { year: year < 0 ? Math.abs(year) + " BC" : year + " AD", nations: generated.nations.length, provinces: generated.map.provinces.length }));
    } catch (err) {
      setSaveResult(`Error: ${err instanceof Error ? err.message : "Failed to generate"}`);
    } finally {
      setGeneratingFromEra(false);
    }
  };

  const switchToJson = () => {
    setJsonText(JSON.stringify(scenario, null, 2));
    setActiveTab("json");
  };

  const applyJson = () => {
    try {
      const data = JSON.parse(jsonText);
      setScenario(data);
      validate(data);
      setSaveResult(t("editor.json_applied"));
    } catch (e) {
      setSaveResult(`JSON error: ${e instanceof Error ? e.message : "Invalid JSON"}`);
    }
  };

  const TABS: { id: EditorTab; label: string }[] = [
    { id: "overview", label: t("editor.overview") },
    { id: "nations", label: t("common.nations") },
    { id: "map", label: t("editor.map") },
    { id: "worldmap", label: t("editor.world_map") },
    { id: "events", label: t("editor.events") },
    { id: "narrative", label: t("editor.narrative") },
    { id: "json", label: t("editor.json") },
  ];

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0a0a0a", color: "#e0e0e0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 1rem", backgroundColor: "#0f0f0f", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <a href="/" style={{ color: "#555", textDecoration: "none", fontSize: "0.85rem" }}>HISTORIA</a>
          <span style={{ color: "#333" }}>/</span>
          <span style={{ fontWeight: 600 }}>{t("editor.title")}</span>
          <span style={{ color: "#444", fontSize: "0.75rem" }}>{scenario.meta.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {isValid !== null && (
            <span style={{
              fontSize: "0.75rem", padding: "2px 8px", borderRadius: 4,
              backgroundColor: isValid ? "#16653422" : "#7f1d1d22",
              color: isValid ? "#4ade80" : "#f87171",
              border: `1px solid ${isValid ? "#16653444" : "#7f1d1d44"}`,
            }}>
              {isValid ? t("common.valid") : t("editor.errors_count", { count: errors.length })}
            </span>
          )}
          {saveResult && (
            <span style={{ fontSize: "0.72rem", color: saveResult.startsWith("Error") ? "#f87171" : "#4ade80" }}>
              {saveResult}
            </span>
          )}
          <button onClick={handleImportJSON} style={headerBtnStyle}>{t("common.import")}</button>
          <button onClick={handleExportJSON} style={headerBtnStyle}>{t("common.export")}</button>
          <button onClick={handleSave} disabled={saving} style={{ ...headerBtnStyle, backgroundColor: "#2563eb", color: "white", fontWeight: 600 }}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>

      {/* Template bar */}
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.3rem 1rem", backgroundColor: "#111", borderBottom: "1px solid #1a1a1a", fontSize: "0.72rem", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "#555" }}>{t("common.templates")}:</span>
        {["europe-1444", "ww2-1939", "cold-war-1962"].map((id) => (
          <button key={id} onClick={() => handleLoadTemplate(id)} style={templateBtnStyle}>{id}</button>
        ))}
        <span style={{ color: "#333", margin: "0 4px" }}>|</span>
        <span style={{ color: "#555" }}>{t("editor.generate_from_history")}:</span>
        {[
          { year: 1400, label: "1400" },
          { year: 1492, label: "1492" },
          { year: 1650, label: "1650" },
          { year: 1815, label: "1815" },
          { year: 1914, label: "1914" },
          { year: 1945, label: "1945" },
          { year: 2010, label: "2010" },
        ].map((e) => (
          <button
            key={e.year}
            onClick={() => handleGenerateFromEra(e.year)}
            disabled={generatingFromEra}
            style={{ ...templateBtnStyle, color: "#fbbf24" }}
          >
            {e.label}
          </button>
        ))}
        {generatingFromEra && <span style={{ color: "#fbbf24" }}>{t("common.loading")}</span>}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", backgroundColor: "#0a0a0a" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.id === "json" ? switchToJson() : setActiveTab(tab.id)}
            style={{
              padding: "0.5rem 1.2rem",
              backgroundColor: activeTab === tab.id ? "#1a1a2e" : "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #60a5fa" : "2px solid transparent",
              color: activeTab === tab.id ? "#60a5fa" : "#666",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 600,
            }}
          >
            {tab.label}
            {tab.id === "nations" && <span style={{ color: "#444", fontWeight: 400, marginLeft: 4 }}>({scenario.nations.length})</span>}
            {tab.id === "map" && <span style={{ color: "#444", fontWeight: 400, marginLeft: 4 }}>({scenario.map.provinces.length})</span>}
            {tab.id === "events" && <span style={{ color: "#444", fontWeight: 400, marginLeft: 4 }}>({scenario.events.causalGraph.nodes.length})</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "overview" && (
          <OverviewTab scenario={scenario} onChange={updateScenario} errors={errors} />
        )}

        {activeTab === "nations" && (
          <NationEditor
            nations={scenario.nations}
            onChange={(nations) => updateScenario({ nations })}
            provinces={scenario.map.provinces.map((p) => ({ id: p.id, name: p.name }))}
          />
        )}

        {activeTab === "map" && (
          <MapEditor
            provinces={scenario.map.provinces}
            onChange={(provinces) => updateScenario({ map: { ...scenario.map, provinces } })}
            nations={scenario.nations.map((n) => ({ id: n.id, name: n.name, color: n.color }))}
            mapBounds={scenario.map.bounds}
          />
        )}

        {activeTab === "events" && (
          <EventGraphEditor
            graph={scenario.events.causalGraph}
            onChange={(causalGraph) => updateScenario({ events: { causalGraph } })}
            nations={scenario.nations.map((n) => ({ id: n.id, name: n.name }))}
            provinces={scenario.map.provinces.map((p) => ({ id: p.id, name: p.name }))}
          />
        )}

        {activeTab === "worldmap" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "6px 16px", borderBottom: "1px solid #1a1a1a", fontSize: "0.72rem", color: "#666", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>{t("editor.worldmap_desc")}</span>
              <span style={{ color: "#444" }}>Source: aourednik/historical-basemaps + Natural Earth</span>
            </div>
            <div style={{ flex: 1 }}>
              <HistoricalWorldMap
                initialYear={scenario.meta.startDate.year}
                height="100%"
                showTimeline={true}
                onCountryClick={(feature: GeoJSONFeature) => {
                  const name = feature.properties.NAME || feature.properties.ADMIN || "Unknown";
                  alert(`${t("editor.country")}: ${name}\nISO: ${feature.properties.ISO_A3 || "N/A"}\n${t("editor.sovereignty")}: ${feature.properties.SOVEREIGNT || feature.properties.SUBJECTO || "N/A"}`);
                }}
                overlayProvinces={scenario.map.provinces.map((p) => ({
                  polygon: p.polygon,
                  color: scenario.nations.find((n) => n.id === p.owner)?.color || "#888",
                  name: p.displayName,
                }))}
              />
            </div>
          </div>
        )}

        {activeTab === "narrative" && (
          <NarrativeTab scenario={scenario} onChange={updateScenario} />
        )}

        {activeTab === "json" && (
          <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
            <div style={{ padding: "0.3rem 0.5rem", borderBottom: "1px solid #1a1a1a", display: "flex", gap: "0.5rem" }}>
              <button onClick={applyJson} style={{ ...headerBtnStyle, backgroundColor: "#2563eb", color: "white" }}>{t("editor.apply_json")}</button>
              <button onClick={() => setJsonText(JSON.stringify(scenario, null, 2))} style={headerBtnStyle}>{t("editor.refresh_state")}</button>
            </div>
            <textarea
              ref={textareaRef}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, padding: "0.5rem", backgroundColor: "#0a0a0a", border: "none", color: "#e0e0e0",
                fontSize: "0.78rem", fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                lineHeight: "1.5", resize: "none", outline: "none", tabSize: 2,
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}

/* ---- Overview Tab ---- */
function OverviewTab({ scenario, onChange, errors }: { scenario: Scenario; onChange: (patch: Partial<Scenario>) => void; errors: ValidationError[] }) {
  const { t } = useTranslation();
  const meta = scenario.meta;
  const config = scenario.config;

  return (
    <div style={{ padding: "1rem 1.5rem", overflowY: "auto", height: "100%", maxWidth: 900 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Meta */}
        <SectionBox title={t("editor.scenario_metadata")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <OvField label={t("editor.id")} value={meta.id} onChange={(v) => onChange({ meta: { ...meta, id: v } })} />
            <OvField label={t("editor.name")} value={meta.name} onChange={(v) => onChange({ meta: { ...meta, name: v } })} />
            <OvField label={t("editor.author")} value={meta.author} onChange={(v) => onChange({ meta: { ...meta, author: v } })} />
            <OvField label={t("editor.version")} value={meta.version} onChange={(v) => onChange({ meta: { ...meta, version: v } })} />
            <div>
              <label style={ovLabel}>{t("editor.era")}</label>
              <select value={meta.era} onChange={(e) => onChange({ meta: { ...meta, era: e.target.value as typeof meta.era } })} style={ovSelect}>
                {["ancient", "medieval", "early_modern", "industrial", "modern", "contemporary", "fantasy", "custom"].map((e) => (
                  <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={ovLabel}>{t("editor.difficulty")}</label>
              <select value={meta.difficultySuggestion} onChange={(e) => onChange({ meta: { ...meta, difficultySuggestion: e.target.value as typeof meta.difficultySuggestion } })} style={ovSelect}>
                {["easy", "normal", "hard", "extreme"].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.5rem", marginTop: "0.5rem" }}>
            <OvNum label={t("editor.start_year")} value={meta.startDate.year} onChange={(v) => onChange({ meta: { ...meta, startDate: { ...meta.startDate, year: v } } })} />
            <OvNum label={t("editor.start_month")} value={meta.startDate.month} onChange={(v) => onChange({ meta: { ...meta, startDate: { ...meta.startDate, month: v } } })} min={1} max={12} />
            <OvNum label={t("editor.min_players")} value={meta.recommendedPlayers.min} onChange={(v) => onChange({ meta: { ...meta, recommendedPlayers: { ...meta.recommendedPlayers, min: v } } })} min={1} />
            <OvNum label={t("editor.max_players")} value={meta.recommendedPlayers.max} onChange={(v) => onChange({ meta: { ...meta, recommendedPlayers: { ...meta.recommendedPlayers, max: v } } })} min={1} />
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <label style={ovLabel}>{t("editor.description")}</label>
            <textarea value={meta.description} onChange={(e) => onChange({ meta: { ...meta, description: e.target.value } })} rows={2} style={{ ...ovInput, resize: "vertical" }} />
          </div>
          <div style={{ marginTop: "0.3rem" }}>
            <label style={ovLabel}>{t("editor.tags")}</label>
            <input value={meta.tags.join(", ")} onChange={(e) => onChange({ meta: { ...meta, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } })} style={ovInput} />
          </div>
        </SectionBox>

        {/* Determinism */}
        <SectionBox title={t("editor.determinism_config")}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <SliderField label={t("editor.simulation_intensity")} value={config.determinism.simulationIntensity} color="#60a5fa" desc={t("editor.simulation_intensity_desc")}
              onChange={(v) => onChange({ config: { ...config, determinism: { ...config.determinism, simulationIntensity: v } } })} />
            <SliderField label={t("editor.historical_constraint")} value={config.determinism.historicalConstraint} color="#fbbf24" desc={t("editor.historical_constraint_desc")}
              onChange={(v) => onChange({ config: { ...config, determinism: { ...config.determinism, historicalConstraint: v } } })} />
            <SliderField label={t("editor.fantasy_freedom")} value={config.determinism.fantasyFreedom} color="#a78bfa" desc={t("editor.fantasy_freedom_desc")}
              onChange={(v) => onChange({ config: { ...config, determinism: { ...config.determinism, fantasyFreedom: v } } })} />
          </div>
        </SectionBox>

        {/* Turn + Victory */}
        <SectionBox title={t("editor.game_config")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <div>
              <label style={ovLabel}>{t("editor.turn_duration")}</label>
              <select value={config.turnDuration.default} onChange={(e) => onChange({ config: { ...config, turnDuration: { ...config.turnDuration, default: e.target.value as typeof config.turnDuration.default } } })} style={ovSelect}>
                {["1_week", "1_month", "3_months", "6_months", "1_year"].map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label style={ovLabel}>{t("editor.victory_type")}</label>
              <select value={config.victoryConditions[0]?.type ?? "domination"} onChange={(e) => {
                const vc = config.victoryConditions[0] ?? { type: "domination", description: "" };
                onChange({ config: { ...config, victoryConditions: [{ ...vc, type: e.target.value as typeof vc.type }] } });
              }} style={ovSelect}>
                {["score", "domination", "technology", "diplomacy", "custom"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <label style={ovLabel}>{t("editor.victory_desc")}</label>
            <input value={config.victoryConditions[0]?.description ?? ""} onChange={(e) => {
              const vc = config.victoryConditions[0] ?? { type: "domination", description: "" };
              onChange({ config: { ...config, victoryConditions: [{ ...vc, description: e.target.value }] } });
            }} style={ovInput} />
          </div>
        </SectionBox>

        {/* Map bounds */}
        <SectionBox title={t("editor.map_bounds")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.5rem" }}>
            <OvNum label={t("editor.north")} value={scenario.map.bounds.north} onChange={(v) => onChange({ map: { ...scenario.map, bounds: { ...scenario.map.bounds, north: v } } })} />
            <OvNum label={t("editor.south")} value={scenario.map.bounds.south} onChange={(v) => onChange({ map: { ...scenario.map, bounds: { ...scenario.map.bounds, south: v } } })} />
            <OvNum label={t("editor.west")} value={scenario.map.bounds.west} onChange={(v) => onChange({ map: { ...scenario.map, bounds: { ...scenario.map.bounds, west: v } } })} />
            <OvNum label={t("editor.east")} value={scenario.map.bounds.east} onChange={(v) => onChange({ map: { ...scenario.map, bounds: { ...scenario.map.bounds, east: v } } })} />
          </div>
        </SectionBox>

        {/* Validation errors */}
        {errors.length > 0 && (
          <SectionBox title={t("editor.validation_errors", { count: errors.length })}>
            {errors.map((err, i) => (
              <div key={i} style={{ padding: "0.3rem 0.5rem", marginBottom: "0.2rem", backgroundColor: "#1a1111", border: "1px solid #2a1515", borderRadius: 3, fontSize: "0.75rem" }}>
                <span style={{ color: "#f87171", fontWeight: 600 }}>{err.path}: </span>
                <span style={{ color: "#888" }}>{err.message}</span>
              </div>
            ))}
          </SectionBox>
        )}
      </div>
    </div>
  );
}

/* ---- Narrative Tab ---- */
function NarrativeTab({ scenario, onChange }: { scenario: Scenario; onChange: (patch: Partial<Scenario>) => void }) {
  const { t } = useTranslation();
  const narr = scenario.narrative;

  return (
    <div style={{ padding: "1rem 1.5rem", overflowY: "auto", height: "100%", maxWidth: 700 }}>
      <SectionBox title={t("editor.narrative_settings")}>
        <div>
          <label style={ovLabel}>{t("editor.introduction")}</label>
          <textarea value={narr.introduction} onChange={(e) => onChange({ narrative: { ...narr, introduction: e.target.value } })} rows={5} style={{ ...ovInput, resize: "vertical", lineHeight: 1.6 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.5rem" }}>
          <div>
            <label style={ovLabel}>{t("editor.style")}</label>
            <select value={narr.style} onChange={(e) => onChange({ narrative: { ...narr, style: e.target.value as typeof narr.style } })} style={ovSelect}>
              {["historical_chronicle", "news_broadcast", "royal_court", "war_report", "diplomatic_cable"].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={ovLabel}>{t("editor.tone")}</label>
            <select value={narr.tone} onChange={(e) => onChange({ narrative: { ...narr, tone: e.target.value as typeof narr.tone } })} style={ovSelect}>
              {["formal", "casual", "dramatic", "humorous"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: "0.5rem" }}>
          <label style={ovLabel}>{t("editor.vocabulary_era")}</label>
          <input value={narr.vocabularyEra} onChange={(e) => onChange({ narrative: { ...narr, vocabularyEra: e.target.value } })} style={ovInput} placeholder="e.g. medieval, modern, ancient..." />
        </div>
      </SectionBox>
    </div>
  );
}

/* ---- Shared Components ---- */

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #1a1a1a", borderRadius: 6, padding: "0.8rem", backgroundColor: "#0f0f0f" }}>
      <div style={{ fontSize: "0.72rem", color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>{title}</div>
      {children}
    </div>
  );
}

function SliderField({ label, value, color, desc, onChange }: { label: string; value: number; color: string; desc: string; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
        <span style={{ fontSize: "0.78rem", color: "#ccc" }}>{label}</span>
        <span style={{ fontSize: "0.78rem", color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <input type="range" min={0} max={100} value={pct} onChange={(e) => onChange(Number(e.target.value) / 100)} style={{ width: "100%", accentColor: color }} />
      <div style={{ fontSize: "0.65rem", color: "#444" }}>{desc}</div>
    </div>
  );
}

function OvField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={ovLabel}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={ovInput} />
    </div>
  );
}

function OvNum({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div>
      <label style={ovLabel}>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} min={min} max={max} style={ovInput} />
    </div>
  );
}

const ovLabel: React.CSSProperties = { display: "block", fontSize: "0.68rem", color: "#666", marginBottom: "0.15rem", fontWeight: 600, textTransform: "uppercase" };
const ovInput: React.CSSProperties = { width: "100%", padding: "0.35rem 0.5rem", backgroundColor: "#0a0a0a", border: "1px solid #222", borderRadius: 4, color: "#e0e0e0", fontSize: "0.82rem", outline: "none", boxSizing: "border-box" };
const ovSelect: React.CSSProperties = { ...ovInput, cursor: "pointer" };
const headerBtnStyle: React.CSSProperties = { padding: "0.3rem 0.8rem", backgroundColor: "#1a1a2e", border: "1px solid #222", borderRadius: 4, color: "#888", cursor: "pointer", fontSize: "0.78rem" };
const templateBtnStyle: React.CSSProperties = { background: "none", border: "1px solid #222", borderRadius: 3, padding: "1px 6px", color: "#60a5fa", cursor: "pointer", fontSize: "0.72rem" };
