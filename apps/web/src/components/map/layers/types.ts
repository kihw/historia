import type { Province, Nation, War } from "@historia/shared";

export type MapMode = "political" | "terrain" | "trade" | "diplomatic" | "military";

export interface ProvinceBoundsRect {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export interface WorldFeature {
  rings: number[][][];
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  zoom: number;
  geoToScreen: (lon: number, lat: number) => [number, number];
  provinces: Record<string, Province>;
  nations: Record<string, Nation>;
  wars?: War[];
  provinceBounds: Map<string, ProvinceBoundsRect>;
  isInViewport: (bounds: ProvinceBoundsRect) => boolean;
  selectedProvince?: string | null;
  hoveredProvince?: string | null;
  worldFeatures: WorldFeature[] | null;
  getNationColor: (nationId: string) => string;
  mapMode: MapMode;
  playerNation?: string | null;
}

// --- Color helpers ---

export function lightenColor(hex: string, percent: number): string {
  if (hex.startsWith("hsl")) return hex;
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return hex;
  const num = parseInt(cleaned, 16);
  if (isNaN(num)) return hex;
  const r = Math.min(255, ((num >> 16) & 0xff) + percent);
  const g = Math.min(255, ((num >> 8) & 0xff) + percent);
  const b = Math.min(255, (num & 0xff) + percent);
  return `rgb(${r},${g},${b})`;
}

export function darkenColor(hex: string, amount: number): string {
  if (hex.startsWith("hsl") || hex.startsWith("rgb")) return hex;
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return hex;
  const num = parseInt(cleaned, 16);
  if (isNaN(num)) return hex;
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `rgb(${r},${g},${b})`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return null;
  const num = parseInt(cleaned, 16);
  if (isNaN(num)) return null;
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

export function formatTroops(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  points: number
) {
  const step = Math.PI / points;
  ctx.moveTo(cx, cy - r);
  for (let i = 0; i < 2 * points; i++) {
    const radius = i % 2 === 0 ? r : r * 0.4;
    const angle = i * step - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  ctx.closePath();
}
