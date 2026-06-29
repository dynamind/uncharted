/* ============================================================================
   paths/index.js — PathEngine aggregator.

   The pipeline imports `./src/paths` and never touches individual engines. Each
   engine self-registers on import. To add a routing path: drop a file here that
   calls registerPathEngine(), then add one side-effect import below.
   ========================================================================== */

export { pathEngines, getPathEngine } from "./registry.js";

import "./direct.js";
import "./orthogonal.js";
