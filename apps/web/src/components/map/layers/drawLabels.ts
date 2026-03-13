import type { RenderContext } from "./types";

// Resource display config
const RESOURCE_DISPLAY: Record<string, { letter: string; color: string }> = {
  grain: { letter: "G", color: "#d4a017" },
  wine: { letter: "W", color: "#8b2252" },
  iron: { letter: "I", color: "#8a8a8a" },
  gold: { letter: "$", color: "#ffd700" },
  coal: { letter: "C", color: "#555" },
  oil: { letter: "O", color: "#333" },
  cotton: { letter: "T", color: "#ddd" },
  spices: { letter: "S", color: "#ff6347" },
  silk: { letter: "K", color: "#dda0dd" },
  fish: { letter: "F", color: "#4682b4" },
  wood: { letter: "L", color: "#8b5513" },
  copper: { letter: "U", color: "#b87333" },
  salt: { letter: "A", color: "#ccc" },
};

export function drawLabels(rc: RenderContext) {
  const { ctx, w, h, zoom, geoToScreen, provinces, nations } = rc;

  // --- Country names (large, spanning territory) ---
  if (zoom > 1.2 && zoom < 6) {
    drawCountryNames(rc);
  }

  // --- Province names ---
  if (zoom > 3.5) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.max(7, Math.min(13, zoom * 2));
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;

    // Fade country names out as province names appear
    const provAlpha = zoom < 5 ? Math.min(1, (zoom - 3.5) / 1.5) : 1;

    for (const [, prov] of Object.entries(provinces)) {
      const [cx, cy] = geoToScreen(prov.center[0], prov.center[1]);
      if (cx < -50 || cx > w + 50 || cy < -50 || cy > h + 50) continue;

      ctx.globalAlpha = provAlpha;

      // Text shadow
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 0.6 * provAlpha;
      ctx.fillText(prov.displayName, cx + 1, cy + 1);

      // Text
      ctx.globalAlpha = provAlpha;
      ctx.fillStyle = "#e0e0e0";
      ctx.fillText(prov.displayName, cx, cy);
    }
    ctx.globalAlpha = 1;
  }

  // --- Resource icons ---
  if (zoom > 4.5) {
    drawResourceIcons(rc);
  }
}

function drawCountryNames(rc: RenderContext) {
  const { ctx, w, h, zoom, geoToScreen, provinces, nations } = rc;

  // Compute nation label positions
  for (const [nationId, nation] of Object.entries(nations)) {
    if (nation.provinces.length === 0) continue;

    let sumLon = 0, sumLat = 0, count = 0;
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;

    for (const provId of nation.provinces) {
      const prov = provinces[provId];
      if (!prov) continue;
      sumLon += prov.center[0];
      sumLat += prov.center[1];
      minLon = Math.min(minLon, prov.center[0]);
      maxLon = Math.max(maxLon, prov.center[0]);
      minLat = Math.min(minLat, prov.center[1]);
      maxLat = Math.max(maxLat, prov.center[1]);
      count++;
    }
    if (count === 0) continue;

    const centerLon = sumLon / count;
    const centerLat = sumLat / count;
    const spanLon = maxLon - minLon;

    const [sx, sy] = geoToScreen(centerLon, centerLat);
    if (sx < -100 || sx > w + 100 || sy < -100 || sy > h + 100) continue;

    // Font size proportional to territory span
    const fontSize = Math.max(8, Math.min(28, spanLon * zoom * 0.12 + 4));

    // Alpha fades as we zoom in past threshold
    let alpha: number;
    if (zoom < 3.5) {
      alpha = Math.min(0.16, zoom * 0.04);
    } else {
      // Fade out as province names appear
      alpha = Math.max(0, 0.16 - (zoom - 3.5) * 0.06);
    }
    if (alpha <= 0.01) continue;

    const text = nation.name.toUpperCase();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${fontSize}px Georgia, 'Times New Roman', serif`;
    ctx.globalAlpha = alpha;

    // Draw characters with letter spacing
    const letterSpacing = Math.max(1, spanLon * zoom * 0.04);
    const chars = text.split("");
    const totalWidth = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + letterSpacing, -letterSpacing);
    let curX = sx - totalWidth / 2;

    // Shadow
    ctx.fillStyle = "#000000";
    for (const ch of chars) {
      const chW = ctx.measureText(ch).width;
      ctx.fillText(ch, curX + chW / 2 + 1, sy + 1);
      curX += chW + letterSpacing;
    }

    // Text
    curX = sx - totalWidth / 2;
    ctx.fillStyle = `rgba(255,255,255,1)`;
    for (const ch of chars) {
      const chW = ctx.measureText(ch).width;
      ctx.fillText(ch, curX + chW / 2, sy);
      curX += chW + letterSpacing;
    }

    ctx.restore();
  }
}

function drawResourceIcons(rc: RenderContext) {
  const { ctx, w, h, zoom, geoToScreen, provinces } = rc;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 6px sans-serif";

  for (const [, prov] of Object.entries(provinces)) {
    if (prov.resources.length === 0) continue;

    const [cx, cy] = geoToScreen(prov.center[0], prov.center[1]);
    if (cx < -30 || cx > w + 30 || cy < -30 || cy > h + 30) continue;

    const yOffset = zoom > 5 ? 12 : 9;
    const startX = cx - (prov.resources.length * 8) / 2;

    for (let i = 0; i < Math.min(prov.resources.length, 5); i++) {
      const res = prov.resources[i];
      const display = RESOURCE_DISPLAY[res];
      if (!display) continue;

      const rx = startX + i * 8;
      const ry = cy + yOffset;

      // Background circle
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.arc(rx, ry, 4, 0, Math.PI * 2);
      ctx.fill();

      // Colored ring
      ctx.strokeStyle = display.color;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(rx, ry, 4, 0, Math.PI * 2);
      ctx.stroke();

      // Letter
      ctx.fillStyle = display.color;
      ctx.fillText(display.letter, rx, ry);
    }
  }
}
