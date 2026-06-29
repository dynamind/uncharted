/* ============================================================================
   graphs/index.js — graph-source aggregator.

   The app imports `./src/graphs` and never touches individual sources. Each
   source self-registers on import; the import order below is the dropdown order.
   To add a graph: drop a file in this folder that calls register(), then add one
   side-effect import here.
   ========================================================================== */

export { graphSources, getGraphSource } from "./registry.js";

import "./flowchart.js";
import "./spindle.js";
import "./tree.js";
import "./grid.js";
import "./cube.js";
import "./random.js";
import "./clusters.js";
import "./bipartite.js";
import "./complete.js";
