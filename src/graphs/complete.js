import { register } from "./registry.js";

// Complete graph Kₙ — K₅ is non-planar.
function complete(n = 6) {
  const nodes = Array.from({ length: n }, (_, id) => ({ id })), edges = [];
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++)
    edges.push({ source: i, target: j });
  return { nodes, edges };
}

register({ id: "complete", label: "K₆ (dense)", build: () => complete(6) });
