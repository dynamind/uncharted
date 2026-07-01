/* ============================================================================
   solvers/annealing.js — Simulated Annealing (Davidson–Harel) & Hill Climbing.

   Both explore the same neighborhood — nudge one node by a cooling radius —
   but annealing sometimes accepts a worse layout (prob e^(-ΔC/T)) to escape
   local minima, while hill climbing never does. Run them on the same graph to
   watch greed get stuck. We evaluate ΔC *locally* (only edges/nodes touching
   the moved node) so thousands of proposals stay cheap.

   Registered from one file (rather than one file per solver, like the other
   registries) because they're two parameterizations of the same closure, not
   independently-implemented algorithms.
   ========================================================================== */

import { Geo, Nodes } from "../router.js";
import { Objective } from "../objective.js";
import { registerSolver } from "./registry.js";

function makeAnnealer(greedy) {
  return (graph, bounds, params) => {
    const { nodes, edges } = graph;
    const W = bounds.x1 - bounds.x0, H = bounds.y1 - bounds.y0;
    const k = Objective.idealK(graph, bounds);
    const md = Objective.minDist;
    const adj = nodes.map(() => []);
    edges.forEach((e, i) => { adj[e.source].push(i); adj[e.target].push(i); });

    let T = Math.min(W, H) * 0.5;          // drives both move radius & acceptance
    const Tmin = 0.6;
    let iter = 0;

    // cost of just the parts that change when node i moves
    function localCost(i) {
      const w = params.weights;
      let cr = 0, lenPen = 0, ov = 0;
      const n = nodes[i];
      for (const ei of adj[i]) {
        const e = edges[ei], a = nodes[e.source], b = nodes[e.target];
        lenPen += Math.abs(Geo.dist(a.x, a.y, b.x, b.y) - k) / k;
        for (let fj = 0; fj < edges.length; fj++) {
          if (fj === ei) continue;
          const f = edges[fj];
          if (e.source===f.source || e.source===f.target ||
              e.target===f.source || e.target===f.target) continue;
          const c = nodes[f.source], d = nodes[f.target];
          if (Geo.segInt(a.x,a.y,b.x,b.y, c.x,c.y,d.x,d.y)) cr++;
        }
        // this edge piercing any non-incident node (it moved with i)
        for (let k2 = 0; k2 < nodes.length; k2++) {
          if (k2 === e.source || k2 === e.target) continue;
          if (Nodes.segHitsBody(nodes[k2], a.x,a.y,b.x,b.y)) cr++;
        }
      }
      // other edges now piercing node i (i moved into/out of them)
      for (let fj = 0; fj < edges.length; fj++) {
        const f = edges[fj];
        if (f.source === i || f.target === i) continue;
        const c = nodes[f.source], d = nodes[f.target];
        if (Nodes.segHitsBody(n, c.x,c.y,d.x,d.y)) cr++;
      }
      for (let j = 0; j < nodes.length; j++) {
        if (j === i) continue;
        const d = Geo.dist(n.x, n.y, nodes[j].x, nodes[j].y);
        if (d < md) ov += (md - d);
      }
      return w.cross*cr*10 + w.len*lenPen + w.overlap*(ov/md);
    }

    return {
      name: greedy ? "hillclimb" : "annealing",
      get done() { return T < Tmin; },
      get iter() { return iter; },
      get temp() { return T; },
      step() {
        iter++;
        const radius = T;
        for (let s = 0; s < nodes.length; s++) {
          const i = (Math.random() * nodes.length) | 0;
          const n = nodes[i];
          if (n.fixed) continue;
          const before = localCost(i);
          const ox = n.x, oy = n.y;
          n.x = Geo.clamp(ox + (Math.random()*2-1)*radius, bounds.x0, bounds.x1);
          n.y = Geo.clamp(oy + (Math.random()*2-1)*radius, bounds.y0, bounds.y1);
          const dC = localCost(i) - before;
          const accept = greedy ? (dC < 0) : (dC <= 0 || Math.random() < Math.exp(-dC / T));
          if (!accept) { n.x = ox; n.y = oy; }
        }
        T *= (params.cooling ?? 0.97);     // geometric cooling
      },
    };
  };
}

registerSolver({ id: "annealing", create: makeAnnealer(false) });
registerSolver({ id: "hillclimb", create: makeAnnealer(true) });
