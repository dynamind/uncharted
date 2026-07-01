/* ============================================================================
   solvers/index.js — Solver aggregator.

   The app imports `./src/solvers` and never touches individual solvers. Each
   self-registers on import. To add a solver: drop a file here that calls
   registerSolver(), then add one side-effect import below.
   ========================================================================== */

export { solvers, getSolver } from "./registry.js";

import "./force.js";
import "./annealing.js";
import "./layered.js";
import "./circular.js";
