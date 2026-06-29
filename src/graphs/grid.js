import { register } from "./registry.js";

// w×h 4-neighbour grid lattice.
function grid(w = 6, h = 5) {
  const nodes = [], edges = [];
  const idx = (x, y) => y*w + x;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nodes.push({ id: idx(x,y) });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < w-1) edges.push({ source: idx(x,y), target: idx(x+1,y) });
    if (y < h-1) edges.push({ source: idx(x,y), target: idx(x,y+1) });
  }
  return { nodes, edges };
}

register({ id: "grid", label: "Grid lattice 6×5", build: () => grid(6, 5) });
