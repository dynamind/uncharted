import { register } from "./registry.js";

// Erdős–Rényi G(n,p), then chain any isolated nodes so the graph stays connected.
function random(n = 22, p = 0.12) {
  const nodes = Array.from({ length: n }, (_, id) => ({ id })), edges = [];
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++)
    if (Math.random() < p) edges.push({ source: i, target: j });
  const seen = new Set(edges.flatMap(e => [e.source, e.target]));
  for (let i = 0; i < n; i++) if (!seen.has(i))
    edges.push({ source: i, target: (i+1) % n });
  return { nodes, edges };
}

register({ id: "random", label: "Random G(n,p)", build: () => random(22, 0.12) });
