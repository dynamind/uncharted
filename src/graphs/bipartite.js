import { register } from "./registry.js";

// Complete bipartite K(a,b) — K(3,3) is the classic non-planar graph.
function bipartite(a = 3, b = 3) {
  const nodes = Array.from({ length: a+b }, (_, id) => ({ id })), edges = [];
  for (let i = 0; i < a; i++) for (let j = 0; j < b; j++)
    edges.push({ source: i, target: a + j });
  return { nodes, edges };
}

register({ id: "bipartite", label: "K₃,₃ (non-planar)", build: () => bipartite(3, 3) });
