import { registerShaper } from "./registry.js";

const MAX_BULGE = 34, BULGE_FRAC = 0.11;   // perpendicular bulge = min(MAX, len*FRAC) * lean
const BASE = 1;                            // gentle consistent bow for a fully isolated edge

// Centered fan rank of every path at every node. Incident paths are sorted by the
// angle to their far node, then the order is rotated to START right after the LARGEST
// angular gap — the empty wedge "behind" the fan. That makes the fan's center the
// middle of the occupied arc (robust to the ±π wrap, where a naive atan2 sort would
// pick the wrong center), so the two edges bordering the gap are the extremes and the
// dead-center edge runs straight. rank ∈ [-1, 1] across the arc; k = paths at the node.
function rankPaths(paths) {
  const byNode = new Map();
  const add = (node, far, pi, end) => {
    const ang = Math.atan2(far.y - node.y, far.x - node.x);
    (byNode.get(node) || byNode.set(node, []).get(node)).push({ pi, end, ang });
  };
  paths.forEach((p, pi) => { add(p.a, p.b, pi, 0); add(p.b, p.a, pi, 1); });
  const rank = new Map();
  const TAU = 2 * Math.PI;
  for (const arr of byNode.values()) {
    const k = arr.length;
    if (k === 1) { rank.set(arr[0].pi + ":" + arr[0].end, { r: 0, k }); continue; }
    arr.sort((u, v) => u.ang - v.ang || u.pi - v.pi);
    let start = 0, widest = -Infinity;                 // edge just after the largest gap
    for (let i = 0; i < k; i++) {
      const next = (i + 1) % k;
      let gap = arr[next].ang - arr[i].ang; if (gap <= 0) gap += TAU;
      if (gap > widest) { widest = gap; start = next; }
    }
    for (let j = 0; j < k; j++) {
      const it = arr[(start + j) % k];
      rank.set(it.pi + ":" + it.end, { r: -1 + 2*j/(k - 1), k });
    }
  }
  return rank;
}

// The bow comes from the MORE-crowded end's fan rank (ties → source): that hub's fan
// dictates the splay, and the quieter end just follows. A leaf end contributes nothing;
// an edge isolated at both ends gets a gentle base bow.
function lean(s, t) {
  if (s.k === 1 && t.k === 1) return BASE;
  if (s.k >= t.k) return s.k > 1 ? s.r : 0;
  return t.k > 1 ? t.r : 0;
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
