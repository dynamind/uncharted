/* ============================================================================
   shapers/registry.js — the (curve) Shaper registry.

   A Shaper is a global path post-processor: it sees ALL of a graph's paths at once
   and rewrites them, typically inserting a control point so the renderer can draw a
   curve that accounts for its neighbours.
     Shaper = { id, shape(paths) => paths }
   This is where cross-edge curve geometry lives (fan splay now; a repulsion
   relaxation could be another shaper later), kept OUT of the per-edge renderer so
   the renderer stays stateless.

   Pure-state module, no imports — shapers self-register at import time.
   ========================================================================== */

const list = [];
const byId = new Map();

export function registerShaper(shaper) {
  if (byId.has(shaper.id)) throw new Error(`duplicate shaper id: ${shaper.id}`);
  byId.set(shaper.id, shaper);
  list.push(shaper);
  return shaper;
}

export function shapers() {
  return list.slice();
}

export function getShaper(id) {
  return byId.get(id) || null;
}
