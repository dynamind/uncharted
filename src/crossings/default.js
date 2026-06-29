import { Nodes } from "../router.js";
import { registerCrossingEngine } from "./registry.js";

function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

// Segment intersection for crossing DETECTION. Unlike Geo.segInt (used by the solver's
// center-to-center chord Objective, which rejects hits at segment ENDPOINTS so adjacent
// chords meeting at a shared node centre don't read as a crossing), this is INCLUSIVE of
// endpoints — because the rendered polylines attach at distinct border ports, not a shared
// centre, so there is no shared-endpoint phantom to suppress. The endpoint rejection was
// fatal for curves: a curve's crossings cluster at its bulge-apex vertices, and a hit landing
// on an internal vertex sits at t≈1/u≈0 of the adjacent segments → Geo.segInt dropped it.
// (That made dense curved graphs like K₆ report ~6 instead of ~15 crossings, with no hops.)
function segHit(a1, a2, b1, b2) {
  const dx1 = a2.x-a1.x, dy1 = a2.y-a1.y, dx2 = b2.x-b1.x, dy2 = b2.y-b1.y;
  const den = dx1*dy2 - dy1*dx2;
  if (Math.abs(den) < 1e-9) return null;            // parallel / collinear
  const t = ((b1.x-a1.x)*dy2 - (b1.y-a1.y)*dx2) / den;
  const u = ((b1.x-a1.x)*dy1 - (b1.y-a1.y)*dx1) / den;
  if (t < -1e-9 || t > 1+1e-9 || u < -1e-9 || u > 1+1e-9) return null;
  return { x: a1.x + t*dx1, y: a1.y + t*dy1 };
}

function polyIntersections(pa, pb) {
  const res = [];
  for (let i = 1; i < pa.length; i++) {
    const a1 = pa[i-1], a2 = pa[i];
    for (let j = 1; j < pb.length; j++) {
      const h = segHit(a1, a2, pb[j-1], pb[j]);
      // A crossing on a shared polyline vertex is found on the 2–4 segment pairs meeting
      // there (same geometric point), so merge hits within ~1px → one count per crossing.
      if (h && !res.some(r => Math.abs(r.x-h.x) < 1 && Math.abs(r.y-h.y) < 1)) res.push(h);
    }
  }
  return res;
}

// The default crossing engine.
//
// Unlike the solver's straight-line Objective, siblings are NOT skipped. Two edges
// sharing a source or target only fail to cross when drawn straight; curved edges
// leaving a shared node can bulge toward each other and cross BETWEEN the nodes, and
// that crossing must get a hop. (Geo.segInt ignores intersections at the segments'
// own endpoints, so the point where incident edges actually meet — the shared node —
// never registers a phantom hop.)
registerCrossingEngine({
  id: "default",
  crossings(geom) {
    const out = [], bb = geom.map(g => bbox(g.poly));
    for (let i = 0; i < geom.length; i++) {
      const ba = bb[i];
      for (let j = i+1; j < geom.length; j++) {
        const bj = bb[j];
        if (ba.x1 < bj.x0 || bj.x1 < ba.x0 || ba.y1 < bj.y0 || bj.y1 < ba.y0) continue;
        for (const h of polyIntersections(geom[i].poly, geom[j].poly))
          out.push({ x: h.x, y: h.y, eA: i, eB: j });
      }
    }
    return out;
  },
  // edges whose RENDERED polyline runs through a non-incident node's body — the
  // parallel-to-nothing case segInt can't see (a line ploughing across a node).
  // One hit per (edge, node). Counted in the HUD so the metric can't lie.
  pierces(geom, nodes) {
    const out = [];
    for (let i = 0; i < geom.length; i++) {
      const g = geom[i], p = g.poly;
      for (const n of nodes) {
        if (n === g.a || n === g.b) continue;
        for (let s = 1; s < p.length; s++)
          if (Nodes.segHitsBody(n, p[s-1].x, p[s-1].y, p[s].x, p[s].y)) { out.push({ eA: i, node: n }); break; }
      }
    }
    return out;
  },
});
