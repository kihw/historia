"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Province, Nation, War, MapBounds } from "@historia/shared";
import type { Topology, GeometryCollection } from "topojson-specification";
import {
  isPointInProvince,
  useProvinceBounds,
} from "../../hooks/useMapData";
import {
  drawOcean,
  drawWorldLand,
  drawProvinces,
  drawTerrain,
  drawLabels,
  drawMilitary,
  drawAtmosphere,
} from "./layers";
import type { RenderContext, WorldFeature, MapMode } from "./layers";
import { MAP_MODES } from "./mapModes";

// --- World background data ---

const WORLD_ATLAS_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

let worldDataCache: WorldFeature[] | null = null;
let worldDataPromise: Promise<WorldFeature[]> | null = null;

async function loadWorldBackground(): Promise<WorldFeature[]> {
  if (worldDataCache) return worldDataCache;
  if (worldDataPromise) return worldDataPromise;

  worldDataPromise = (async () => {
    const topojson = await import("topojson-client");
    const res = await fetch(WORLD_ATLAS_URL);
    if (!res.ok) throw new Error(`Failed to load world atlas: ${res.status}`);
    const topoData: Topology = await res.json();

    const objectKey = topoData.objects.land ? "land" : "countries";
    const geojson = topojson.feature(
      topoData,
      topoData.objects[objectKey] as GeometryCollection
    ) as unknown as {
      type: string;
      features?: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }>;
      geometry?: { type: string; coordinates: number[][][] | number[][][][] };
    };

    const features: WorldFeature[] = [];
    const geometries: Array<{ type: string; coordinates: number[][][] | number[][][][] }> = [];
    if (geojson.features) {
      for (const f of geojson.features) geometries.push(f.geometry);
    } else if (geojson.geometry) {
      geometries.push(geojson.geometry);
    }

    for (const geom of geometries) {
      const rings: number[][][] = [];
      if (geom.type === "Polygon") {
        rings.push(...(geom.coordinates as number[][][]));
      } else if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates as number[][][][]) {
          rings.push(...poly);
        }
      }
      if (rings.length > 0) features.push({ rings });
    }

    worldDataCache = features;
    return features;
  })();

  return worldDataPromise;
}

// --- Props ---

interface UnifiedGameMapProps {
  provinces: Record<string, Province>;
  nations: Record<string, Nation>;
  wars?: War[];
  onProvinceClick?: (provinceId: string) => void;
  selectedProvince?: string | null;
  mapBounds?: MapBounds;
  mapMode?: MapMode;
  onMapModeChange?: (mode: MapMode) => void;
  playerNation?: string | null;
}

// --- Map state ---

interface MapState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// --- Nation colors ---

const FALLBACK_COLORS: Record<string, string> = {
  france: "#3B5998",
  england: "#C8102E",
  united_kingdom: "#C8102E",
  english_territory: "#C8102E",
  germany: "#4A4A4A",
  ussr: "#CC0000",
  united_states: "#3C3B6E",
  italy: "#009246",
  ottoman_empire: "#2E8B57",
  byzantine_empire: "#800080",
  castile: "#DAA520",
  portugal: "#003399",
  china: "#DE2910",
  cuba: "#005BAA",
  holy_roman_empire: "#FFD700",
  poland: "#DC143C",
  poland_lithuania: "#DC143C",
};

// --- Component ---

