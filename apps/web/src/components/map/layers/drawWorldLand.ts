import type { RenderContext } from "./types";

export function drawWorldLand(rc: RenderContext) {
  const { ctx, w, h, zoom, geoToScreen, worldFeatures } = rc;
  if (!worldFeatures) return;

  for (const feature of worldFeatures) {
    for (const ring of feature.rings) {
      if (ring.length < 3) continue;

      // Compute bounding box for gradient
      let minY = Infinity, maxY = -Infinity;
      const screenPoints: [number, number][] = [];
      for (const coord of ring) {
        const [x, y] = geoToScreen(coord[0], coord[1]);
        screenPoints.push([x, y]);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      // Quick viewport cull
      let minX = Infinity, maxX = -Infinity;
      for (const [x] of screenPoints) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      if (maxX < -50 || minX > w + 50 || maxY < -50 || minY > h + 50) continue;

      ctx.beginPath();
      let first = true;
      for (const [x, y] of screenPoints) {
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Gradient fill (lighter at top, darker at bottom)
      const grad = ctx.createLinearGradient(0, minY, 0, maxY);
      grad.addColorStop(0, "#243848");
      grad.addColorStop(1, "#182430");
      ctx.fillStyle = grad;
      ctx.fill();

      // Coastline glow (wide soft stroke)
      ctx.strokeStyle = "rgba(20,50,80,0.2)";
      ctx.lineWidth = zoom > 2 ? 4 : 2.5;
      ctx.stroke();

      // Crisp coastline
      ctx.strokeStyle = "#2a3a4a";
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
  }

  // Continental shelf glow (second pass with thicker stroke for depth illusion)
  if (zoom > 0.5) {
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "rgba(40,80,120,1)";
    ctx.lineWidth = zoom > 2 ? 8 : 5;
    for (const feature of worldFeatures) {
      for (const ring of feature.rings) {
        if (ring.length < 3) continue;
        ctx.beginPath();
        let first = true;
        for (const coord of ring) {
          const [x, y] = geoToScreen(coord[0], coord[1]);
          if (first) { ctx.moveTo(x, y); first = false; }
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
