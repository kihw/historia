"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type {
  CausalGraph,
  CausalGraphNode,
  CausalGraphEdge,
  EventCondition,
  EventEffect,
  GameDate,
} from "@historia/shared";

const NODE_TYPES = ["historical", "conditional", "consequence", "random"] as const;
const EDGE_TYPES = ["triggers", "enables", "blocks"] as const;
const CONDITION_TYPES = [
  "nation_exists", "relation_below", "relation_above", "stability_below",
  "at_war", "not_at_war", "event_occurred", "date_reached",
  "province_owned_by", "alliance_includes", "army_in_province",
] as const;
const EFFECT_TYPES = [
  "annex_province", "destroy_nation", "modify_relation", "modify_stat",
  "trigger_event", "spawn_army", "change_government", "create_nation",
] as const;

const NODE_COLORS: Record<string, string> = {
  historical: "#fbbf24",
  conditional: "#60a5fa",
  consequence: "#a78bfa",
  random: "#f87171",
};

interface NodePosition {
  x: number;
  y: number;
}

interface Props {
  graph: CausalGraph;
  onChange: (graph: CausalGraph) => void;
  nations: { id: string; name: string }[];
  provinces: { id: string; name: string }[];
}

export function EventGraphEditor({ graph, onChange, nations, provinces }: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; mouseX: number; mouseY: number } | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });

  const selectedNode = selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeIdx !== null ? graph.edges[selectedEdgeIdx] ?? null : null;

  // Initialize positions for new nodes
  useEffect(() => {
    const newPos = { ...positions };
    let changed = false;
    graph.nodes.forEach((node, i) => {
      if (!newPos[node.id]) {
        newPos[node.id] = { x: 100 + (i % 5) * 180, y: 80 + Math.floor(i / 5) * 120 };
        changed = true;
      }
    });
    if (changed) setPositions(newPos);
  }, [graph.nodes, positions]);

  const updateNode = (nodeId: string, patch: Partial<CausalGraphNode>) => {
    const next = graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n));
    onChange({ ...graph, nodes: next });
  };

  const addNode = () => {
    const id = `event_${Date.now().toString(36)}`;
    const node: CausalGraphNode = {
      id,
      name: "New Event",
      description: "Describe this event...",
      type: "conditional",
      conditions: [],
      effects: [],
    };
    onChange({ ...graph, nodes: [...graph.nodes, node] });
    setPositions({ ...positions, [id]: { x: 200 + Math.random() * 200, y: 150 + Math.random() * 200 } });
    setSelectedNodeId(id);
    setSelectedEdgeIdx(null);
  };

  const removeNode = (nodeId: string) => {
    const nodes = graph.nodes.filter((n) => n.id !== nodeId);
    const edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    onChange({ nodes, edges });
    const newPos = { ...positions };
    delete newPos[nodeId];
    setPositions(newPos);
    setSelectedNodeId(null);
  };

  const addEdge = (from: string, to: string) => {
    if (from === to) return;
    const exists = graph.edges.some((e) => e.from === from && e.to === to);
    if (exists) return;
    const edge: CausalGraphEdge = { from, to, type: "triggers" };
    onChange({ ...graph, edges: [...graph.edges, edge] });
  };

  const updateEdge = (idx: number, patch: Partial<CausalGraphEdge>) => {
    const next = [...graph.edges];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...graph, edges: next });
  };

  const removeEdge = (idx: number) => {
    const next = graph.edges.filter((_, i) => i !== idx);
    onChange({ ...graph, edges: next });
    setSelectedEdgeIdx(null);
  };

  // Canvas rendering
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#080810";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 0.5;
    for (let x = panOffset.x % 40; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = panOffset.y % 40; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw edges
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];
      const fromPos = positions[edge.from];
      const toPos = positions[edge.to];
      if (!fromPos || !toPos) continue;

      const fx = fromPos.x + panOffset.x;
      const fy = fromPos.y + panOffset.y;
      const tx = toPos.x + panOffset.x;
      const ty = toPos.y + panOffset.y;

      const isSelected = selectedEdgeIdx === i;
      ctx.strokeStyle = isSelected ? "#fff" : edge.type === "triggers" ? "#4ade8088" : edge.type === "enables" ? "#60a5fa88" : "#f8717188";
      ctx.lineWidth = isSelected ? 2.5 : 1.5;

      if (edge.type === "blocks") {
        ctx.setLineDash([6, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow
      const angle = Math.atan2(ty - fy, tx - fx);
      const arrowLen = 10;
      const ax = tx - 30 * Math.cos(angle);
      const ay = ty - 30 * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4));
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4));
      ctx.stroke();

      // Edge label
      const mx = (fx + tx) / 2;
      const my = (fy + ty) / 2;
      ctx.fillStyle = "#555";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(edge.type, mx, my - 6);
    }

    // Draw connecting line
    if (connecting) {
      const fromPos = positions[connecting.from];
      if (fromPos) {
        ctx.strokeStyle = "#60a5fa88";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(fromPos.x + panOffset.x, fromPos.y + panOffset.y);
        ctx.lineTo(connecting.mouseX, connecting.mouseY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw nodes
    for (const node of graph.nodes) {
      const pos = positions[node.id];
      if (!pos) continue;

      const x = pos.x + panOffset.x;
      const y = pos.y + panOffset.y;
      const isSelected = node.id === selectedNodeId;
      const color = NODE_COLORS[node.type] ?? "#888";

      // Node body
      const nodeW = 140;
      const nodeH = 50;

      ctx.fillStyle = isSelected ? "#1a1a3e" : "#111";
      ctx.strokeStyle = isSelected ? color : color + "88";
      ctx.lineWidth = isSelected ? 2 : 1;

      // Rounded rect
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(x - nodeW / 2 + r, y - nodeH / 2);
      ctx.lineTo(x + nodeW / 2 - r, y - nodeH / 2);
      ctx.arcTo(x + nodeW / 2, y - nodeH / 2, x + nodeW / 2, y - nodeH / 2 + r, r);
      ctx.lineTo(x + nodeW / 2, y + nodeH / 2 - r);
      ctx.arcTo(x + nodeW / 2, y + nodeH / 2, x + nodeW / 2 - r, y + nodeH / 2, r);
      ctx.lineTo(x - nodeW / 2 + r, y + nodeH / 2);
      ctx.arcTo(x - nodeW / 2, y + nodeH / 2, x - nodeW / 2, y + nodeH / 2 - r, r);
      ctx.lineTo(x - nodeW / 2, y - nodeH / 2 + r);
      ctx.arcTo(x - nodeW / 2, y - nodeH / 2, x - nodeW / 2 + r, y - nodeH / 2, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Color bar on top
      ctx.fillStyle = color;
      ctx.fillRect(x - nodeW / 2, y - nodeH / 2, nodeW, 3);

      // Text
      ctx.fillStyle = isSelected ? "#fff" : "#ccc";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      const name = node.name.length > 18 ? node.name.substring(0, 16) + "..." : node.name;
      ctx.fillText(name, x, y - 3);

      // Type label
      ctx.fillStyle = color + "88";
      ctx.font = "9px sans-serif";
      ctx.fillText(node.type, x, y + 13);

      // Condition/effect count
      ctx.fillStyle = "#555";
      ctx.font = "8px sans-serif";
      ctx.fillText(`${node.conditions.length}C ${node.effects.length}E`, x, y + nodeH / 2 - 5);
    }
  }, [graph, positions, selectedNodeId, selectedEdgeIdx, connecting, panOffset]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getNodeAtPoint = (mx: number, my: number): string | null => {
    for (const node of graph.nodes) {
      const pos = positions[node.id];
      if (!pos) continue;
      const x = pos.x + panOffset.x;
      const y = pos.y + panOffset.y;
      if (Math.abs(mx - x) < 70 && Math.abs(my - y) < 25) return node.id;
    }
    return null;
  };

  const getEdgeAtPoint = (mx: number, my: number): number | null => {
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];
      const fp = positions[edge.from];
      const tp = positions[edge.to];
      if (!fp || !tp) continue;
      const midX = (fp.x + tp.x) / 2 + panOffset.x;
      const midY = (fp.y + tp.y) / 2 + panOffset.y;
      if (Math.abs(mx - midX) < 30 && Math.abs(my - midY) < 15) return i;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (e.shiftKey) {
      // Start connecting nodes
      const nodeId = getNodeAtPoint(mx, my);
      if (nodeId) {
        setConnecting({ from: nodeId, mouseX: mx, mouseY: my });
        return;
      }
    }

    const nodeId = getNodeAtPoint(mx, my);
    if (nodeId) {
      setSelectedNodeId(nodeId);
      setSelectedEdgeIdx(null);
      setDragging(nodeId);
      dragStart.current = { x: mx - (positions[nodeId]?.x ?? 0) - panOffset.x, y: my - (positions[nodeId]?.y ?? 0) - panOffset.y };
      return;
    }

    const edgeIdx = getEdgeAtPoint(mx, my);
    if (edgeIdx !== null) {
      setSelectedEdgeIdx(edgeIdx);
      setSelectedNodeId(null);
      return;
    }

    // Pan
    setIsPanning(true);
    panStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    setSelectedNodeId(null);
    setSelectedEdgeIdx(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragging) {
      setPositions({ ...positions, [dragging]: { x: mx - dragStart.current.x - panOffset.x, y: my - dragStart.current.y - panOffset.y } });
    } else if (connecting) {
      setConnecting({ ...connecting, mouseX: mx, mouseY: my });
    } else if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (connecting) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const targetId = getNodeAtPoint(mx, my);
        if (targetId && targetId !== connecting.from) {
          addEdge(connecting.from, targetId);
        }
      }
      setConnecting(null);
    }
    setDragging(null);
    setIsPanning(false);
  };

  return (
    <div style={{ display: "flex", height: "100%", gap: 0 }}>
      {/* Left: Node list */}
      <div style={{ width: 200, borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "0.5rem", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "#666", fontWeight: 600 }}>EVENTS ({graph.nodes.length})</span>
          <button onClick={addNode} style={addBtnStyle}>+ Add</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {graph.nodes.map((node) => (
            <div
              key={node.id}
              onClick={() => { setSelectedNodeId(node.id); setSelectedEdgeIdx(null); }}
              style={{
                padding: "0.4rem 0.5rem",
                cursor: "pointer",
                backgroundColor: selectedNodeId === node.id ? "#1a1a2e" : "transparent",
                borderBottom: "1px solid #111",
                borderLeft: `3px solid ${NODE_COLORS[node.type] ?? "#888"}`,
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: selectedNodeId === node.id ? "#60a5fa" : "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.name}
              </div>
              <div style={{ fontSize: "0.62rem", color: "#555" }}>{node.type} | {node.conditions.length} cond | {node.effects.length} eff</div>
            </div>
          ))}
        </div>
        {/* Edges list */}
        <div style={{ borderTop: "1px solid #1a1a1a" }}>
          <div style={{ padding: "0.3rem 0.5rem", fontSize: "0.7rem", color: "#555", fontWeight: 600 }}>
            EDGES ({graph.edges.length})
          </div>
          <div style={{ maxHeight: 150, overflowY: "auto" }}>
            {graph.edges.map((edge, i) => {
              const fromNode = graph.nodes.find((n) => n.id === edge.from);
              const toNode = graph.nodes.find((n) => n.id === edge.to);
              return (
                <div
                  key={i}
                  onClick={() => { setSelectedEdgeIdx(i); setSelectedNodeId(null); }}
                  style={{
                    padding: "0.25rem 0.5rem",
                    cursor: "pointer",
                    backgroundColor: selectedEdgeIdx === i ? "#1a1a2e" : "transparent",
                    borderBottom: "1px solid #0a0a0a",
                    fontSize: "0.65rem",
                  }}
                >
                  <span style={{ color: "#888" }}>{fromNode?.name ?? edge.from}</span>
                  <span style={{ color: edge.type === "triggers" ? "#4ade80" : edge.type === "enables" ? "#60a5fa" : "#f87171", margin: "0 0.3rem" }}>
                    {edge.type === "triggers" ? " → " : edge.type === "enables" ? " ◆ " : " ✕ "}
                  </span>
                  <span style={{ color: "#888" }}>{toNode?.name ?? edge.to}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Center: Canvas */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0.3rem 0.5rem", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.68rem", color: "#555" }}>
          <span>Drag nodes | Shift+drag to connect | Click edge label to select | Right-click canvas to pan</span>
          <div style={{ display: "flex", gap: "0.3rem" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: "#fbbf24", display: "inline-block" }} /> Historical</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: "#60a5fa", display: "inline-block" }} /> Conditional</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: "#a78bfa", display: "inline-block" }} /> Consequence</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: "#f87171", display: "inline-block" }} /> Random</span>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={700}
          height={500}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ flex: 1, cursor: dragging ? "grabbing" : connecting ? "crosshair" : "default", maxHeight: "100%" }}
        />
      </div>

      {/* Right: Detail panel */}
      <div style={{ width: 300, borderLeft: "1px solid #1a1a1a", overflowY: "auto", padding: "0.5rem" }}>
        {selectedNode ? (
          <NodeDetail
            node={selectedNode}
            onChange={(patch) => updateNode(selectedNode.id, patch)}
            onDelete={() => removeNode(selectedNode.id)}
            nations={nations}
            provinces={provinces}
            allNodes={graph.nodes}
          />
        ) : selectedEdge && selectedEdgeIdx !== null ? (
          <EdgeDetail
            edge={selectedEdge}
            idx={selectedEdgeIdx}
            onChange={(patch) => updateEdge(selectedEdgeIdx, patch)}
            onDelete={() => removeEdge(selectedEdgeIdx)}
            nodes={graph.nodes}
          />
        ) : (
          <div style={{ textAlign: "center", color: "#555", fontSize: "0.8rem", padding: "2rem 0" }}>
            Select a node or edge to edit. <br /><br />
            <b>Shift+drag</b> from one node to another to create an edge.
          </div>
        )}
      </div>
    </div>
  );
}

