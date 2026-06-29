import { register } from "./registry.js";

// Q₃ hypercube graph (3-cube): nodes 0..7, edge between numbers differing in one bit.
function cube() {
  const nodes = Array.from({ length: 8 }, (_, id) => ({ id })), edges = [];
  for (let i = 0; i < 8; i++) for (let b = 0; b < 3; b++) {
    const j = i ^ (1 << b);
    if (i < j) edges.push({ source: i, target: j });
  }
  return { nodes, edges };
}

register({ id: "cube", label: "Cube graph Q₃", build: () => cube() });
