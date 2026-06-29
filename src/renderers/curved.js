import { Geo } from "../router.js";
import { registerRenderer, tangentsOf } from "./registry.js";

const SAMPLES = 18;        // bézier samples per curved edge

// Sample a quadratic bézier to a polyline. The fan shaper hands us a 3-point spine
// [p0, control, p1] whose control point bows the curve so siblings splay apart (see
// shapers/fan.js). The endpoints are border ports, so the whole curve lies outside
// both node bodies (no centre-anchored samples → no arrowhead flip).
//
// If a bare 2-point spine arrives (shaper bypassed), fall back to a gentle consistent
// perpendicular bulge so it still reads as curved; an orthogonal/hand-edited spine with
// more points is drawn straight through them.
registerRenderer({
  id: "curved",
  render(path) {
    const pts = path.points;
    if (pts.length === 3) {
      const poly = Geo.sampleQuad(pts[0], pts[1], pts[2], SAMPLES);
      return { poly, tangents: tangentsOf(poly) };
    }
    if (pts.length === 2) {
      const [p0, p1] = pts;
      const mx = (p0.x+p1.x)/2, my = (p0.y+p1.y)/2;
      const dx = p1.x-p0.x, dy = p1.y-p0.y, len = Math.hypot(dx, dy) || 1;
      const off = Math.min(34, len*0.11);
      const c = { x: mx - dy/len*off, y: my + dx/len*off };
      const poly = Geo.sampleQuad(p0, c, p1, SAMPLES);
      return { poly, tangents: tangentsOf(poly) };
    }
    return { poly: pts, tangents: tangentsOf(pts) };
  },
});
