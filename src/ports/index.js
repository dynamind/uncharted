/* ============================================================================
   ports/index.js — PortStrategy aggregator.

   The direct PathEngine imports `./src/ports` and asks getPortStrategy(node.shape)
   to place a node's ports. Each strategy self-registers on import. To add one: drop
   a file here that calls registerPortStrategy(), then add a side-effect import.
   ========================================================================== */

export { portStrategies, getPortStrategy } from "./registry.js";

import "./boundary.js";
