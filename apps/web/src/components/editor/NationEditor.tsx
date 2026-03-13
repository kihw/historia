"use client";

import { useState } from "react";
import type { Nation, GovernmentType } from "@historia/shared";

const GOVERNMENTS: GovernmentType[] = [
  "feudal_monarchy",
  "absolute_monarchy",
  "constitutional_monarchy",
  "republic",
  "theocracy",
  "dictatorship",
  "communist_state",
  "tribal",
];

const DEFAULT_NATION: Nation = {
  id: "",
  name: "",
  tag: "",
  color: "#3B5998",
  government: "feudal_monarchy",
  ruler: { name: "Ruler", adminSkill: 3, diplomacySkill: 3, militarySkill: 3, age: 35, traits: [] },
  capital: "",
  provinces: [],
  economy: { treasury: 100, taxRate: 0.1, inflation: 0.01, tradePower: 30, monthlyIncome: 15, monthlyExpenses: 10 },
  military: { armies: [], manpower: 10000, maxManpower: 20000, forceLimit: 15000, militaryTechnology: 1 },
  diplomacy: { relations: {}, alliances: [], rivals: [], truces: {}, royalMarriages: [] },
  population: { total: 1000000, growthRate: 0.003, stability: 50, warExhaustion: 0, culture: "default", religion: "default" },
  playable: true,
};

interface Props {
  nations: Nation[];
  onChange: (nations: Nation[]) => void;
  provinces: { id: string; name: string }[];
}

