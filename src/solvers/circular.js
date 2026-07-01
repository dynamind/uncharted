/* ============================================================================
   solvers/circular.js — nodes on a ring; BFS order + reorder. Cheap contrast.
   ========================================================================== */

import { registerSolver } from "./registry.js";
import { makeConstructive } from "./constructive.js";

// BFS order around a ring (adjacency-friendly, fewer crossings than id order).
function circularTargets(graph, bounds) {
  const { nodes, edges } = graph;
  const adj = nodes.map(() => []);
  edges.forEach(e => { adj[e.source].push(e.target); adj[e.target].push(e.source); });
  const order = [], seen = new Array(nodes.length).fill(false);
  for (let s = 0; s < nodes.length; s++) {
    if (seen[s]) continue;
    seen[s] = true; const q = [s];
    while (q.length) { const u = q.shift(); order.push(u);
      for (const v of adj[u]) if (!seen[v]) { seen[v] = true; q.push(v); } }
  }
  const cx = (bounds.x0+bounds.x1)/2, cy = (bounds.y0+bounds.y1)/2;
  const R = Math.min(bounds.x1-bounds.x0, bounds.y1-bounds.y0) * 0.42;
  const t = new Array(nodes.length);
  order.forEach((id, idx) => {
    const a = idx / order.length * Math.PI*2 - Math.PI/2;
    t[id] = { x: cx + Math.cos(a)*R, y: cy + Math.sin(a)*R };
  });
  return t;
}

registerSolver({ id: "circular", create: makeConstructive("circular", circularTargets) });
