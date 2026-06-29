import { register } from "./registry.js";

// Fan-out → fan-in: one divergence + one convergence, to showcase per-side port
// distribution. Split's BOTTOM fans to N workers; Merge's TOP receives them all —
// both sides should comb into evenly-spaced ports.
register({
  id: "spindle",
  label: "Fan-out / fan-in",
  prefer: { solver: "layered", routing: "orthogonal", arrows: true },
  build() {
    const mids = ["A", "B", "C", "D", "E"];
    const defs = ["Split", ...mids, "Merge"];
    const nodes = defs.map((label, i) => ({ id: i, label, shape: "rect", w: 66, h: 38 }));
    const split = 0, merge = defs.length - 1;
    const E = (s, t) => ({ source: s, target: t });
    const edges = [];
    mids.forEach((_, k) => { const m = 1 + k; edges.push(E(split, m), E(m, merge)); });
    return { nodes, edges };
  },
});
