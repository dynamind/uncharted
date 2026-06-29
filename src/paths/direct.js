import { Nodes } from "../router.js";
import { registerPathEngine } from "./registry.js";

// The basic A→B spine, shared by straight and curved routing: two points, one on
// each node's border, aimed at the other node's centre. Because both endpoints are
// border ports, the path has no point inside either node body — so a curved
// renderer sampling between them produces a polyline that approaches the target
// from OUTSIDE, and the arrowhead can never flip to point back out of the node.
registerPathEngine({
  id: "direct",
  route(graph) {
    const { nodes, edges } = graph;
    return edges.map(e => {
      const a = nodes[e.source], b = nodes[e.target];
      return { points: [Nodes.boundary(a, b.x, b.y), Nodes.boundary(b, a.x, a.y)], a, b };
    });
  },
});
