import type { RenderContext } from "./types";
import { lightenColor, darkenColor, hexToRgb } from "./types";
import { getProvinceRings } from "../../../hooks/useMapData";

// Terrain tinting
const TERRAIN_TINT: Record<string, { r: number; g: number; b: number; alpha: number }> = {
  plains: { r: 120, g: 160, b: 80, alpha: 0.2 },
  hills: { r: 140, g: 120, b: 80, alpha: 0.22 },
  mountains: { r: 180, g: 160, b: 140, alpha: 0.3 },
  forest: { r: 30, g: 90, b: 30, alpha: 0.28 },
  desert: { r: 210, g: 190, b: 110, alpha: 0.28 },
  marsh: { r: 70, g: 110, b: 70, alpha: 0.18 },
  coastal: { r: 70, g: 130, b: 170, alpha: 0.15 },
  arctic: { r: 210, g: 230, b: 245, alpha: 0.32 },
  jungle: { r: 15, g: 70, b: 15, alpha: 0.28 },
  ocean: { r: 10, g: 30, b: 60, alpha: 0.5 },
};

// Terrain mode colors
const TERRAIN_COLORS: Record<string, string> = {
  plains: "#7a9e45",
  hills: "#a89060",
  mountains: "#9a8a78",
  forest: "#3a7a30",
  desert: "#d4b870",
  marsh: "#5a8050",
  coastal: "#5a9ab0",
  arctic: "#b0c8d8",
  jungle: "#287028",
  ocean: "#0a1e30",
};

