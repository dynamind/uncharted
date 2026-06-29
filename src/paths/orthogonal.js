import { orthogonalGeometry } from "../router.js";
import { registerPathEngine } from "./registry.js";

// Orthogonal routing is inherently global: grid A* around node obstacles (+margin),
// per-edge side selection by bend-minimization with hysteresis, and channel
// separation across all edges. It therefore routes the whole graph at once. Its
// polyline IS the logical spine — axis-aligned bends already terminating on
// node-border ports — so we pass the points through unflattened. `sides` carries
// the per-edge side choice the app feeds back as `prev` for hysteresis.
registerPathEngine({
  id: "orthogonal",
  route(graph, bounds, prev) {
    return orthogonalGeometry(graph, bounds, prev)
      .map(g => ({ points: g.poly, a: g.a, b: g.b, sides: g.sides }));
  },
});
