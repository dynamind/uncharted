import { Geo } from "../router.js";
import { registerRenderer, tangentsOf } from "./registry.js";

const RADIUS = 8;          // corner fillet radius (px)
const FILLET_SAMPLES = 6;  // bézier samples per rounded corner

// "Smooth orthogonal": the same axis-aligned bend spine the orthogonal PathEngine
// produces, but every interior corner is rounded. At each bend V we trim back by
// `r` along both incident segments to A and B (r clamped to half the shorter segment
// so fillets never overlap), then replace the sharp corner with a quadratic bézier
// A→(control V)→B. Endpoints are left untouched, so the final approach into a node
// stays straight (axis-aligned) and the arrowhead still points along the axis.
registerRenderer({
  id: "rounded",
  render(path) {
    const pts = path.points;
    if (pts.length <= 2) return { poly: pts, tangents: tangentsOf(pts) };
    const poly = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const V = pts[i], prev = pts[i-1], next = pts[i+1];
      const pdx = prev.x - V.x, pdy = prev.y - V.y, pl = Math.hypot(pdx, pdy) || 1;
      const ndx = next.x - V.x, ndy = next.y - V.y, nl = Math.hypot(ndx, ndy) || 1;
      const r = Math.min(RADIUS, pl/2, nl/2);
      const A = { x: V.x + pdx/pl*r, y: V.y + pdy/pl*r };
      const B = { x: V.x + ndx/nl*r, y: V.y + ndy/nl*r };
      for (const p of Geo.sampleQuad(A, V, B, FILLET_SAMPLES)) poly.push(p);   // A … B, rounding the corner
    }
    poly.push(pts[pts.length - 1]);
    return { poly, tangents: tangentsOf(poly) };
  },
});
