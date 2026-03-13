"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Province, TerrainType, ResourceType } from "@historia/shared";

const TERRAINS: TerrainType[] = ["plains", "hills", "mountains", "forest", "coastal", "desert", "arctic", "jungle", "marsh", "ocean"];
const RESOURCES: ResourceType[] = ["grain", "fish", "iron", "gold", "coal", "oil", "cotton", "spices", "silk", "wine", "wood", "copper", "salt"];

const DEFAULT_PROVINCE: Province = {
  id: "",
  name: "",
  displayName: "",
  terrain: "plains",
  isCoastal: false,
  polygon: [],
  center: [0, 0],
  neighbors: [],
  baseTax: 5,
  baseProduction: 3,
  baseManpower: 3,
  hasPort: false,
  fortLevel: 0,
  resources: [],
  buildings: [],
  isCapital: false,
  owner: "",
  controller: "",
};

interface Props {
  provinces: Province[];
  onChange: (provinces: Province[]) => void;
  nations: { id: string; name: string; color: string }[];
  mapBounds?: { north: number; south: number; west: number; east: number };
}

export function MapEditor({ provinces, onChange, nations, mapBounds }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(provinces.length > 0 ? 0 : null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  const selected = selectedIdx !== null ? provinces[selectedIdx] : null;
  const bounds = mapBounds ?? { north: 90, south: -90, west: -180, east: 180 };

  const update = (idx: number, patch: Partial<Province>) => {
    const next = [...provinces];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const addProvince = () => {
    const id = `prov_${Date.now().toString(36)}`;
    const centerLon = (bounds.west + bounds.east) / 2;
    const centerLat = (bounds.south + bounds.north) / 2;
    const size = 2;
    const p: Province = {
      ...DEFAULT_PROVINCE,
      id,
      name: `Province ${provinces.length + 1}`,
      displayName: `Province ${provinces.length + 1}`,
      polygon: [
        [centerLon - size, centerLat + size],
        [centerLon + size, centerLat + size],
        [centerLon + size, centerLat - size],
        [centerLon - size, centerLat - size],
      ],
      center: [centerLon, centerLat],
    };
    onChange([...provinces, p]);
    setSelectedIdx(provinces.length);
  };

  const removeProvince = (idx: number) => {
    const removedId = provinces[idx].id;
    const next = provinces
      .filter((_, i) => i !== idx)
      .map((p) => ({ ...p, neighbors: p.neighbors.filter((n) => n !== removedId) }));
    onChange(next);
    setSelectedIdx(next.length > 0 ? Math.min(idx, next.length - 1) : null);
  };

  // Convert geo coords to canvas coords
  const toCanvas = useCallback((lon: number, lat: number, width: number, height: number) => {
    const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * width;
    const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * height;
    return { x: x * zoom + panOffset.x, y: y * zoom + panOffset.y };
  }, [bounds, zoom, panOffset]);

  // Draw minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 0.5;
    for (let lon = Math.ceil(bounds.west / 10) * 10; lon <= bounds.east; lon += 10) {
      const { x } = toCanvas(lon, 0, w, h);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let lat = Math.ceil(bounds.south / 10) * 10; lat <= bounds.north; lat += 10) {
      const { y } = toCanvas(0, lat, w, h);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw provinces
    for (let i = 0; i < provinces.length; i++) {
      const prov = provinces[i];
      if (prov.polygon.length < 3) continue;

      const nationColor = nations.find((n) => n.id === prov.owner)?.color ?? "#333";
      const isSelected = i === selectedIdx;

      ctx.beginPath();
      const first = toCanvas(prov.polygon[0][0], prov.polygon[0][1], w, h);
      ctx.moveTo(first.x, first.y);
      for (let j = 1; j < prov.polygon.length; j++) {
        const p = toCanvas(prov.polygon[j][0], prov.polygon[j][1], w, h);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();

      ctx.fillStyle = isSelected ? nationColor + "88" : nationColor + "44";
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#60a5fa" : "#555";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Label
      const center = toCanvas(prov.center[0], prov.center[1], w, h);
      ctx.fillStyle = isSelected ? "#fff" : "#888";
      ctx.font = `${Math.max(9, 11 * zoom)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(prov.name, center.x, center.y + 4);
    }
  }, [provinces, selectedIdx, nations, bounds, toCanvas, zoom, panOffset]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check which province was clicked
    for (let i = 0; i < provinces.length; i++) {
      const prov = provinces[i];
      const center = toCanvas(prov.center[0], prov.center[1], canvas.width, canvas.height);
      const dist = Math.sqrt((mx - center.x) ** 2 + (my - center.y) ** 2);
      if (dist < 25 * zoom) {
        setSelectedIdx(i);
        return;
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.5, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      panStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    }
  };
  const handleMouseUp = () => setIsPanning(false);

  return (
    <div style={{ display: "flex", height: "100%", gap: 0 }}>
      {/* Province list */}
      <div style={{ width: 200, borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "0.5rem", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "#666", fontWeight: 600 }}>PROVINCES ({provinces.length})</span>
          <button onClick={addProvince} style={addBtnStyle}>+ Add</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {provinces.map((p, i) => {
            const ownerColor = nations.find((n) => n.id === p.owner)?.color ?? "#333";
            return (
              <div
                key={p.id || i}
                onClick={() => setSelectedIdx(i)}
                style={{
                  padding: "0.4rem 0.5rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  backgroundColor: selectedIdx === i ? "#1a1a2e" : "transparent",
                  borderBottom: "1px solid #111",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: ownerColor, flexShrink: 0, border: "1px solid #333" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: selectedIdx === i ? "#60a5fa" : "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name || "Unnamed"}
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "#555" }}>{p.terrain} {p.isCapital ? "★" : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Center: Canvas */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0.3rem 0.5rem", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.7rem", color: "#555" }}>
          <span>Shift+drag to pan | Scroll to zoom | Click to select</span>
          <span>Zoom: {Math.round(zoom * 100)}%</span>
        </div>
        <canvas
          ref={canvasRef}
          width={600}
          height={450}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ flex: 1, cursor: isPanning ? "grabbing" : "crosshair", maxHeight: "100%" }}
        />
      </div>

      {/* Right: Province detail */}
      <div style={{ width: 280, borderLeft: "1px solid #1a1a1a", overflowY: "auto", padding: "0.5rem" }}>
        {selected && selectedIdx !== null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <FieldSmall label="ID" value={selected.id} onChange={(v) => update(selectedIdx, { id: v })} />
              <FieldSmall label="Name" value={selected.name} onChange={(v) => update(selectedIdx, { name: v, displayName: v })} />
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <div style={{ flex: 1 }}>
                <label style={smallLabelStyle}>Terrain</label>
                <select value={selected.terrain} onChange={(e) => update(selectedIdx, { terrain: e.target.value as TerrainType })} style={smallSelectStyle}>
                  {TERRAINS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={smallLabelStyle}>Owner</label>
                <select value={selected.owner} onChange={(e) => update(selectedIdx, { owner: e.target.value, controller: e.target.value })} style={smallSelectStyle}>
                  <option value="">-- None --</option>
                  {nations.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <NumSmall label="Tax" value={selected.baseTax} onChange={(v) => update(selectedIdx, { baseTax: v })} min={0} max={20} />
              <NumSmall label="Production" value={selected.baseProduction} onChange={(v) => update(selectedIdx, { baseProduction: v })} min={0} max={20} />
              <NumSmall label="Manpower" value={selected.baseManpower} onChange={(v) => update(selectedIdx, { baseManpower: v })} min={0} max={20} />
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <NumSmall label="Fort Level" value={selected.fortLevel} onChange={(v) => update(selectedIdx, { fortLevel: v })} min={0} max={8} />
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", paddingBottom: 2 }}>
                <label style={{ fontSize: "0.68rem", color: "#888", display: "flex", gap: "0.3rem", alignItems: "center" }}>
                  <input type="checkbox" checked={selected.isCoastal} onChange={(e) => update(selectedIdx, { isCoastal: e.target.checked })} /> Coastal
                </label>
                <label style={{ fontSize: "0.68rem", color: "#888", display: "flex", gap: "0.3rem", alignItems: "center" }}>
                  <input type="checkbox" checked={selected.hasPort} onChange={(e) => update(selectedIdx, { hasPort: e.target.checked })} /> Port
                </label>
                <label style={{ fontSize: "0.68rem", color: "#888", display: "flex", gap: "0.3rem", alignItems: "center" }}>
                  <input type="checkbox" checked={selected.isCapital} onChange={(e) => update(selectedIdx, { isCapital: e.target.checked })} /> Capital
                </label>
              </div>
            </div>

            {/* Resources */}
            <div>
              <label style={smallLabelStyle}>Resources</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem" }}>
                {RESOURCES.map((r) => {
                  const has = selected.resources.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => {
                        const next = has ? selected.resources.filter((x) => x !== r) : [...selected.resources, r];
                        update(selectedIdx, { resources: next });
                      }}
                      style={{
                        padding: "1px 5px",
                        fontSize: "0.65rem",
                        border: `1px solid ${has ? "#fbbf2444" : "#222"}`,
                        borderRadius: 2,
                        backgroundColor: has ? "#fbbf2422" : "transparent",
                        color: has ? "#fbbf24" : "#555",
                        cursor: "pointer",
                      }}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Neighbors */}
            <div>
              <label style={smallLabelStyle}>Neighbors</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem" }}>
                {provinces.filter((_, i) => i !== selectedIdx).map((p) => {
                  const isNeighbor = selected.neighbors.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        const next = isNeighbor
                          ? selected.neighbors.filter((n) => n !== p.id)
                          : [...selected.neighbors, p.id];
                        update(selectedIdx, { neighbors: next });
                        // Also update the other province's neighbors (bidirectional)
                        const otherIdx = provinces.findIndex((pr) => pr.id === p.id);
                        if (otherIdx >= 0) {
                          const other = provinces[otherIdx];
                          const otherNeighbors = isNeighbor
                            ? other.neighbors.filter((n) => n !== selected.id)
                            : [...other.neighbors, selected.id];
                          const copy = [...provinces];
                          copy[selectedIdx] = { ...copy[selectedIdx], neighbors: next };
                          copy[otherIdx] = { ...copy[otherIdx], neighbors: otherNeighbors };
                          onChange(copy);
                        }
                      }}
                      style={{
                        padding: "1px 5px",
                        fontSize: "0.65rem",
                        border: `1px solid ${isNeighbor ? "#4ade8044" : "#222"}`,
                        borderRadius: 2,
                        backgroundColor: isNeighbor ? "#4ade8022" : "transparent",
                        color: isNeighbor ? "#4ade80" : "#555",
                        cursor: "pointer",
                      }}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Center coordinates */}
            <div>
              <label style={smallLabelStyle}>Center (lon, lat)</label>
              <div style={{ display: "flex", gap: "0.3rem" }}>
                <input
                  type="number"
                  value={selected.center[0]}
                  onChange={(e) => update(selectedIdx, { center: [Number(e.target.value), selected.center[1]] })}
                  style={smallInputStyle}
                  step={0.5}
                />
                <input
                  type="number"
                  value={selected.center[1]}
                  onChange={(e) => update(selectedIdx, { center: [selected.center[0], Number(e.target.value)] })}
                  style={smallInputStyle}
                  step={0.5}
                />
              </div>
            </div>

            <button onClick={() => removeProvince(selectedIdx)} style={{ padding: "0.3rem", backgroundColor: "#7f1d1d22", border: "1px solid #7f1d1d44", borderRadius: 3, color: "#f87171", cursor: "pointer", fontSize: "0.7rem" }}>
              Delete Province
            </button>
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "#555", fontSize: "0.8rem", padding: "2rem 0" }}>
            Select a province or click "+ Add".
          </div>
        )}
      </div>
    </div>
  );
}

function FieldSmall({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={smallLabelStyle}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={smallInputStyle} />
    </div>
  );
}

function NumSmall({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={smallLabelStyle}>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} min={min} max={max} style={smallInputStyle} />
    </div>
  );
}

const smallLabelStyle: React.CSSProperties = { display: "block", fontSize: "0.62rem", color: "#555", marginBottom: "0.1rem", fontWeight: 600, textTransform: "uppercase" };
const smallInputStyle: React.CSSProperties = { width: "100%", padding: "0.25rem 0.4rem", backgroundColor: "#0a0a0a", border: "1px solid #222", borderRadius: 3, color: "#e0e0e0", fontSize: "0.72rem", outline: "none", boxSizing: "border-box" };
const smallSelectStyle: React.CSSProperties = { ...smallInputStyle, cursor: "pointer" };
const addBtnStyle: React.CSSProperties = { padding: "2px 8px", backgroundColor: "#2563eb22", border: "1px solid #2563eb44", borderRadius: 3, color: "#60a5fa", cursor: "pointer", fontSize: "0.7rem" };
