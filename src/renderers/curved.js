import { Geo } from "../router.js";
import { registerRenderer, tangentsOf } from "./registry.js";

const SAMPLES = 18;        // bézier samples per curved edge

// Flatten a 2-point border-to-border spine into a quadratic bézier that bulges
// perpendicular to the chord, sampled to a polyline. The endpoints ARE the border
// ports, so the whole curve lies outside both node bodies (no centre-anchored
// samples → no arrowhead flip). The bulge sign alternates by edge index so
// parallel edges between the same pair fan apart; a later pass replaces that with
// a geometry-aware bulge. Spines that already carry interior points (orthogonal /
// hand-edited) are drawn straight through them.
registerRenderer({
  id: "curved",
  render(path, ctx = {}) {
    const pts = path.points;
    if (pts.length !== 2) return { poly: pts, tangents: tangentsOf(pts) };
    const [p0, p1] = pts, i = ctx.index || 0;
    const mx = (p0.x+p1.x)/2, my = (p0.y+p1.y)/2;
    const dx = p1.x-p0.x, dy = p1.y-p0.y, len = Math.hypot(dx, dy) || 1;
    const off = Math.min(34, len*0.11) * ((i % 2) ? 1 : -1);
    const c = { x: mx - dy/len*off, y: my + dx/len*off };
    const poly = Geo.sampleQuad(p0, c, p1, SAMPLES);
    return { poly, tangents: tangentsOf(poly) };
  },
});
