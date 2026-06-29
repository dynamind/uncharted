import { register } from "./registry.js";

// Perfect b-ary tree of the given depth.
function tree(levels = 4, branch = 2) {
  const nodes = [{ id: 0 }], edges = [];
  let frontier = [0];
  for (let l = 1; l < levels; l++) {
    const next = [];
    for (const p of frontier) {
      for (let b = 0; b < branch; b++) {
        const id = nodes.length; nodes.push({ id });
        edges.push({ source: p, target: id }); next.push(id);
      }
    }
    frontier = next;
  }
  return { nodes, edges };
}

register({ id: "tree", label: "Binary tree", build: () => tree(5, 2) });