/* ----- Node Detail Panel ----- */

function NodeDetail({ node, onChange, onDelete, nations, provinces, allNodes }: {
  node: CausalGraphNode;
  onChange: (patch: Partial<CausalGraphNode>) => void;
  onDelete: () => void;
  nations: { id: string; name: string }[];
  provinces: { id: string; name: string }[];
  allNodes: CausalGraphNode[];
}) {
  const [section, setSection] = useState("basic");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ fontSize: "0.7rem", color: "#555", fontWeight: 700, textTransform: "uppercase" }}>EVENT NODE</div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderRadius: 4, overflow: "hidden", border: "1px solid #222" }}>
        {["basic", "conditions", "effects"].map((tab) => (
          <button
            key={tab}
            onClick={() => setSection(tab)}
            style={{
              flex: 1,
              padding: "0.3rem 0",
              fontSize: "0.68rem",
              fontWeight: 600,
              backgroundColor: section === tab ? "#1a1a2e" : "transparent",
              color: section === tab ? "#60a5fa" : "#666",
              border: "none",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {section === "basic" && (
        <>
          <SmField label="ID" value={node.id} onChange={(v) => onChange({ id: v })} />
          <SmField label="Name" value={node.name} onChange={(v) => onChange({ name: v })} />
          <div>
            <label style={smLabel}>Description</label>
            <textarea value={node.description} onChange={(e) => onChange({ description: e.target.value })} rows={3} style={{ ...smInput, resize: "vertical" }} />
          </div>
          <div>
            <label style={smLabel}>Type</label>
            <select value={node.type} onChange={(e) => onChange({ type: e.target.value as CausalGraphNode["type"] })} style={smSelect}>
              {NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={smLabel}>Narrative Prompt (optional - instructions for LLM)</label>
            <textarea value={node.narrativePrompt ?? ""} onChange={(e) => onChange({ narrativePrompt: e.target.value || undefined })} rows={2} style={{ ...smInput, resize: "vertical" }} placeholder="e.g. Describe this as a dramatic turning point..." />
          </div>
          <div>
            <label style={smLabel}>Scheduled Date (optional)</label>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <input type="number" placeholder="Year" value={node.scheduledDate?.year ?? ""} onChange={(e) => onChange({ scheduledDate: e.target.value ? { year: Number(e.target.value), month: node.scheduledDate?.month ?? 1 } : undefined })} style={{ ...smInput, flex: 1 }} />
              <input type="number" placeholder="Month" min={1} max={12} value={node.scheduledDate?.month ?? ""} onChange={(e) => onChange({ scheduledDate: node.scheduledDate ? { ...node.scheduledDate, month: Number(e.target.value) } : undefined })} style={{ ...smInput, flex: 1 }} />
            </div>
          </div>
          <div>
            <label style={smLabel}>Trigger Window (optional)</label>
            <div style={{ fontSize: "0.65rem", color: "#555", marginBottom: "0.2rem" }}>Earliest</div>
            <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.3rem" }}>
              <input type="number" placeholder="Year" value={node.triggerWindow?.earliest.year ?? ""} onChange={(e) => {
                const val = Number(e.target.value);
                if (!val) { onChange({ triggerWindow: undefined }); return; }
                const tw = node.triggerWindow ?? { earliest: { year: val, month: 1 }, latest: { year: val + 10, month: 12 } };
                onChange({ triggerWindow: { ...tw, earliest: { ...tw.earliest, year: val } } });
              }} style={{ ...smInput, flex: 1 }} />
              <input type="number" placeholder="Mo" min={1} max={12} value={node.triggerWindow?.earliest.month ?? ""} onChange={(e) => {
                if (!node.triggerWindow) return;
                onChange({ triggerWindow: { ...node.triggerWindow, earliest: { ...node.triggerWindow.earliest, month: Number(e.target.value) } } });
              }} style={{ ...smInput, flex: 1 }} />
            </div>
            <div style={{ fontSize: "0.65rem", color: "#555", marginBottom: "0.2rem" }}>Latest</div>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <input type="number" placeholder="Year" value={node.triggerWindow?.latest.year ?? ""} onChange={(e) => {
                if (!node.triggerWindow) return;
                onChange({ triggerWindow: { ...node.triggerWindow, latest: { ...node.triggerWindow.latest, year: Number(e.target.value) } } });
              }} style={{ ...smInput, flex: 1 }} />
              <input type="number" placeholder="Mo" min={1} max={12} value={node.triggerWindow?.latest.month ?? ""} onChange={(e) => {
                if (!node.triggerWindow) return;
                onChange({ triggerWindow: { ...node.triggerWindow, latest: { ...node.triggerWindow.latest, month: Number(e.target.value) } } });
              }} style={{ ...smInput, flex: 1 }} />
            </div>
          </div>
        </>
      )}

      {section === "conditions" && (
        <ConditionsEditor
          conditions={node.conditions}
          onChange={(c) => onChange({ conditions: c })}
          nations={nations}
          provinces={provinces}
          allNodes={allNodes}
        />
      )}

      {section === "effects" && (
        <EffectsEditor
          effects={node.effects}
          onChange={(e) => onChange({ effects: e })}
          nations={nations}
          provinces={provinces}
          allNodes={allNodes}
        />
      )}

      <button onClick={onDelete} style={deleteBtnStyle}>Delete Node</button>
    </div>
  );
}

/* ----- Edge Detail Panel ----- */

function EdgeDetail({ edge, idx, onChange, onDelete, nodes }: {
  edge: CausalGraphEdge;
  idx: number;
  onChange: (patch: Partial<CausalGraphEdge>) => void;
  onDelete: () => void;
  nodes: CausalGraphNode[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ fontSize: "0.7rem", color: "#555", fontWeight: 700, textTransform: "uppercase" }}>EDGE #{idx}</div>
      <div>
        <label style={smLabel}>From</label>
        <select value={edge.from} onChange={(e) => onChange({ from: e.target.value })} style={smSelect}>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>
      <div>
        <label style={smLabel}>To</label>
        <select value={edge.to} onChange={(e) => onChange({ to: e.target.value })} style={smSelect}>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>
      <div>
        <label style={smLabel}>Type</label>
        <select value={edge.type} onChange={(e) => onChange({ type: e.target.value as CausalGraphEdge["type"] })} style={smSelect}>
          {EDGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ fontSize: "0.62rem", color: "#555", marginTop: "0.2rem" }}>
          {edge.type === "triggers" && "When 'from' fires, 'to' becomes pending."}
          {edge.type === "enables" && "'to' can only fire if 'from' has occurred."}
          {edge.type === "blocks" && "'to' is blocked if 'from' has occurred."}
        </div>
      </div>
      <div>
        <label style={smLabel}>Delay (months, optional)</label>
        <input type="number" value={edge.delay?.months ?? ""} onChange={(e) => onChange({ delay: e.target.value ? { months: Number(e.target.value) } : undefined })} style={smInput} min={0} placeholder="0" />
      </div>
      <button onClick={onDelete} style={deleteBtnStyle}>Delete Edge</button>
    </div>
  );
}

/* ----- Conditions Editor ----- */

function ConditionsEditor({ conditions, onChange, nations, provinces, allNodes }: {
  conditions: EventCondition[];
  onChange: (c: EventCondition[]) => void;
  nations: { id: string; name: string }[];
  provinces: { id: string; name: string }[];
  allNodes: CausalGraphNode[];
}) {
  const addCondition = () => {
    onChange([...conditions, { type: "nation_exists", nation: nations[0]?.id ?? "" }]);
  };

  const updateCondition = (idx: number, c: EventCondition) => {
    const next = [...conditions];
    next[idx] = c;
    onChange(next);
  };

  const removeCondition = (idx: number) => {
    onChange(conditions.filter((_, i) => i !== idx));
  };

  const changeType = (idx: number, type: EventCondition["type"]) => {
    const defaults: Record<string, EventCondition> = {
      nation_exists: { type: "nation_exists", nation: nations[0]?.id ?? "" },
      relation_below: { type: "relation_below", nationA: "", nationB: "", threshold: -50 },
      relation_above: { type: "relation_above", nationA: "", nationB: "", threshold: 50 },
      stability_below: { type: "stability_below", nation: "", threshold: 30 },
      at_war: { type: "at_war", nation: "" },
      not_at_war: { type: "not_at_war", nation: "" },
      event_occurred: { type: "event_occurred", event: "" },
      date_reached: { type: "date_reached", date: { year: 1450, month: 1 } },
      province_owned_by: { type: "province_owned_by", province: "", nation: "" },
      alliance_includes: { type: "alliance_includes", nations: [], minMembers: 2 },
      army_in_province: { type: "army_in_province", province: "", minStrength: 5000 },
    };
    updateCondition(idx, defaults[type] ?? conditions[idx]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.68rem", color: "#666", fontWeight: 600 }}>CONDITIONS ({conditions.length})</span>
        <button onClick={addCondition} style={addBtnStyle}>+ Add</button>
      </div>
      {conditions.map((cond, i) => (
        <div key={i} style={{ border: "1px solid #1a1a1a", borderRadius: 3, padding: "0.4rem", backgroundColor: "#0a0a0a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
            <select value={cond.type} onChange={(e) => changeType(i, e.target.value as EventCondition["type"])} style={{ ...smSelect, flex: 1 }}>
              {CONDITION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <button onClick={() => removeCondition(i)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.7rem", padding: "0 4px" }}>x</button>
          </div>
          <ConditionFields cond={cond} onChange={(c) => updateCondition(i, c)} nations={nations} provinces={provinces} allNodes={allNodes} />
        </div>
      ))}
    </div>
  );
}

function ConditionFields({ cond, onChange, nations, provinces, allNodes }: {
  cond: EventCondition;
  onChange: (c: EventCondition) => void;
  nations: { id: string; name: string }[];
  provinces: { id: string; name: string }[];
  allNodes: CausalGraphNode[];
}) {
  switch (cond.type) {
    case "nation_exists":
      return <NationSelect value={cond.nation} onChange={(v) => onChange({ ...cond, nation: v })} nations={nations} label="Nation" />;
    case "relation_below":
    case "relation_above":
      return (
        <>
          <NationSelect value={cond.nationA} onChange={(v) => onChange({ ...cond, nationA: v })} nations={nations} label="Nation A" />
          <NationSelect value={cond.nationB} onChange={(v) => onChange({ ...cond, nationB: v })} nations={nations} label="Nation B" />
          <SmNum label="Threshold" value={cond.threshold} onChange={(v) => onChange({ ...cond, threshold: v })} />
        </>
      );
    case "stability_below":
      return (
        <>
          <NationSelect value={cond.nation} onChange={(v) => onChange({ ...cond, nation: v })} nations={nations} label="Nation" />
          <SmNum label="Threshold" value={cond.threshold} onChange={(v) => onChange({ ...cond, threshold: v })} />
        </>
      );
    case "at_war":
    case "not_at_war":
      return <NationSelect value={cond.nation} onChange={(v) => onChange({ ...cond, nation: v })} nations={nations} label="Nation" />;
    case "event_occurred":
      return (
        <div>
          <label style={smLabel}>Event</label>
          <select value={cond.event} onChange={(e) => onChange({ ...cond, event: e.target.value })} style={smSelect}>
            <option value="">-- Select --</option>
            {allNodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      );
    case "date_reached":
      return (
        <div style={{ display: "flex", gap: "0.3rem" }}>
          <SmNum label="Year" value={cond.date.year} onChange={(v) => onChange({ ...cond, date: { ...cond.date, year: v } })} />
          <SmNum label="Month" value={cond.date.month} onChange={(v) => onChange({ ...cond, date: { ...cond.date, month: v } })} />
        </div>
      );
    case "province_owned_by":
      return (
        <>
          <ProvSelect value={cond.province} onChange={(v) => onChange({ ...cond, province: v })} provinces={provinces} />
          <NationSelect value={cond.nation} onChange={(v) => onChange({ ...cond, nation: v })} nations={nations} label="Nation" />
        </>
      );
    case "alliance_includes":
      return (
        <>
          <SmNum label="Min Members" value={cond.minMembers} onChange={(v) => onChange({ ...cond, minMembers: v })} />
          <SmField label="Nations (comma-sep IDs)" value={cond.nations.join(", ")} onChange={(v) => onChange({ ...cond, nations: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </>
      );
    case "army_in_province":
      return (
        <>
          <ProvSelect value={cond.province} onChange={(v) => onChange({ ...cond, province: v })} provinces={provinces} />
          <SmNum label="Min Strength" value={cond.minStrength} onChange={(v) => onChange({ ...cond, minStrength: v })} />
        </>
      );
    default:
      return null;
  }
}

/* ----- Effects Editor ----- */

function EffectsEditor({ effects, onChange, nations, provinces, allNodes }: {
  effects: EventEffect[];
  onChange: (e: EventEffect[]) => void;
  nations: { id: string; name: string }[];
  provinces: { id: string; name: string }[];
  allNodes: CausalGraphNode[];
}) {
  const addEffect = () => {
    onChange([...effects, { type: "modify_stat", nations: [], stat: "population.stability", delta: -10 }]);
  };

  const updateEffect = (idx: number, e: EventEffect) => {
    const next = [...effects];
    next[idx] = e;
    onChange(next);
  };

  const removeEffect = (idx: number) => {
    onChange(effects.filter((_, i) => i !== idx));
  };

  const changeType = (idx: number, type: EventEffect["type"]) => {
    const defaults: Record<string, EventEffect> = {
      annex_province: { type: "annex_province", from: "", to: "", provinces: [] },
      destroy_nation: { type: "destroy_nation", nation: "" },
      modify_relation: { type: "modify_relation", nations: [], target: "", delta: 0 },
      modify_stat: { type: "modify_stat", nations: [], stat: "population.stability", delta: -10 },
      trigger_event: { type: "trigger_event", event: "" },
      spawn_army: { type: "spawn_army", nation: "", province: "", units: { infantry: 5000 } },
      change_government: { type: "change_government", nation: "", government: "republic" },
      create_nation: { type: "create_nation", nation: {} },
    };
    updateEffect(idx, defaults[type] ?? effects[idx]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.68rem", color: "#666", fontWeight: 600 }}>EFFECTS ({effects.length})</span>
        <button onClick={addEffect} style={addBtnStyle}>+ Add</button>
      </div>
      {effects.map((eff, i) => (
        <div key={i} style={{ border: "1px solid #1a1a1a", borderRadius: 3, padding: "0.4rem", backgroundColor: "#0a0a0a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
            <select value={eff.type} onChange={(e) => changeType(i, e.target.value as EventEffect["type"])} style={{ ...smSelect, flex: 1 }}>
              {EFFECT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <button onClick={() => removeEffect(i)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.7rem", padding: "0 4px" }}>x</button>
          </div>
          <EffectFields eff={eff} onChange={(e) => updateEffect(i, e)} nations={nations} provinces={provinces} allNodes={allNodes} />
        </div>
      ))}
    </div>
  );
}

function EffectFields({ eff, onChange, nations, provinces, allNodes }: {
  eff: EventEffect;
  onChange: (e: EventEffect) => void;
  nations: { id: string; name: string }[];
  provinces: { id: string; name: string }[];
  allNodes: CausalGraphNode[];
}) {
  switch (eff.type) {
    case "annex_province":
      return (
        <>
          <NationSelect value={eff.from} onChange={(v) => onChange({ ...eff, from: v })} nations={nations} label="From" />
          <NationSelect value={eff.to} onChange={(v) => onChange({ ...eff, to: v })} nations={nations} label="To" />
          <SmField label="Provinces (comma-sep IDs)" value={eff.provinces.join(", ")} onChange={(v) => onChange({ ...eff, provinces: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </>
      );
    case "destroy_nation":
      return <NationSelect value={eff.nation} onChange={(v) => onChange({ ...eff, nation: v })} nations={nations} label="Nation" />;
    case "modify_relation":
      return (
        <>
          <SmField label="Nations (comma-sep IDs)" value={eff.nations.join(", ")} onChange={(v) => onChange({ ...eff, nations: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
          <NationSelect value={eff.target} onChange={(v) => onChange({ ...eff, target: v })} nations={nations} label="Target" />
          <SmNum label="Delta" value={eff.delta} onChange={(v) => onChange({ ...eff, delta: v })} />
        </>
      );
    case "modify_stat":
      return (
        <>
          <SmField label="Nations (comma-sep IDs)" value={eff.nations.join(", ")} onChange={(v) => onChange({ ...eff, nations: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
          <div>
            <label style={smLabel}>Stat</label>
            <select value={eff.stat} onChange={(e) => onChange({ ...eff, stat: e.target.value })} style={smSelect}>
              <option value="population.stability">Stability</option>
              <option value="economy.treasury">Treasury</option>
              <option value="population.warExhaustion">War Exhaustion</option>
            </select>
          </div>
          <SmNum label="Delta" value={eff.delta} onChange={(v) => onChange({ ...eff, delta: v })} />
        </>
      );
    case "trigger_event":
      return (
        <div>
          <label style={smLabel}>Event to Trigger</label>
          <select value={eff.event} onChange={(e) => onChange({ ...eff, event: e.target.value })} style={smSelect}>
            <option value="">-- Select --</option>
            {allNodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      );
    case "spawn_army":
      return (
        <>
          <NationSelect value={eff.nation} onChange={(v) => onChange({ ...eff, nation: v })} nations={nations} label="Nation" />
          <ProvSelect value={eff.province} onChange={(v) => onChange({ ...eff, province: v })} provinces={provinces} />
          <SmNum label="Infantry" value={eff.units.infantry ?? 0} onChange={(v) => onChange({ ...eff, units: { ...eff.units, infantry: v } })} />
          <SmNum label="Cavalry" value={eff.units.cavalry ?? 0} onChange={(v) => onChange({ ...eff, units: { ...eff.units, cavalry: v } })} />
        </>
      );
    case "change_government":
      return (
        <>
          <NationSelect value={eff.nation} onChange={(v) => onChange({ ...eff, nation: v })} nations={nations} label="Nation" />
          <SmField label="Government" value={eff.government} onChange={(v) => onChange({ ...eff, government: v })} />
        </>
      );
    case "create_nation":
      return <div style={{ fontSize: "0.65rem", color: "#555" }}>Edit in JSON mode for full control.</div>;
    default:
      return null;
  }
}

/* ----- Shared small components ----- */

function NationSelect({ value, onChange, nations, label }: { value: string; onChange: (v: string) => void; nations: { id: string; name: string }[]; label: string }) {
  return (
    <div>
      <label style={smLabel}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={smSelect}>
        <option value="">-- Select --</option>
        {nations.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
    </div>
  );
}

function ProvSelect({ value, onChange, provinces }: { value: string; onChange: (v: string) => void; provinces: { id: string; name: string }[] }) {
  return (
    <div>
      <label style={smLabel}>Province</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={smSelect}>
        <option value="">-- Select --</option>
        {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

function SmField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={smLabel}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={smInput} />
    </div>
  );
}

function SmNum({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label style={smLabel}>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} style={smInput} />
    </div>
  );
}

const smLabel: React.CSSProperties = { display: "block", fontSize: "0.6rem", color: "#555", marginBottom: "0.1rem", fontWeight: 600, textTransform: "uppercase" };
const smInput: React.CSSProperties = { width: "100%", padding: "0.2rem 0.4rem", backgroundColor: "#0a0a0a", border: "1px solid #222", borderRadius: 2, color: "#e0e0e0", fontSize: "0.72rem", outline: "none", boxSizing: "border-box" };
const smSelect: React.CSSProperties = { ...smInput, cursor: "pointer" };
const addBtnStyle: React.CSSProperties = { padding: "2px 8px", backgroundColor: "#2563eb22", border: "1px solid #2563eb44", borderRadius: 3, color: "#60a5fa", cursor: "pointer", fontSize: "0.68rem" };
const deleteBtnStyle: React.CSSProperties = { padding: "0.3rem", backgroundColor: "#7f1d1d22", border: "1px solid #7f1d1d44", borderRadius: 3, color: "#f87171", cursor: "pointer", fontSize: "0.7rem", marginTop: "0.5rem" };