export function drawProvinces(rc: RenderContext) {
  const { ctx, w, h, zoom, geoToScreen, provinces, nations, wars, provinceBounds, isInViewport, selectedProvince, hoveredProvince, getNationColor, mapMode, playerNation } = rc;

  // --- Pre-compute war zone provinces ---
  const warZoneProvinces = new Set<string>();
  if (wars) {
    for (const war of wars) {
      const allNations = [...war.attackers, ...war.defenders];
      for (const [pid, prov] of Object.entries(provinces)) {
        if (allNations.includes(prov.owner)) {
          const hasEnemyArmy = Object.values(nations).some((n) => {
            const isEnemy =
              (war.attackers.includes(n.id) && war.defenders.includes(prov.owner)) ||
              (war.defenders.includes(n.id) && war.attackers.includes(prov.owner));
            return isEnemy && n.military.armies.some((a) => a.location === pid);
          });
          if (hasEnemyArmy) warZoneProvinces.add(pid);
        }
      }
    }
  }

  // --- Pre-compute international borders ---
  const internationalEdges: Array<{ points: [number, number][]; isCoast: boolean }> = [];
  const internalEdges: Array<[number, number][]> = [];

  // --- Draw province fills ---
  for (const [id, prov] of Object.entries(provinces)) {
    const bounds = provinceBounds.get(id);
    if (bounds && !isInViewport(bounds)) continue;

    const isSelected = id === selectedProvince;
    const isHovered = id === hoveredProvince;
    const isWarZone = warZoneProvinces.has(id);
    const rings = getProvinceRings(prov);

    // Determine fill color based on map mode
    let baseColor: string;
    if (mapMode === "terrain") {
      baseColor = TERRAIN_COLORS[prov.terrain] ?? "#555";
    } else if (mapMode === "trade") {
      const intensity = Math.min(1, prov.baseProduction / 8);
      const r = Math.round(40 + intensity * 200);
      const g = Math.round(40 + intensity * 160);
      const b = Math.round(20 + intensity * 20);
      baseColor = `rgb(${r},${g},${b})`;
    } else if (mapMode === "diplomatic" && playerNation) {
      const playerNationObj = nations[playerNation];
      if (prov.owner === playerNation) {
        baseColor = getNationColor(prov.owner);
      } else if (playerNationObj?.diplomacy.alliances.includes(prov.owner)) {
        baseColor = "#2d6a30";
      } else if (playerNationObj?.diplomacy.rivals.includes(prov.owner)) {
        baseColor = "#8a2020";
      } else if (wars?.some(w =>
        (w.attackers.includes(playerNation) && w.defenders.includes(prov.owner)) ||
        (w.defenders.includes(playerNation) && w.attackers.includes(prov.owner))
      )) {
        baseColor = "#cc2020";
      } else {
        baseColor = "#4a4a4a";
      }
    } else if (mapMode === "military") {
      baseColor = darkenColor(getNationColor(prov.owner), 40) || "#333";
    } else {
      baseColor = getNationColor(prov.owner);
    }

    for (const ring of rings) {
      if (ring.length < 3) continue;

      // Compute screen coords and bounding box
      const screenPts: [number, number][] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [lon, lat] of ring) {
        const [x, y] = geoToScreen(lon, lat);
        screenPts.push([x, y]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      // Build path
      const buildPath = () => {
        ctx.beginPath();
        for (let i = 0; i < screenPts.length; i++) {
          if (i === 0) ctx.moveTo(screenPts[i][0], screenPts[i][1]);
          else ctx.lineTo(screenPts[i][0], screenPts[i][1]);
        }
        ctx.closePath();
      };

      // --- Fill with gradient ---
      buildPath();
      if (isSelected) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = lightenColor(baseColor, 50);
        ctx.fill();
      } else if (isHovered) {
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = lightenColor(baseColor, 25);
        ctx.fill();
      } else {
        // Gradient fill for 3D effect
        const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
        const rgb = hexToRgb(baseColor);
        if (rgb && mapMode === "political") {
          grad.addColorStop(0, `rgba(${Math.min(255, rgb.r + 15)},${Math.min(255, rgb.g + 15)},${Math.min(255, rgb.b + 15)},0.68)`);
          grad.addColorStop(1, `rgba(${Math.max(0, rgb.r - 15)},${Math.max(0, rgb.g - 15)},${Math.max(0, rgb.b - 15)},0.55)`);
          ctx.fillStyle = grad;
        } else {
          ctx.globalAlpha = mapMode === "terrain" ? 0.75 : 0.6;
          ctx.fillStyle = baseColor;
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // --- Terrain tint overlay (political mode only) ---
      if (mapMode === "political" && !isSelected && !isHovered) {
        const tint = TERRAIN_TINT[prov.terrain];
        if (tint) {
          buildPath();
          ctx.globalAlpha = tint.alpha;
          ctx.fillStyle = `rgb(${tint.r},${tint.g},${tint.b})`;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // --- Inner glow (subtle highlight) ---
      if (!isSelected && !isHovered && zoom > 1.5) {
        ctx.save();
        buildPath();
        ctx.clip();
        buildPath();
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      // --- War zone hatching ---
      if (isWarZone && !isSelected) {
        ctx.save();
        buildPath();
        ctx.clip();
        ctx.strokeStyle = "rgba(248, 113, 113, 0.3)";
        ctx.lineWidth = 1;
        for (let i = minX - (maxY - minY); i < maxX + (maxY - minY); i += 6) {
          ctx.beginPath();
          ctx.moveTo(i, minY);
          ctx.lineTo(i + (maxY - minY), maxY);
          ctx.stroke();
        }
        ctx.restore();
      }

      // --- Collect border segments for differentiated rendering ---
      // Check if this province has neighbors with different owners
      const hasInternationalBorder = prov.neighbors?.some(
        (nid) => provinces[nid] && provinces[nid].owner !== prov.owner
      );

      if (isSelected) {
        buildPath();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (isHovered) {
        buildPath();
        ctx.strokeStyle = "#cccccc";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Internal border (thin, subtle)
        buildPath();
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }

      // Coastal glow for coastal provinces
      if (prov.isCoastal && !isSelected && !isHovered) {
        buildPath();
        ctx.strokeStyle = "rgba(60,120,180,0.1)";
        ctx.lineWidth = zoom > 2 ? 3 : 2;
        ctx.stroke();
        buildPath();
        ctx.strokeStyle = "rgba(100,160,220,0.2)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
  }

  // --- Second pass: International borders (thicker, brighter) ---
  for (const [id, prov] of Object.entries(provinces)) {
    const bounds = provinceBounds.get(id);
    if (bounds && !isInViewport(bounds)) continue;
    if (id === selectedProvince || id === hoveredProvince) continue;

    const hasInternationalNeighbor = prov.neighbors?.some(
      (nid) => provinces[nid] && provinces[nid].owner !== prov.owner
    );
    if (!hasInternationalNeighbor) continue;

    const rings = getProvinceRings(prov);
    for (const ring of rings) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = geoToScreen(ring[i][0], ring[i][1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = zoom > 3 ? 1.5 : 1;
      ctx.stroke();
    }
  }
}
