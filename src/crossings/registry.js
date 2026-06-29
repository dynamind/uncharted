/* ============================================================================
   crossings/registry.js — the CrossingEngine registry.

   A CrossingEngine reads the ACTUAL rendered geometry and reports where it
   visually crosses, so hops (and the on-screen count) land exactly on the drawn
   lines:
     CrossingEngine = {
       id,
       crossings(geom)        => [{ x, y, eA, eB }],   // edge↔edge intersections
       pierces(geom, nodes)   => [{ eA, node }],        // edge through a node body
     }
   `geom` is the array of RenderedPaths `{ poly, a, b, ... }`.

   NB this is distinct from the solver's Objective.crossings, which is the abstract
   straight-line crossing NUMBER being optimised (centre-to-centre chords). This
   engine is about what is *drawn*.

   Pure-state module, no imports — engines self-register at import time.
   ========================================================================== */

const list = [];
const byId = new Map();

export function registerCrossingEngine(engine) {
  if (byId.has(engine.id)) throw new Error(`duplicate crossing engine id: ${engine.id}`);
  byId.set(engine.id, engine);
  list.push(engine);
  return engine;
}

export function crossingEngines() {
  return list.slice();
}

export function getCrossingEngine(id) {
  return byId.get(id) || list[0];
}
