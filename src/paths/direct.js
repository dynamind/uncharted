import { getPortStrategy } from "../ports/index.js";
import { registerPathEngine } from "./registry.js";

// The basic A→B spine, shared by straight and curved routing. Each endpoint's port
// comes from the node's shape PortStrategy, which spreads a node's several incident
// edges across its border (so siblings fan apart instead of stacking on one point).
// Both ports lie on the border, so the path has no point inside either node body —
// a curved renderer sampling between them approaches the target from OUTSIDE, and
// the arrowhead can never flip to point back out of the node.
registerPathEngine({
  id: "direct",
  route(graph) {
    const { nodes, edges } = graph;
    // collect each node's incident edges (with the far node, for direction + fan order)
    const incident = nodes.map(() => []);
    edges.forEach((e, ei) => {
      incident[e.source].push({ ei, end: 0, far: nodes[e.target] });
      incident[e.target].push({ ei, end: 1, far: nodes[e.source] });
    });
    // ask each node's shape strategy to place its ports, keyed by (edge, end)
    const port = new Map();
    nodes.forEach((n, ni) => {
      const pts = getPortStrategy(n.shape || "circle").assign(n, incident[ni]);
      incident[ni].forEach((inc, i) => port.set(inc.ei * 2 + inc.end, pts[i]));
    });
    return edges.map((e, ei) => ({
      points: [port.get(ei * 2), port.get(ei * 2 + 1)],
      a: nodes[e.source], b: nodes[e.target],
    }));
  },
});
