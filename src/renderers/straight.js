import { registerRenderer, tangentsOf } from "./registry.js";

// Connects the spine points with straight segments — the polyline IS the spine.
// Used for straight routing and for drawing orthogonal paths (their bends are
// already the rendered polyline; only the corners differ from a future rounded
// orthogonal renderer).
registerRenderer({
  id: "straight",
  render(path) {
    const poly = path.points;
    return { poly, tangents: tangentsOf(poly) };
  },
});
