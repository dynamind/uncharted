/* ============================================================================
   renderers/index.js — Renderer aggregator.

   The pipeline imports `./src/renderers` and never touches individual renderers.
   Each self-registers on import. To add a renderer: drop a file here that calls
   registerRenderer(), then add one side-effect import below.
   ========================================================================== */

export { renderers, getRenderer } from "./registry.js";

import "./straight.js";
import "./curved.js";
