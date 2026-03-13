import type { RenderContext } from "./types";

export function drawAtmosphere(rc: RenderContext) {
  const { ctx, w, h, zoom } = rc;

  // --- Vignette effect ---
  const vignette = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.35,
    w / 2, h / 2, Math.min(w, h) * 0.75
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.7, "rgba(0,0,0,0.08)");
  vignette.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // --- Subtle grain at lower zoom (parchment feel) ---
  if (zoom < 2.5) {
    const grainAlpha = Math.max(0.01, 0.025 - zoom * 0.008);
    ctx.globalAlpha = grainAlpha;
    ctx.fillStyle = "rgba(255,255,255,1)";
    // Deterministic noise-like pattern
    const spacing = 8;
    for (let px = 0; px < w; px += spacing) {
      for (let py = 0; py < h; py += spacing) {
        // Pseudo-random based on position
        const v = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453;
        const frac = v - Math.floor(v);
        if (frac > 0.7) {
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
