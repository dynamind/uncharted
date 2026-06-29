import { register } from "./registry.js";

// k loosely-connected dense clusters of `per` nodes each, chained by their heads.
function clusters(k = 3, per = 6) {
  const nodes = [], edges = [];
  const heads = [];
  for (let c = 0; c < k; c++) {
    const base = nodes.length, head = base;
    for (let i = 0; i < per; i++) nodes.push({ id: nodes.length });
    for (let i = 0; i < per; i++) for (let j = i+1; j < per; j++)
      if (Math.random() < 0.55) edges.push({ source: base+i, target: base+j });
    heads.push(head);
  }
  for (let c = 1; c < k; c++) edges.push({ source: heads[c-1], target: heads[c] });
  return { nodes, edges };
}

register({ id: "clusters", label: "Clusters", build: () => clusters(3, 6) });