export function NationEditor({ nations, onChange, provinces }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(nations.length > 0 ? 0 : null);
  const [expandedSection, setExpandedSection] = useState<string>("basic");

  const selected = selectedIdx !== null ? nations[selectedIdx] : null;

  const update = (idx: number, patch: Partial<Nation>) => {
    const next = [...nations];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const addNation = () => {
    const id = `nation_${Date.now().toString(36)}`;
    const n = { ...DEFAULT_NATION, id, name: `New Nation`, tag: id.substring(0, 3).toUpperCase() };
    onChange([...nations, n]);
    setSelectedIdx(nations.length);
  };

  const removeNation = (idx: number) => {
    const next = nations.filter((_, i) => i !== idx);
    onChange(next);
    setSelectedIdx(next.length > 0 ? Math.min(idx, next.length - 1) : null);
  };

  return (
    <div style={{ display: "flex", height: "100%", gap: 0 }}>
      {/* Nation list sidebar */}
      <div style={{ width: 200, borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "0.5rem", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "#666", fontWeight: 600 }}>NATIONS ({nations.length})</span>
          <button onClick={addNation} style={addBtnStyle}>+ Add</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {nations.map((n, i) => (
            <div
              key={n.id || i}
              onClick={() => setSelectedIdx(i)}
              style={{
                padding: "0.5rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                backgroundColor: selectedIdx === i ? "#1a1a2e" : "transparent",
                borderBottom: "1px solid #111",
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: n.color || "#555", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: selectedIdx === i ? "#60a5fa" : "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {n.name || "Unnamed"}
                </div>
                <div style={{ fontSize: "0.65rem", color: "#555" }}>{n.tag || "???"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nation detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem" }}>
        {selected && selectedIdx !== null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Basic Info */}
            <Section title="Basic Info" id="basic" expanded={expandedSection} onToggle={setExpandedSection}>
              <Row>
                <Field label="ID" value={selected.id} onChange={(v) => update(selectedIdx, { id: v })} />
                <Field label="Tag (3 chars)" value={selected.tag} onChange={(v) => update(selectedIdx, { tag: v.substring(0, 3).toUpperCase() })} />
              </Row>
              <Row>
                <Field label="Name" value={selected.name} onChange={(v) => update(selectedIdx, { name: v })} />
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                  <div>
                    <label style={labelStyle}>Color</label>
                    <input type="color" value={selected.color || "#555"} onChange={(e) => update(selectedIdx, { color: e.target.value })} style={{ width: 40, height: 28, border: "none", cursor: "pointer", backgroundColor: "transparent" }} />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: "#888", cursor: "pointer" }}>
                    <input type="checkbox" checked={selected.playable ?? false} onChange={(e) => update(selectedIdx, { playable: e.target.checked })} />
                    Playable
                  </label>
                </div>
              </Row>
              <Row>
                <div>
                  <label style={labelStyle}>Government</label>
                  <select value={selected.government} onChange={(e) => update(selectedIdx, { government: e.target.value as GovernmentType })} style={selectStyle}>
                    {GOVERNMENTS.map((g) => <option key={g} value={g}>{g.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Capital</label>
                  <select value={selected.capital} onChange={(e) => update(selectedIdx, { capital: e.target.value })} style={selectStyle}>
                    <option value="">-- Select --</option>
                    {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </Row>
              <div>
                <label style={labelStyle}>Provinces</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {provinces.map((p) => {
                    const isOwned = selected.provinces.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          const next = isOwned
                            ? selected.provinces.filter((x) => x !== p.id)
                            : [...selected.provinces, p.id];
                          update(selectedIdx, { provinces: next });
                        }}
                        style={{
                          padding: "2px 6px",
                          fontSize: "0.7rem",
                          border: `1px solid ${isOwned ? "#2563eb44" : "#222"}`,
                          borderRadius: 3,
                          backgroundColor: isOwned ? "#2563eb22" : "transparent",
                          color: isOwned ? "#60a5fa" : "#666",
                          cursor: "pointer",
                        }}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Section>

            {/* Ruler */}
            <Section title="Ruler" id="ruler" expanded={expandedSection} onToggle={setExpandedSection}>
              <Row>
                <Field label="Name" value={selected.ruler.name} onChange={(v) => update(selectedIdx, { ruler: { ...selected.ruler, name: v } })} />
                <NumberField label="Age" value={selected.ruler.age} onChange={(v) => update(selectedIdx, { ruler: { ...selected.ruler, age: v } })} min={1} max={100} />
              </Row>
              <Row>
                <NumberField label="Admin" value={selected.ruler.adminSkill} onChange={(v) => update(selectedIdx, { ruler: { ...selected.ruler, adminSkill: v } })} min={0} max={10} />
                <NumberField label="Diplomacy" value={selected.ruler.diplomacySkill} onChange={(v) => update(selectedIdx, { ruler: { ...selected.ruler, diplomacySkill: v } })} min={0} max={10} />
                <NumberField label="Military" value={selected.ruler.militarySkill} onChange={(v) => update(selectedIdx, { ruler: { ...selected.ruler, militarySkill: v } })} min={0} max={10} />
              </Row>
              <Field label="Traits (comma-separated)" value={(selected.ruler.traits ?? []).join(", ")} onChange={(v) => update(selectedIdx, { ruler: { ...selected.ruler, traits: v.split(",").map((t) => t.trim()).filter(Boolean) } })} />
            </Section>

            {/* Economy */}
            <Section title="Economy" id="economy" expanded={expandedSection} onToggle={setExpandedSection}>
              <Row>
                <NumberField label="Treasury" value={selected.economy.treasury} onChange={(v) => update(selectedIdx, { economy: { ...selected.economy, treasury: v } })} min={0} />
                <NumberField label="Tax Rate" value={selected.economy.taxRate} onChange={(v) => update(selectedIdx, { economy: { ...selected.economy, taxRate: v } })} min={0} max={1} step={0.01} />
              </Row>
              <Row>
                <NumberField label="Trade Power" value={selected.economy.tradePower} onChange={(v) => update(selectedIdx, { economy: { ...selected.economy, tradePower: v } })} min={0} />
                <NumberField label="Inflation" value={selected.economy.inflation} onChange={(v) => update(selectedIdx, { economy: { ...selected.economy, inflation: v } })} min={0} max={1} step={0.01} />
              </Row>
              <Row>
                <NumberField label="Monthly Income" value={selected.economy.monthlyIncome} onChange={(v) => update(selectedIdx, { economy: { ...selected.economy, monthlyIncome: v } })} min={0} />
                <NumberField label="Monthly Expenses" value={selected.economy.monthlyExpenses} onChange={(v) => update(selectedIdx, { economy: { ...selected.economy, monthlyExpenses: v } })} min={0} />
              </Row>
            </Section>

            {/* Military */}
            <Section title="Military" id="military" expanded={expandedSection} onToggle={setExpandedSection}>
              <Row>
                <NumberField label="Manpower" value={selected.military.manpower} onChange={(v) => update(selectedIdx, { military: { ...selected.military, manpower: v } })} min={0} />
                <NumberField label="Max Manpower" value={selected.military.maxManpower} onChange={(v) => update(selectedIdx, { military: { ...selected.military, maxManpower: v } })} min={0} />
              </Row>
              <Row>
                <NumberField label="Force Limit" value={selected.military.forceLimit} onChange={(v) => update(selectedIdx, { military: { ...selected.military, forceLimit: v } })} min={0} />
                <NumberField label="Tech Level" value={selected.military.militaryTechnology} onChange={(v) => update(selectedIdx, { military: { ...selected.military, militaryTechnology: v } })} min={0} max={50} />
              </Row>
            </Section>

            {/* Population */}
            <Section title="Population" id="population" expanded={expandedSection} onToggle={setExpandedSection}>
              <Row>
                <NumberField label="Total" value={selected.population.total} onChange={(v) => update(selectedIdx, { population: { ...selected.population, total: v } })} min={0} />
                <NumberField label="Growth Rate" value={selected.population.growthRate} onChange={(v) => update(selectedIdx, { population: { ...selected.population, growthRate: v } })} min={0} max={0.1} step={0.001} />
              </Row>
              <Row>
                <NumberField label="Stability" value={selected.population.stability} onChange={(v) => update(selectedIdx, { population: { ...selected.population, stability: v } })} min={0} max={100} />
                <NumberField label="War Exhaustion" value={selected.population.warExhaustion} onChange={(v) => update(selectedIdx, { population: { ...selected.population, warExhaustion: v } })} min={0} max={100} />
              </Row>
              <Row>
                <Field label="Culture" value={selected.population.culture} onChange={(v) => update(selectedIdx, { population: { ...selected.population, culture: v } })} />
                <Field label="Religion" value={selected.population.religion} onChange={(v) => update(selectedIdx, { population: { ...selected.population, religion: v } })} />
              </Row>
            </Section>

            {/* Diplomacy */}
            <Section title="Diplomacy" id="diplomacy" expanded={expandedSection} onToggle={setExpandedSection}>
              <label style={labelStyle}>Relations</label>
              {nations.filter((_, i) => i !== selectedIdx).map((other) => {
                const rel = selected.diplomacy.relations[other.id] ?? 0;
                return (
                  <div key={other.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.72rem", color: "#888", width: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{other.name}</span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={rel}
                      onChange={(e) => {
                        const newRelations = { ...selected.diplomacy.relations, [other.id]: Number(e.target.value) };
                        update(selectedIdx, { diplomacy: { ...selected.diplomacy, relations: newRelations } });
                      }}
                      style={{ flex: 1, accentColor: rel > 0 ? "#4ade80" : rel < 0 ? "#f87171" : "#888" }}
                    />
                    <span style={{ fontSize: "0.7rem", color: rel > 0 ? "#4ade80" : rel < 0 ? "#f87171" : "#888", width: 30, textAlign: "right" }}>{rel}</span>
                  </div>
                );
              })}
              <div style={{ marginTop: "0.5rem" }}>
                <label style={labelStyle}>Alliances (nation IDs, comma-separated)</label>
                <input
                  value={(selected.diplomacy.alliances ?? []).join(", ")}
                  onChange={(e) => update(selectedIdx, { diplomacy: { ...selected.diplomacy, alliances: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginTop: "0.3rem" }}>
                <label style={labelStyle}>Rivals (nation IDs, comma-separated)</label>
                <input
                  value={(selected.diplomacy.rivals ?? []).join(", ")}
                  onChange={(e) => update(selectedIdx, { diplomacy: { ...selected.diplomacy, rivals: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                  style={inputStyle}
                />
              </div>
            </Section>

            {/* Delete */}
            <button onClick={() => removeNation(selectedIdx)} style={{ padding: "0.4rem", backgroundColor: "#7f1d1d22", border: "1px solid #7f1d1d44", borderRadius: 4, color: "#f87171", cursor: "pointer", fontSize: "0.75rem" }}>
              Delete Nation
            </button>
          </div>
        ) : (
          <div style={{ padding: "2rem", textAlign: "center", color: "#555", fontSize: "0.85rem" }}>
            Select a nation or click "+ Add" to create one.
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, id, expanded, onToggle, children }: { title: string; id: string; expanded: string; onToggle: (id: string) => void; children: React.ReactNode }) {
  const isExpanded = expanded === id;
  return (
    <div style={{ border: "1px solid #1a1a1a", borderRadius: 4, overflow: "hidden" }}>
      <button
        onClick={() => onToggle(isExpanded ? "" : id)}
        style={{ width: "100%", padding: "0.4rem 0.6rem", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#111", border: "none", color: "#ccc", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
      >
        {title}
        <span style={{ color: "#555", fontSize: "0.7rem" }}>{isExpanded ? "▼" : "▶"}</span>
      </button>
      {isExpanded && <div style={{ padding: "0.5rem 0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>{children}</div>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>{children}</div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={labelStyle}>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} min={min} max={max} step={step} style={inputStyle} />
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.68rem", color: "#666", marginBottom: "0.15rem", fontWeight: 600, textTransform: "uppercase" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "0.3rem 0.5rem", backgroundColor: "#0a0a0a", border: "1px solid #222", borderRadius: 3, color: "#e0e0e0", fontSize: "0.78rem", outline: "none", boxSizing: "border-box" };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const addBtnStyle: React.CSSProperties = { padding: "2px 8px", backgroundColor: "#2563eb22", border: "1px solid #2563eb44", borderRadius: 3, color: "#60a5fa", cursor: "pointer", fontSize: "0.7rem" };