export function UnifiedGameMap({
  provinces,
  nations,
  wars,
  onProvinceClick,
  selectedProvince,
  mapBounds,
  mapMode: externalMapMode,
  onMapModeChange,
  playerNation,
}: UnifiedGameMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapStateRef = useRef<MapState>({ offsetX: 0, offsetY: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [worldFeatures, setWorldFeatures] = useState<WorldFeature[] | null>(null);
  const [internalMapMode, setInternalMapMode] = useState<MapMode>("political");
  const animFrameRef = useRef<number>(0);
  const initializedRef = useRef(false);
  const provinceBounds = useProvinceBounds(provinces);

  const mapMode = externalMapMode ?? internalMapMode;
  const setMapMode = onMapModeChange ?? setInternalMapMode;

  // Load world background on mount
  useEffect(() => {
    loadWorldBackground().then(setWorldFeatures).catch(console.error);
  }, []);

  // --- Nation color ---
  const getNationColor = useCallback(
    (nationId: string): string => {
      return nations[nationId]?.color ?? FALLBACK_COLORS[nationId] ?? "#555555";
    },
    [nations]
  );

  // --- Equirectangular projection ---
  const geoToScreenFn = useCallback(
    (lon: number, lat: number, canvas: HTMLCanvasElement): [number, number] => {
      const { offsetX, offsetY, zoom } = mapStateRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const scale = Math.min(w, h) * zoom * 0.45;
      const x = w / 2 + (lon / 180) * scale + offsetX;
      const y = h / 2 - (lat / 90) * scale * 0.5 + offsetY;
      return [x, y];
    },
    []
  );

  const screenToGeo = useCallback(
    (sx: number, sy: number, canvas: HTMLCanvasElement): [number, number] => {
      const { offsetX, offsetY, zoom } = mapStateRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const scale = Math.min(w, h) * zoom * 0.45;
      const lon = ((sx - w / 2 - offsetX) / scale) * 180;
      const lat = -((sy - h / 2 - offsetY) / (scale * 0.5)) * 90;
      return [lon, lat];
    },
    []
  );

  // --- Viewport culling ---
  const isInViewportFn = useCallback(
    (
      bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
      canvas: HTMLCanvasElement
    ): boolean => {
      const [x1, y1] = geoToScreenFn(bounds.minLon, bounds.maxLat, canvas);
      const [x2, y2] = geoToScreenFn(bounds.maxLon, bounds.minLat, canvas);
      const margin = 50;
      return !(
        x2 < -margin || x1 > canvas.width + margin ||
        y2 < -margin || y1 > canvas.height + margin
      );
    },
    [geoToScreenFn]
  );

  // --- Find province at point ---
  const findProvinceAtPoint = useCallback(
    (sx: number, sy: number): string | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const [lon, lat] = screenToGeo(sx, sy, canvas);
      for (const [id, prov] of Object.entries(provinces)) {
        if (isPointInProvince(lon, lat, prov)) return id;
      }
      return null;
    },
    [provinces, screenToGeo]
  );

  // --- Initialize viewport ---
  const initializeViewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || initializedRef.current) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    let bounds = mapBounds;
    if (!bounds) {
      let north = -90, south = 90, west = 180, east = -180;
      for (const prov of Object.values(provinces)) {
        const pb = provinceBounds.get(prov.id);
        if (!pb) continue;
        if (pb.maxLat > north) north = pb.maxLat;
        if (pb.minLat < south) south = pb.minLat;
        if (pb.minLon < west) west = pb.minLon;
        if (pb.maxLon > east) east = pb.maxLon;
      }
      if (north > south && east > west) {
        bounds = { north: north + 2, south: south - 2, west: west - 2, east: east + 2 };
      }
    }
    if (!bounds) return;

    const centerLon = (bounds.west + bounds.east) / 2;
    const centerLat = (bounds.south + bounds.north) / 2;
    const spanLon = bounds.east - bounds.west;
    const spanLat = bounds.north - bounds.south;

    const baseScale = Math.min(w, h) * 0.45;
    const zoomX = (w * 0.85) / ((spanLon / 180) * baseScale);
    const zoomY = (h * 0.85) / ((spanLat / 90) * baseScale * 0.5);
    const zoom = Math.min(zoomX, zoomY);

    const scale = Math.min(w, h) * zoom * 0.45;
    const offsetX = -(centerLon / 180) * scale;
    const offsetY = (centerLat / 90) * scale * 0.5;

    mapStateRef.current = { offsetX, offsetY, zoom };
    initializedRef.current = true;
  }, [mapBounds, provinces, provinceBounds]);

  // --- Draw ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const zoom = mapStateRef.current.zoom;

    // Build render context (bind canvas for geoToScreen)
    const geoToScreen = (lon: number, lat: number): [number, number] =>
      geoToScreenFn(lon, lat, canvas);
    const isInViewport = (bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number }) =>
      isInViewportFn(bounds, canvas);

    const rc: RenderContext = {
      ctx, canvas, w, h, zoom,
      geoToScreen,
      provinces, nations, wars,
      provinceBounds,
      isInViewport,
      selectedProvince: selectedProvince ?? null,
      hoveredProvince,
      worldFeatures,
      getNationColor,
      mapMode,
      playerNation: playerNation ?? null,
    };

    // --- Render layers ---
    drawOcean(rc);
    drawWorldLand(rc);
    drawProvinces(rc);
    drawTerrain(rc);
    drawLabels(rc);
    drawMilitary(rc);
    drawAtmosphere(rc);
  }, [
    provinces, nations, wars, geoToScreenFn, isInViewportFn,
    selectedProvince, hoveredProvince, getNationColor,
    provinceBounds, worldFeatures, mapMode, playerNation,
  ]);

  // --- Canvas resize + initial viewport ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);

      if (!initializedRef.current) initializeViewport();
      draw();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw, initializeViewport]);

  // Redraw on state changes
  useEffect(() => { draw(); }, [draw]);

  // --- Mouse handlers ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (isDraggingRef.current) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        const dpr = window.devicePixelRatio || 1;
        mapStateRef.current.offsetX += dx * dpr;
        mapStateRef.current.offsetY += dy * dpr;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
      const sy = (e.clientY - rect.top) * (window.devicePixelRatio || 1);
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

      const prov = findProvinceAtPoint(sx, sy);
      setHoveredProvince(prov);
    },
    [draw, findProvinceAtPoint]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      const dx = Math.abs(e.clientX - dragStartRef.current.x);
      const dy = Math.abs(e.clientY - dragStartRef.current.y);
      if (dx < 5 && dy < 5) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
        const sy = (e.clientY - rect.top) * (window.devicePixelRatio || 1);
        const prov = findProvinceAtPoint(sx, sy);
        if (prov && onProvinceClick) onProvinceClick(prov);
      }
    },
    [findProvinceAtPoint, onProvinceClick]
  );

  // Native wheel handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const mouseX = (e.clientX - rect.left) * dpr;
      const mouseY = (e.clientY - rect.top) * dpr;

      const oldZoom = mapStateRef.current.zoom;
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(0.3, Math.min(40, oldZoom * factor));

      mapStateRef.current.offsetX =
        mouseX - ((mouseX - mapStateRef.current.offsetX) / oldZoom) * newZoom;
      mapStateRef.current.offsetY =
        mouseY - ((mouseY - mapStateRef.current.offsetY) / oldZoom) * newZoom;
      mapStateRef.current.zoom = newZoom;

      draw();
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [draw]);

  // --- Tooltip data ---
  const hoveredProv = hoveredProvince ? provinces[hoveredProvince] : null;
  const hoveredOwner = hoveredProv ? nations[hoveredProv.owner] : null;

  // --- Tooltip edge detection ---
  const containerRect = containerRef.current?.getBoundingClientRect();
  const tooltipLeft = containerRect && mousePos.x > containerRect.width - 250
    ? mousePos.x - 220
    : mousePos.x + 15;
  const tooltipTop = containerRect && mousePos.y > containerRect.height - 180
    ? mousePos.y - 140
    : mousePos.y - 10;

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          cursor: isDraggingRef.current ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          isDraggingRef.current = false;
          setHoveredProvince(null);
        }}
      />

      {/* Enhanced tooltip */}
      {hoveredProv && (
        <div
          style={{
            position: "absolute",
            left: tooltipLeft,
            top: tooltipTop,
            backgroundColor: "rgba(8,8,12,0.95)",
            padding: "10px 14px",
            borderRadius: "8px",
            pointerEvents: "none",
            border: "1px solid #2a2a3a",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            minWidth: 200,
            zIndex: 10,
          }}
        >
          {/* Header with nation color bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span
              style={{
                width: 4,
                height: 22,
                borderRadius: 2,
                backgroundColor: getNationColor(hoveredProv.owner),
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                {hoveredProv.displayName}
              </div>
              <div style={{ fontSize: "0.72rem", color: getNationColor(hoveredProv.owner) }}>
                {hoveredOwner?.name ?? hoveredProv.owner}
              </div>
            </div>
          </div>

          {/* Badges */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            <MiniTag label={hoveredProv.terrain} />
            {hoveredProv.isCoastal && <MiniTag label="Coastal" color="#38bdf8" />}
            {hoveredProv.isCapital && <MiniTag label="Capital" color="#fbbf24" />}
            {hoveredProv.fortLevel > 0 && <MiniTag label={`Fort ${hoveredProv.fortLevel}`} color="#888" />}
            {hoveredProv.hasPort && <MiniTag label="Port" color="#38bdf8" />}
          </div>

          {/* Stats with mini bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <TooltipBar label="Tax" value={hoveredProv.baseTax} max={8} color="#fbbf24" />
            <TooltipBar label="Production" value={hoveredProv.baseProduction} max={8} color="#60a5fa" />
            <TooltipBar label="Manpower" value={hoveredProv.baseManpower} max={10} color="#4ade80" />
          </div>

          {/* Resources */}
          {hoveredProv.resources.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", gap: 3, flexWrap: "wrap" }}>
              {hoveredProv.resources.map((r) => (
                <span
                  key={r}
                  style={{
                    fontSize: "0.65rem",
                    padding: "1px 5px",
                    borderRadius: 3,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: "#aaa",
                  }}
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {[
          { label: "+", action: () => { mapStateRef.current.zoom = Math.min(40, mapStateRef.current.zoom * 1.3); draw(); } },
          { label: "\u2212", action: () => { mapStateRef.current.zoom = Math.max(0.3, mapStateRef.current.zoom / 1.3); draw(); } },
          { label: "R", action: () => { initializedRef.current = false; initializeViewport(); draw(); } },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={btn.action}
            style={zoomBtnStyle}
            title={btn.label === "R" ? "Reset view" : undefined}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Map mode selector */}
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          display: "flex",
          gap: 3,
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: 4,
          borderRadius: 8,
        }}
      >
        {MAP_MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setMapMode(mode.id)}
            title={mode.label}
            style={{
              width: 30,
              height: 28,
              background: mapMode === mode.id ? "rgba(37,99,235,0.4)" : "transparent",
              border: mapMode === mode.id ? "1px solid rgba(37,99,235,0.6)" : "1px solid transparent",
              borderRadius: 5,
              color: mapMode === mode.id ? "#60a5fa" : "#888",
              cursor: "pointer",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
            }}
          >
            {mode.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Sub-components ---

function MiniTag({ label, color }: { label: string; color?: string }) {
  return (
    <span
      style={{
        fontSize: "0.65rem",
        padding: "1px 6px",
        borderRadius: 3,
        backgroundColor: color ? `${color}18` : "rgba(255,255,255,0.06)",
        color: color ?? "#888",
        border: `1px solid ${color ? `${color}30` : "rgba(255,255,255,0.08)"}`,
        textTransform: "capitalize",
      }}
    >
      {label}
    </span>
  );
}

function TooltipBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem" }}>
      <span style={{ color: "#666", width: 65, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 3, backgroundColor: "#222", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontWeight: 600, color: "#ccc", width: 16, textAlign: "right" }}>{value}</span>
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  background: "rgba(0,0,0,0.65)",
  color: "#ccc",
  border: "1px solid #444",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "15px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 0.15s",
};
