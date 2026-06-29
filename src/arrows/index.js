/* ============================================================================
   arrows/index.js — ArrowEngine aggregator.

   The pipeline imports `./src/arrows` and never touches individual engines. Each
   self-registers on import. To add an arrow strategy: drop a file here that calls
   registerArrowEngine(), then add one side-effect import below.
   ========================================================================== */

export { arrowEngines, getArrowEngine } from "./registry.js";

import "./default.js";
