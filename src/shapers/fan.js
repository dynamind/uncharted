import { registerShaper } from "./registry.js";

const MAX_BULGE = 34, BULGE_FRAC = 0.11;   // perpendicular bulge = min(MAX, len*FRAC) * lean
const BASE = 1;                            // gentle consistent bow for a fully isolated edge
const CLUSTER_GAP = Math.PI / 2;           // >90° between adjacent edges starts a new cluster
const TAU = 2 * Math.PI;

// Fan rank of every path at every node. Incident edges are sorted by the angle to their
// far node, rotated to start after the LARGEST gap, then split into CLUSTERS wherever
// adjacent edges are more than CLUSTER_GAP apart. Splay (a centered rank) is assigned
// WITHIN each cluster — so only edges that are actually bunched compete for fan slots.
// An angularly isolated edge (e.g. a node's lone incoming "trunk", or a straight-through
// chain link) is a singleton cluster: rank 0, m 1 → it casts no splay vote and runs
// straight. This is what lets a fan-out node's two children splay APART instead of the
// far-away trunk shoving both onto the same side. rank ∈ [-1,1] within the cluster;
// m = cluster size; k = total edges at the node.
function rankPaths(paths) {
  const byNode = new Map();
  const add = (node, far, pi, end) => {
    const ang = Math.atan2(far.y - node.y, far.x - node.x);
    (byNode.get(node) || byNode.set(node, []).get(node)).push({ pi, end, ang });
  };
  paths.forEach((p, pi) => { add(p.a, p.b, pi, 0); add(p.b, p.a, pi, 1); });
  const rank = new Map();
  for (const arr of byNode.values()) {
    const k = arr.length;
    if (k === 1) { rank.set(arr[0].pi + ":" + arr[0].end, { r: 0, m: 1, k }); continue; }
    arr.sort((u, v) => u.ang - v.ang || u.pi - v.pi);
    let start = 0, widest = -Infinity;                 // edge just after the largest gap
    for (let i = 0; i < k; i++) {
      const next = (i + 1) % k;
      let gap = arr[next].ang - arr[i].ang; if (gap <= 0) gap += TAU;
      if (gap > widest) { widest = gap; start = next; }
    }
    const seq = Array.from({ length: k }, (_, j) => arr[(start + j) % k]);
    let lo = 0;                                         // current cluster runs seq[lo..hi-1]
    for (let hi = 1; hi <= k; hi++) {
      let split = hi === k;                             // the wrap (largest gap) closes the last cluster
      if (!split) { let gap = seq[hi].ang - seq[hi-1].ang; if (gap < 0) gap += TAU; split = gap > CLUSTER_GAP; }
      if (!split) continue;
      const m = hi - lo;
      for (let j = lo; j < hi; j++) {
        const it = seq[j];
        rank.set(it.pi + ":" + it.end, { r: m === 1 ? 0 : -1 + 2*(j - lo)/(m - 1), m, k });
      }
      lo = hi;
    }
  }
  return rank;
}

// One control point can only bow one way, but each end "votes" on which way (to splay
// its own fan cluster). Resolve the vote by STRENGTH: the end where this edge sits
// further from its cluster center (larger |rank|) needs the bend more and wins. An end
// in a singleton cluster (isolated edge there) has no opinion and yields; an edge
// isolated at BOTH ends still gets a gentle base bow, unless it is a genuine fan center
// (rank 0 in a real cluster), which runs straight.
//
// The bow is applied along the source→target chord's perpendicular. A rank is "left of
// the node looking outward", which aligns with that perpendicular only at the SOURCE
// end; at the TARGET end the node looks back along target→source, so a target-end win
// is NEGATED. Without this, a fan-IN bows inward (left-most edge curves right) and its
// edges converge and cross — flipping makes fan-in splay outward, mirroring fan-out.
function lean(s, t) {
  if (s.k === 1 && t.k === 1) return BASE;
  const rs = s.m > 1 ? s.r : 0, rt = t.m > 1 ? t.r : 0;
  return Math.abs(rs) >= Math.abs(rt) ? rs : -rt;
}

// Fan-order curve shaping. One control point per edge → a consistent C-curve (never an
// S). Edges sharing a node splay apart by fan rank instead of bulging into each other;
// the middle of an odd fan goes straight (the natural symmetric trunk). This replaced
// two earlier attempts: the index-parity sign (siblings curved together and crossed,
// issue #1), and per-end leans that AVERAGED (→ a lopsided straight edge beside a
// bulging sibling) or drove a CUBIC (→ S-curves when the two ends' ranks disagreed).
registerShaper({
  id: "fan",
  shape(paths) {
    const rank = rankPaths(paths);
    return paths.map((p, pi) => {
      if (p.points.length !== 2) return p;             // only shape simple 2-port spines
      const [p0, p1] = p.points;
      const L = lean(rank.get(pi + ":0"), rank.get(pi + ":1"));
      const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
      const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
      const off = Math.min(MAX_BULGE, len * BULGE_FRAC) * L;
      const c = { x: mx - dy/len*off, y: my + dx/len*off };
      return { ...p, points: [p0, c, p1] };            // insert the single control point
    });
  },
});
