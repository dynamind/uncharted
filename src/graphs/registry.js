/* ============================================================================
   graphs/registry.js — the GraphSource registry.

   A GraphSource produces a graph model on demand:
     {
       id:    string,                       // stable key (dropdown value, presetName)
       label: string,                       // human label for the dropdown
       build: () => ({ nodes, edges }),     // fresh graph; indices, no positions
       prefer?: { solver?, routing?, arrows? },  // UI defaults this source shines with
     }
   Graph model: { nodes:[{id, shape?, w?, h?, label?}], edges:[{source,target}] }
   (source/target are node indices; positions are seeded later by the app.)

   This module owns ONLY the registry state + accessors and imports nothing else,
   so source files can `import { register }` here and self-register at import time
   without a circular dependency (graphs/index.js side-effect-imports the sources).
   ========================================================================== */

const sources = [];
const byId = new Map();

// Register a GraphSource. Import order of the source files = dropdown order.
export function register(source) {
  if (byId.has(source.id)) throw new Error(`duplicate graph source id: ${source.id}`);
  byId.set(source.id, source);
  sources.push(source);
  return source;
}

// All registered sources, in registration order (safe to iterate / build options).
export function graphSources() {
  return sources.slice();
}

// Look up by id; falls back to the first registered source (matches old behaviour
// where an unknown presetName loaded PRESET_LIST[0]).
export function getGraphSource(id) {
  return byId.get(id) || sources[0];
}
