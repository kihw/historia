"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { GeoJSONCollection, GeoJSONFeature } from "@historia/shared";
import {
  loadHistoricalGeoJSON,
  loadModernWorld,
  loadAvailableEras,
  getYearLabel,
  KEY_ERAS,
} from "../../lib/historical-data";

interface HistoricalWorldMapProps {
  /** Initial year to display */
  initialYear?: number;
  /** Callback when a country is clicked */
  onCountryClick?: (feature: GeoJSONFeature) => void;
  /** CSS height of the map container */
  height?: string;
  /** Whether to show the timeline controls */
  showTimeline?: boolean;
  /** Optional overlay: provinces from a scenario to render on top */
  overlayProvinces?: Array<{
    polygon: [number, number][];
    color: string;
    name: string;
  }>;
  /** External year control */
  year?: number;
  /** External year change callback */
  onYearChange?: (year: number) => void;
}

interface MapState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// Deterministic color from country name
function countryColor(name: string, alpha = 0.7): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const sat = 40 + (Math.abs(hash >> 8) % 30);
  const light = 40 + (Math.abs(hash >> 16) % 25);
  return `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
}

function countryBorderColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 30%, 25%)`;
}

export function HistoricalWorldMap({
  initialYear = 2010,
  onCountryClick,
  height = "600px",
  showTimeline = true,
  overlayProvinces,
  year: externalYear,
  onYearChange,
}: HistoricalWorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapStateRef = useRef<MapState>({ offsetX: 0, offsetY: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const [currentYear, setCurrentYear] = useState(externalYear ?? initialYear);
  const [geoData, setGeoData] = useState<GeoJSONCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync with external year
  useEffect(() => {
    if (externalYear !== undefined && externalYear !== currentYear) {
      setCurrentYear(externalYear);
    }
  }, [externalYear]);

  // Load available years on mount
  useEffect(() => {
    loadAvailableEras()
      .then((eras) => setAvailableYears(eras.map((e) => e.year)))
      .catch(() => {});
  }, []);

  // Load data when year changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        let data: GeoJSONCollection;
        if (currentYear === 9999) {
          data = await loadModernWorld();
        } else {
          data = await loadHistoricalGeoJSON(currentYear);
        }
        if (!cancelled) {
          setGeoData(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load map data");
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [currentYear]);

  // Projection: equirectangular (lon/lat -> screen coords)
  const geoToScreen = useCallback(
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

  // Render
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geoData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background: ocean
    ctx.fillStyle = "#1a2a3a";
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x1, y1] = geoToScreen(lon, 90, canvas);
      const [x2, y2] = geoToScreen(lon, -90, canvas);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    for (let lat = -90; lat <= 90; lat += 30) {
      const [x1, y1] = geoToScreen(-180, lat, canvas);
      const [x2, y2] = geoToScreen(180, lat, canvas);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw country polygons
    for (const feature of geoData.features) {
      const name =
        feature.properties.NAME ||
        feature.properties.ADMIN ||
        feature.properties.SOVEREIGNT ||
        "Unknown";

      const isHovered = hoveredCountry === name;

      const rings: number[][][] =
        feature.geometry.type === "MultiPolygon"
          ? (feature.geometry.coordinates as number[][][][]).flat()
          : (feature.geometry.coordinates as number[][][]);

      for (const ring of rings) {
        ctx.beginPath();
        let first = true;
        for (const coord of ring) {
          const [x, y] = geoToScreen(coord[0], coord[1], canvas);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();

        ctx.fillStyle = isHovered
          ? countryColor(name, 0.9)
          : countryColor(name, 0.7);
        ctx.fill();

        ctx.strokeStyle = isHovered
          ? "#ffffff"
          : countryBorderColor(name);
        ctx.lineWidth = isHovered ? 1.5 : 0.5;
        ctx.stroke();
      }
    }

    // Draw overlay provinces (from scenario)
    if (overlayProvinces) {
      for (const prov of overlayProvinces) {
        ctx.beginPath();
        let first = true;
        for (const [lon, lat] of prov.polygon) {
          const [x, y] = geoToScreen(lon, lat, canvas);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.fillStyle = prov.color + "88";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Draw country labels at high enough zoom
    if (mapStateRef.current.zoom > 1.5) {
      ctx.font = `${Math.max(9, 11 * mapStateRef.current.zoom * 0.3)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const feature of geoData.features) {
        const name =
          feature.properties.NAME ||
          feature.properties.ADMIN ||
          "Unknown";

        // Compute centroid from first polygon ring
        const firstRing =
          feature.geometry.type === "MultiPolygon"
            ? (feature.geometry.coordinates as number[][][][])[0][0]
            : (feature.geometry.coordinates as number[][][])[0];

        if (!firstRing || firstRing.length === 0) continue;

        let cx = 0,
          cy = 0;
        for (const coord of firstRing) {
          cx += coord[0];
          cy += coord[1];
        }
        cx /= firstRing.length;
        cy /= firstRing.length;

        const [sx, sy] = geoToScreen(cx, cy, canvas);

        // Only draw if on screen
        if (sx > -50 && sx < w + 50 && sy > -50 && sy < h + 50) {
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillText(name, sx + 1, sy + 1);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(name, sx, sy);
        }
      }
    }

    // Year label
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(10, 10, 200, 36);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(getYearLabel(currentYear), 20, 18);

    // Country count
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#aaa";
    ctx.fillText(`${geoData.features.length} entités`, 20, 38);
  }, [geoData, hoveredCountry, currentYear, overlayProvinces, geoToScreen]);

  // Canvas resize + animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      draw();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // Redraw on state change
  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - mapStateRef.current.offsetX,
      y: e.clientY - mapStateRef.current.offsetY,
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (isDraggingRef.current) {
        mapStateRef.current.offsetX = e.clientX - dragStartRef.current.x;
        mapStateRef.current.offsetY = e.clientY - dragStartRef.current.y;
        draw();
        return;
      }

      // Hit test for hover
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setMousePos({ x: e.clientX, y: e.clientY });

      if (!geoData) return;

      // Point-in-polygon test
      const [lon, lat] = screenToGeo(sx, sy, canvas);
      let found: string | null = null;

      for (const feature of geoData.features) {
        const rings: number[][][] =
          feature.geometry.type === "MultiPolygon"
            ? (feature.geometry.coordinates as number[][][][]).flat()
            : (feature.geometry.coordinates as number[][][]);

        for (const ring of rings) {
          if (pointInRing(lon, lat, ring)) {
            found =
              feature.properties.NAME ||
              feature.properties.ADMIN ||
              "Unknown";
            break;
          }
        }
        if (found) break;
      }

      setHoveredCountry(found);
    },
    [geoData, draw, screenToGeo]
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      mapStateRef.current.zoom = Math.max(
        0.3,
        Math.min(20, mapStateRef.current.zoom * delta)
      );
      draw();
    },
    [draw]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onCountryClick || !geoData) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const [lon, lat] = screenToGeo(sx, sy, canvas);

      for (const feature of geoData.features) {
        const rings: number[][][] =
          feature.geometry.type === "MultiPolygon"
            ? (feature.geometry.coordinates as number[][][][]).flat()
            : (feature.geometry.coordinates as number[][][]);

        for (const ring of rings) {
          if (pointInRing(lon, lat, ring)) {
            onCountryClick(feature);
            return;
          }
        }
      }
    },
    [geoData, onCountryClick, screenToGeo]
  );

  // Year change
  const changeYear = useCallback(
    (year: number) => {
      setCurrentYear(year);
      onYearChange?.(year);
    },
    [onYearChange]
  );

  // Playback: animate through eras
  useEffect(() => {
    if (!isPlaying || availableYears.length === 0) return;

    playIntervalRef.current = setInterval(() => {
      setCurrentYear((prev) => {
        const idx = availableYears.indexOf(prev);
        const nextIdx = idx >= availableYears.length - 1 ? 0 : idx + 1;
        const nextYear = availableYears[nextIdx];
        onYearChange?.(nextYear);
        if (nextIdx === 0) setIsPlaying(false);
        return nextYear;
      });
    }, 2000);

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, availableYears, onYearChange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: "relative",
          minHeight: height,
          background: "#1a2a3a",
          cursor: isDraggingRef.current ? "grabbing" : "grab",
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onClick={handleClick}
          style={{ display: "block", width: "100%", height: "100%" }}
        />

        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              color: "#fff",
              fontSize: "16px",
            }}
          >
            Chargement de la carte {getYearLabel(currentYear)}...
          </div>
        )}

        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.7)",
              color: "#ff6666",
              fontSize: "14px",
              padding: "20px",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Tooltip */}
        {hoveredCountry && (
          <div
            style={{
              position: "fixed",
              left: mousePos.x + 12,
              top: mousePos.y - 30,
              background: "rgba(0,0,0,0.85)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "13px",
              pointerEvents: "none",
              zIndex: 1000,
              whiteSpace: "nowrap",
            }}
          >
            {hoveredCountry}
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
            gap: 4,
          }}
        >
          <button
            onClick={() => {
              mapStateRef.current.zoom = Math.min(
                20,
                mapStateRef.current.zoom * 1.3
              );
              draw();
            }}
            style={zoomBtnStyle}
          >
            +
          </button>
          <button
            onClick={() => {
              mapStateRef.current.zoom = Math.max(
                0.3,
                mapStateRef.current.zoom / 1.3
              );
              draw();
            }}
            style={zoomBtnStyle}
          >
            -
          </button>
          <button
            onClick={() => {
              mapStateRef.current = { offsetX: 0, offsetY: 0, zoom: 1 };
              draw();
            }}
            style={zoomBtnStyle}
            title="Réinitialiser la vue"
          >
            R
          </button>
        </div>
      </div>

      {/* Timeline Controls */}
      {showTimeline && (
        <TimelineControls
          currentYear={currentYear}
          availableYears={availableYears}
          isPlaying={isPlaying}
          onYearChange={changeYear}
          onPlayToggle={() => setIsPlaying(!isPlaying)}
        />
      )}
    </div>
  );
}

// --- Timeline Controls ---

function TimelineControls({
  currentYear,
  availableYears,
  isPlaying,
  onYearChange,
  onPlayToggle,
}: {
  currentYear: number;
  availableYears: number[];
  isPlaying: boolean;
  onYearChange: (year: number) => void;
  onPlayToggle: () => void;
}) {
  const gameRelevantYears = availableYears.filter((y) => y >= -3000);

  return (
    <div
      style={{
        background: "#1e1e2e",
        borderTop: "1px solid #333",
        padding: "12px 16px",
      }}
    >
      {/* Era quick select */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        {KEY_ERAS.map((era) => {
          const targetYear = era.year;
          const isActive = currentYear === targetYear;
          return (
            <button
              key={era.year}
              onClick={() => onYearChange(targetYear)}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                background: isActive ? "#4a9eff" : "#2a2a3e",
                color: isActive ? "#fff" : "#aaa",
                border: isActive ? "1px solid #4a9eff" : "1px solid #444",
                borderRadius: 4,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {era.label}
            </button>
          );
        })}
      </div>

      {/* Slider + play */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onPlayToggle}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: isPlaying ? "#ff4444" : "#4a9eff",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isPlaying ? "||" : "\u25B6"}
        </button>

        <input
          type="range"
          min={0}
          max={gameRelevantYears.length - 1}
          value={gameRelevantYears.indexOf(currentYear)}
          onChange={(e) => {
            const idx = Number(e.target.value);
            if (gameRelevantYears[idx] !== undefined) {
              onYearChange(gameRelevantYears[idx]);
            }
          }}
          style={{ flex: 1 }}
        />

        <select
          value={currentYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
          style={{
            background: "#2a2a3e",
            color: "#ddd",
            border: "1px solid #444",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: "13px",
          }}
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>
              {getYearLabel(y)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// --- Utilities ---

function pointInRing(
  x: number,
  y: number,
  ring: number[][]
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const zoomBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  background: "rgba(0,0,0,0.6)",
  color: "#fff",
  border: "1px solid #555",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: "16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
