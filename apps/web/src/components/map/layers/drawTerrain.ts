import type { RenderContext } from "./types";
import { getProvinceRings } from "../../../hooks/useMapData";

export function drawTerrain(rc: RenderContext) {
  const { ctx, zoom, geoToScreen, provinces, provinceBounds, isInViewport } = rc;

  // Show terrain from zoom 1.8 (lowered from 2.5)
  if (zoom < 1.8) return;

  const densityFactor = zoom > 4 ? 0.7 : zoom > 2.5 ? 1 : 1.5;

  for (const [id, prov] of Object.entries(provinces)) {
    const bounds = provinceBounds.get(id);
    if (bounds && !isInViewport(bounds)) continue;

    const terrain = prov.terrain;
    if (terrain === "plains" || terrain === "coastal" || terrain === "ocean") continue;

    const rings = getProvinceRings(prov);

    for (const ring of rings) {
      if (ring.length < 3) continue;

      ctx.save();

      // Build clip path
      ctx.beginPath();
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = geoToScreen(ring[i][0], ring[i][1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.clip();

      // Compute bounding box in screen coords
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [lon, lat] of ring) {
        const [x, y] = geoToScreen(lon, lat);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      if (terrain === "mountains") {
        drawMountains(ctx, minX, minY, maxX, maxY, densityFactor, zoom);
      } else if (terrain === "forest") {
        drawForest(ctx, minX, minY, maxX, maxY, densityFactor, false);
      } else if (terrain === "jungle") {
        drawForest(ctx, minX, minY, maxX, maxY, densityFactor * 0.7, true);
      } else if (terrain === "desert") {
        drawDesert(ctx, minX, minY, maxX, maxY, densityFactor);
      } else if (terrain === "hills") {
        drawHills(ctx, minX, minY, maxX, maxY, densityFactor);
      } else if (terrain === "marsh") {
        drawMarsh(ctx, minX, minY, maxX, maxY, densityFactor);
      } else if (terrain === "arctic") {
        drawArctic(ctx, minX, minY, maxX, maxY, densityFactor);
      }

      ctx.restore();
    }
  }
}

function drawMountains(
  ctx: CanvasRenderingContext2D,
  minX: number, minY: number, maxX: number, maxY: number,
  density: number, zoom: number
) {
  const spacing = Math.round(9 * density);
  for (let px = minX; px < maxX; px += spacing) {
    for (let py = minY; py < maxY; py += spacing) {
      // Pseudo-random size variation
      const sizeVar = Math.sin(px * 0.7 + py * 1.3) * 0.5 + 0.5;
      const sz = 2 + sizeVar * 3;

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.moveTo(px + 1, py + sz + 1);
      ctx.lineTo(px + sz + 1, py - sz + 1);
      ctx.lineTo(px + sz * 2 + 1, py + sz + 1);
      ctx.closePath();
      ctx.fill();

      // Mountain body
      ctx.fillStyle = `rgba(${160 + Math.round(sizeVar * 30)},${140 + Math.round(sizeVar * 20)},${110 + Math.round(sizeVar * 30)},0.28)`;
      ctx.beginPath();
      ctx.moveTo(px, py + sz);
      ctx.lineTo(px + sz, py - sz);
      ctx.lineTo(px + sz * 2, py + sz);
      ctx.closePath();
      ctx.fill();

      // Snow cap at high zoom
      if (zoom > 5 && sizeVar > 0.4) {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.beginPath();
        ctx.arc(px + sz, py - sz + 1, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawForest(
  ctx: CanvasRenderingContext2D,
  minX: number, minY: number, maxX: number, maxY: number,
  density: number, isJungle: boolean
) {
  const spacing = Math.round((isJungle ? 8 : 11) * density);
  for (let px = minX; px < maxX; px += spacing) {
    for (let py = minY; py < maxY; py += spacing) {
      const offsetX = ((Math.floor(py / spacing)) % 2) * (spacing / 2);
      const tx = px + offsetX;

      // Color variation
      const gVar = Math.sin(tx * 0.5 + py * 0.3) * 15;
      const baseG = isJungle ? 65 : 85;
      const alpha = isJungle ? 0.22 : 0.18;

      // Trunk
      ctx.strokeStyle = `rgba(60,50,30,${alpha})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(tx, py + 2);
      ctx.lineTo(tx, py);
      ctx.stroke();

      // Canopy
      ctx.fillStyle = `rgba(${isJungle ? 20 : 35},${baseG + gVar},${isJungle ? 15 : 30},${alpha})`;
      ctx.beginPath();
      ctx.arc(tx, py - 1, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawDesert(
  ctx: CanvasRenderingContext2D,
  minX: number, minY: number, maxX: number, maxY: number,
  density: number
) {
  const spacing = Math.round(14 * density);

  // Dune arcs
  ctx.strokeStyle = "rgba(210,190,120,0.2)";
  ctx.lineWidth = 0.8;
  for (let px = minX; px < maxX; px += spacing) {
    for (let py = minY; py < maxY; py += spacing) {
      const curveVar = Math.sin(px * 0.3 + py * 0.2) * 2;
      ctx.beginPath();
      ctx.arc(px, py + curveVar, 5, 0.1, Math.PI - 0.1, false);
      ctx.stroke();
    }
  }

  // Sand dots
  ctx.fillStyle = "rgba(210,190,120,0.15)";
  for (let px = minX; px < maxX; px += spacing * 0.5) {
    for (let py = minY; py < maxY; py += spacing * 0.5) {
      const offset = ((Math.floor(py / (spacing * 0.5))) % 2) * 4;
      ctx.beginPath();
      ctx.arc(px + offset, py, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawHills(
  ctx: CanvasRenderingContext2D,
  minX: number, minY: number, maxX: number, maxY: number,
  density: number
) {
  const spacing = Math.round(13 * density);
  ctx.strokeStyle = "rgba(160,140,100,0.2)";
  ctx.lineWidth = 0.6;

  for (let px = minX; px < maxX; px += spacing) {
    for (let py = minY; py < maxY; py += spacing) {
      // Outer contour arc
      ctx.beginPath();
      ctx.arc(px + 3, py, 4, Math.PI, 0);
      ctx.stroke();
      // Inner contour arc
      ctx.strokeStyle = "rgba(160,140,100,0.13)";
      ctx.beginPath();
      ctx.arc(px + 3, py, 2.5, Math.PI, 0);
      ctx.stroke();
      ctx.strokeStyle = "rgba(160,140,100,0.2)";
    }
  }
}

function drawMarsh(
  ctx: CanvasRenderingContext2D,
  minX: number, minY: number, maxX: number, maxY: number,
  density: number
) {
  const spacing = Math.round(12 * density);

  for (let px = minX; px < maxX; px += spacing) {
    for (let py = minY; py < maxY; py += spacing) {
      // Reeds (vertical strokes)
      ctx.strokeStyle = "rgba(60,100,50,0.22)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(px, py + 3);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + 2, py + 3);
      ctx.lineTo(px + 2, py + 0.5);
      ctx.stroke();

      // Water squiggle
      ctx.strokeStyle = "rgba(70,130,170,0.15)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(px - 3, py + 4);
      ctx.quadraticCurveTo(px, py + 3, px + 3, py + 4);
      ctx.stroke();
    }
  }
}

function drawArctic(
  ctx: CanvasRenderingContext2D,
  minX: number, minY: number, maxX: number, maxY: number,
  density: number
) {
  const spacing = Math.round(14 * density);
  ctx.strokeStyle = "rgba(220,235,250,0.2)";
  ctx.lineWidth = 0.5;

  for (let px = minX; px < maxX; px += spacing) {
    for (let py = minY; py < maxY; py += spacing) {
      const r = 2;
      // 6-pointed snowflake (3 lines through center)
      for (let a = 0; a < 3; a++) {
        const angle = (a * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(angle) * r, py + Math.sin(angle) * r);
        ctx.lineTo(px - Math.cos(angle) * r, py - Math.sin(angle) * r);
        ctx.stroke();
      }
    }
  }
}
