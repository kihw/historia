import type { RenderContext } from "./types";

export function drawOcean(rc: RenderContext) {
  const { ctx, w, h, zoom, geoToScreen } = rc;

  // --- Deep ocean base with radial depth gradient ---
  const centerX = w / 2;
  const centerY = h * 0.45;
  const maxR = Math.max(w, h) * 0.8;
  const depthGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxR);
  depthGrad.addColorStop(0, "#0b1e30");
  depthGrad.addColorStop(0.4, "#081828");
  depthGrad.addColorStop(1, "#040e18");
  ctx.fillStyle = depthGrad;
  ctx.fillRect(0, 0, w, h);

  // --- Latitude-based ocean color bands ---
  for (let lat = 85; lat > -85; lat -= 5) {
    const [x1, y1] = geoToScreen(-180, lat);
    const [x2, y2] = geoToScreen(180, lat - 5);
    if (y2 < 0 || y1 > h) continue;

    const absLat = Math.abs(lat - 2.5);
    const warmth = 1 - absLat / 85;
    const r = Math.round(6 + warmth * 12);
    const g = Math.round(16 + warmth * 18);
    const b = Math.round(30 + warmth * 22);
    ctx.fillStyle = `rgba(${r},${g},${b},0.4)`;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }

  // --- Ocean wave pattern ---
  if (zoom > 0.8) {
    const alpha = zoom > 2 ? 0.04 : 0.025;
    ctx.strokeStyle = `rgba(100,150,200,${alpha})`;
    ctx.lineWidth = 0.5;
    const waveSpacing = zoom > 3 ? 6 : zoom > 2 ? 10 : zoom > 1 ? 16 : 24;
    for (let sy = 0; sy < h; sy += waveSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, sy);
      for (let sx = 0; sx < w; sx += 16) {
        const latFactor = Math.abs(sy - h / 2) / h;
        const amp = 1.5 + latFactor * 2;
        const waveY =
          sy +
          Math.sin(sx * 0.015 + sy * 0.008) * amp +
          Math.sin(sx * 0.007 - sy * 0.003) * amp * 0.6;
        ctx.lineTo(sx, waveY);
      }
      ctx.stroke();
    }
  }

  // --- Polar ice caps (Arctic) ---
  const [, arcticTop] = geoToScreen(0, 90);
  const [, arcticBot] = geoToScreen(0, 70);
  if (arcticBot > 0 && arcticTop < h) {
    const arcticGrad = ctx.createLinearGradient(0, arcticTop, 0, arcticBot);
    arcticGrad.addColorStop(0, "rgba(200,220,240,0.28)");
    arcticGrad.addColorStop(0.5, "rgba(180,210,235,0.12)");
    arcticGrad.addColorStop(1, "rgba(160,200,230,0)");
    ctx.fillStyle = arcticGrad;
    const [iceL] = geoToScreen(-180, 90);
    const [iceR] = geoToScreen(180, 90);

    // Irregular edge via sine modulation
    ctx.beginPath();
    ctx.moveTo(iceL, arcticTop);
    ctx.lineTo(iceR, arcticTop);
    for (let sx = iceR; sx >= iceL; sx -= 4) {
      const edgeY = arcticBot + Math.sin(sx * 0.03) * 8 + Math.sin(sx * 0.01) * 5;
      ctx.lineTo(sx, edgeY);
    }
    ctx.closePath();
    ctx.fill();

    // Ice texture dots
    if (zoom > 0.8) {
      ctx.fillStyle = "rgba(220,235,250,0.08)";
      const iceSpacing = zoom > 2 ? 8 : 14;
      for (let px = Math.max(0, iceL); px < Math.min(w, iceR); px += iceSpacing) {
        for (let py = Math.max(0, arcticTop); py < Math.min(h, arcticBot); py += iceSpacing) {
          const fade = 1 - (py - arcticTop) / (arcticBot - arcticTop);
          if (fade < 0.15) continue;
          ctx.globalAlpha = fade * 0.12;
          ctx.beginPath();
          ctx.arc(px + (py % 2) * 4, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // --- Antarctic ice ---
  const [, antarcticTop] = geoToScreen(0, -65);
  const [, antarcticBot] = geoToScreen(0, -90);
  if (antarcticTop < h && antarcticBot > 0) {
    const antGrad = ctx.createLinearGradient(0, antarcticTop, 0, antarcticBot);
    antGrad.addColorStop(0, "rgba(160,200,230,0)");
    antGrad.addColorStop(0.5, "rgba(180,210,235,0.12)");
    antGrad.addColorStop(1, "rgba(200,220,240,0.3)");
    ctx.fillStyle = antGrad;
    const [iceL] = geoToScreen(-180, -65);
    const [iceR] = geoToScreen(180, -65);

    ctx.beginPath();
    for (let sx = iceL; sx <= iceR; sx += 4) {
      const edgeY = antarcticTop + Math.sin(sx * 0.025) * 8 + Math.sin(sx * 0.012) * 4;
      if (sx === iceL) ctx.moveTo(sx, edgeY);
      else ctx.lineTo(sx, edgeY);
    }
    ctx.lineTo(iceR, antarcticBot);
    ctx.lineTo(iceL, antarcticBot);
    ctx.closePath();
    ctx.fill();

    if (zoom > 0.8) {
      ctx.fillStyle = "rgba(220,235,250,0.08)";
      const iceSpacing = zoom > 2 ? 8 : 14;
      for (let px = Math.max(0, iceL); px < Math.min(w, iceR); px += iceSpacing) {
        for (let py = Math.max(0, antarcticTop); py < Math.min(h, antarcticBot); py += iceSpacing) {
          const fade = (py - antarcticTop) / (antarcticBot - antarcticTop);
          if (fade < 0.15) continue;
          ctx.globalAlpha = fade * 0.12;
          ctx.beginPath();
          ctx.arc(px + (py % 2) * 4, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // --- Grid lines (adaptive) ---
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 0.5;
  const gridStep = zoom > 5 ? 5 : zoom > 2 ? 10 : 30;
  for (let lon = -180; lon <= 180; lon += gridStep) {
    const [x1, y1] = geoToScreen(lon, 85);
    const [, y2] = geoToScreen(lon, -85);
    if (x1 < -10 || x1 > w + 10) continue;
    ctx.globalAlpha = gridStep === 5 ? 0.02 : gridStep === 10 ? 0.03 : 0.04;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1, y2);
    ctx.stroke();
  }
  for (let lat = -80; lat <= 80; lat += gridStep) {
    const [x1, y1] = geoToScreen(-180, lat);
    const [x2] = geoToScreen(180, lat);
    if (y1 < -10 || y1 > h + 10) continue;
    ctx.globalAlpha = gridStep === 5 ? 0.02 : gridStep === 10 ? 0.03 : 0.04;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- Special latitude lines (tropics, circles) ---
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 6]);
  for (const lat of [23.44, -23.44, 66.56, -66.56]) {
    const [x1, y1] = geoToScreen(-180, lat);
    const [x2] = geoToScreen(180, lat);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
