/* ============================================================================
   crossings/index.js — CrossingEngine aggregator.

   The pipeline imports `./src/crossings` and never touches individual engines.
   Each self-registers on import. To add a strategy: drop a file here that calls
   registerCrossingEngine(), then add one side-effect import below.
   ========================================================================== */

export { crossingEngines, getCrossingEngine } from "./registry.js";

import "./default.js";
