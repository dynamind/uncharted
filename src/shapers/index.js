/* ============================================================================
   shapers/index.js — Shaper aggregator.

   edgeGeometry runs the mode's shaper (if any) between routing and rendering. Each
   shaper self-registers on import. To add one (e.g. a repulsion relaxation): drop a
   file here that calls registerShaper(), then add a side-effect import below.
   ========================================================================== */

export { shapers, getShaper } from "./registry.js";

import "./fan.js";
