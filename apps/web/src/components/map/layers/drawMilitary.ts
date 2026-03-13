import type { RenderContext } from "./types";
import { formatTroops, roundRect, drawStar, hexToRgb } from "./types";

export function drawMilitary(rc: RenderContext) {
  const { ctx, w, h, zoom, geoToScreen, provinces, nations, wars, hoveredProvince, mapMode } = rc;

  // --- Capital indicators ---
  if (zoom > 2.5) {
    for (const [, prov] of Object.entries(provinces)) {
      if (!prov.isCapital) continue;
      const [cx, cy] = geoToScreen(prov.center[0], prov.center[1]);
      if (cx < -20 || cx > w + 20 || cy < -20 || cy > h + 20) continue;

      const starSize = zoom > 5 ? 5 : zoom > 3 ? 4 : 3;
      const yOff = zoom > 5 ? 16 : zoom > 3 ? 12 : 8;

      // Star glow
      ctx.fillStyle = "rgba(251,191,36,0.3)";
      ctx.beginPath();
      drawStar(ctx, cx, cy - yOff, starSize + 1, 5);
      ctx.fill();

      // Star
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      drawStar(ctx, cx, cy - yOff, starSize, 5);
      ctx.fill();
    }
  }

  // --- Army indicators ---
  const armyMinZoom = mapMode === "military" ? 1.5 : 2.5;
  if (zoom > armyMinZoom) {
    for (const [, nation] of Object.entries(nations)) {
      for (const army of nation.military.armies) {
        const prov = provinces[army.location];
        if (!prov) continue;

        const totalTroops = army.units.infantry + army.units.cavalry + army.units.artillery;
        if (totalTroops <= 0) continue;

        const [cx, cy] = geoToScreen(prov.center[0], prov.center[1]);
        if (cx < -30 || cx > w + 30 || cy < -30 || cy > h + 30) continue;

        const yOffset = zoom > 5 ? 22 : 14;
        const nationColor = rc.getNationColor(nation.id);
        const isHovered = prov.id === hoveredProvince;

        // Expanded view when hovered
        if (isHovered && zoom > 3) {
          drawExpandedArmy(ctx, cx, cy + yOffset, army.units, nationColor, totalTroops);
        } else {
          drawArmyPill(ctx, cx, cy + yOffset, totalTroops, nationColor, zoom);
        }
      }
    }
  }

  // --- Fort indicators ---
  const fortMinZoom = mapMode === "military" ? 2 : 3;
  if (zoom > fortMinZoom) {
    for (const [, prov] of Object.entries(provinces)) {
      if (prov.fortLevel <= 0) continue;
      const [cx, cy] = geoToScreen(prov.center[0], prov.center[1]);
      if (cx < -20 || cx > w + 20 || cy < -20 || cy > h + 20) continue;

      const fx = cx + (zoom > 3 ? 16 : 12);
      const fy = cy - (zoom > 3 ? 10 : 7);

      // Fort icon background
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      roundRect(ctx, fx - 8, fy - 6, 16, 12, 2);
      ctx.fill();

      // Fort text
      ctx.fillStyle = "#999";
      ctx.font = "bold 7px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`F${prov.fortLevel}`, fx, fy);
    }
  }

  // --- Port icons ---
  if (zoom > 4.5) {
    for (const [, prov] of Object.entries(provinces)) {
      if (!prov.hasPort) continue;
      const [cx, cy] = geoToScreen(prov.center[0], prov.center[1]);
      if (cx < -20 || cx > w + 20 || cy < -20 || cy > h + 20) continue;

      const iconX = cx - (zoom > 3 ? 16 : 12);
      const iconY = cy - (zoom > 3 ? 10 : 7);
      const sz = zoom > 3 ? 5 : 4;

      // Anchor icon
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;

      // Ring at top
      ctx.beginPath();
      ctx.arc(iconX, iconY - sz * 0.4, sz * 0.25, 0, Math.PI * 2);
      ctx.stroke();

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(iconX, iconY - sz * 0.15);
      ctx.lineTo(iconX, iconY + sz * 0.7);
      ctx.stroke();

      // Horizontal bar
      ctx.beginPath();
      ctx.moveTo(iconX - sz * 0.4, iconY + sz * 0.4);
      ctx.lineTo(iconX + sz * 0.4, iconY + sz * 0.4);
      ctx.stroke();

      // Curved bottom
      ctx.beginPath();
      ctx.arc(iconX, iconY + sz * 0.7, sz * 0.35, 0, Math.PI, false);
      ctx.stroke();

      ctx.globalAlpha = 1;
    }
  }

  // --- Battle markers ---
  if (wars) {
    for (const war of wars) {
      for (const battle of war.battles.slice(-3)) {
        const prov = provinces[battle.province];
        if (!prov) continue;
        const [bx, by] = geoToScreen(prov.center[0], prov.center[1]);
        if (bx < -20 || bx > w + 20 || by < -20 || by > h + 20) continue;

        const sz = zoom > 3 ? 8 : 5;

        // Glow
        ctx.strokeStyle = "rgba(248,113,113,0.3)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bx - sz, by - sz);
        ctx.lineTo(bx + sz, by + sz);
        ctx.moveTo(bx + sz, by - sz);
        ctx.lineTo(bx - sz, by + sz);
        ctx.stroke();

        // Cross
        ctx.strokeStyle = "#f87171";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(bx - sz, by - sz);
        ctx.lineTo(bx + sz, by + sz);
        ctx.moveTo(bx + sz, by - sz);
        ctx.lineTo(bx - sz, by + sz);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
}

function drawArmyPill(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  totalTroops: number, nationColor: string,
  zoom: number
) {
  const text = formatTroops(totalTroops);
  ctx.font = "bold 9px sans-serif";
  const textWidth = ctx.measureText(text).width;
  const pillW = textWidth + 16;
  const pillH = 15;
  const pillX = cx - pillW / 2;
  const pillY = cy - pillH / 2;

  // Nation-colored pill background
  const rgb = hexToRgb(nationColor);
  if (rgb) {
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.8)`;
  } else {
    ctx.fillStyle = "rgba(60,60,80,0.8)";
  }
  roundRect(ctx, pillX, pillY, pillW, pillH, 4);
  ctx.fill();

  // Dark border
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.8;
  roundRect(ctx, pillX, pillY, pillW, pillH, 4);
  ctx.stroke();

  // Sword icon (left side)
  if (zoom > 3.5) {
    const ix = pillX + 6;
    const iy = cy;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(ix - 2, iy - 3);
    ctx.lineTo(ix + 2, iy + 3);
    ctx.moveTo(ix + 2, iy - 3);
    ctx.lineTo(ix - 2, iy + 3);
    ctx.stroke();
  }

  // Troop count text
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx + (zoom > 3.5 ? 2 : 0), cy);
}

function drawExpandedArmy(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  units: { infantry: number; cavalry: number; artillery: number },
  nationColor: string, totalTroops: number
) {
  const text = `${formatTroops(totalTroops)}`;
  const detailText = `I:${formatTroops(units.infantry)} C:${formatTroops(units.cavalry)} A:${formatTroops(units.artillery)}`;
  ctx.font = "bold 8px sans-serif";
  const textW = Math.max(
    ctx.measureText(text).width,
    ctx.measureText(detailText).width
  );
  const pillW = textW + 20;
  const pillH = 26;
  const pillX = cx - pillW / 2;
  const pillY = cy - pillH / 2;

  // Background
  const rgb = hexToRgb(nationColor);
  if (rgb) {
    ctx.fillStyle = `rgba(${Math.max(0, rgb.r - 20)},${Math.max(0, rgb.g - 20)},${Math.max(0, rgb.b - 20)},0.9)`;
  } else {
    ctx.fillStyle = "rgba(40,40,60,0.9)";
  }
  roundRect(ctx, pillX, pillY, pillW, pillH, 5);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 0.8;
  roundRect(ctx, pillX, pillY, pillW, pillH, 5);
  ctx.stroke();

  // Total
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 9px sans-serif";
  ctx.fillText(text, cx, cy - 5);

  // Composition bar
  const barW = pillW - 8;
  const barH = 2;
  const barX = pillX + 4;
  const barY = cy + 2;
  const total = units.infantry + units.cavalry + units.artillery;
  if (total > 0) {
    const infW = (units.infantry / total) * barW;
    const cavW = (units.cavalry / total) * barW;
    const artW = (units.artillery / total) * barW;

    ctx.fillStyle = "#4ade80";
    ctx.fillRect(barX, barY, infW, barH);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(barX + infW, barY, cavW, barH);
    ctx.fillStyle = "#f87171";
    ctx.fillRect(barX + infW + cavW, barY, artW, barH);
  }

  // Detail text
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 6px sans-serif";
  ctx.fillText(detailText, cx, cy + 8);
}
