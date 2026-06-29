import { Nodes } from "../router.js";
import { registerPortStrategy } from "./registry.js";

// The default strategy: one port per edge, placed where the ray to the far node
// crosses this node's border. Nodes.boundary already snaps correctly for every shape
// (circle rim, rect face, diamond edge), so this single-port attach is the organic
// look for straight/curved. No spreading — sibling crossings are handled by the
// curve's geometry-aware bulge, not by separating the attach points. A spreading
// strategy could be registered per shape later as an opt-in.
registerPortStrategy({
  shape: "default",
  assign(node, incident) {
    return incident.map(inc => Nodes.boundary(node, inc.far.x, inc.far.y));
  },
});
