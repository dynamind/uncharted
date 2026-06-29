/* ============================================================================
   paths/registry.js — the PathEngine registry.

   A PathEngine maps a graph to one logical "spine" per edge: an ordered list of
   points the edge travels through. The contract is graph-level (not per-edge)
   because some routings are inherently global — orthogonal does grid A* around
   every node obstacle plus channel separation across all edges at once.

     PathEngine = {
       id: string,
       route(graph, bounds, prev) => Array<Path>,   // one per edge, in edge order
     }
     Path = { points: Point[],   // length >= 2; FIRST & LAST are on node borders
              a, b,              // the source / target node objects
              sides? }           // optional routing state (orthogonal hysteresis)

   Invariant: a Path's endpoints are border ports and it has NO point inside either
   node body. Downstream renderers/arrows/hops therefore never anchor to geometry
   buried inside a node — the structural fix for the arrow-flip bug.

   This module owns only the registry state + accessors and imports nothing else,
   so engine files can `import { registerPathEngine }` and self-register at import
   time without a circular-dependency TDZ (paths/index.js side-effect-imports them).
   ========================================================================== */

const engines = [];
const byId = new Map();

export function registerPathEngine(engine) {
  if (byId.has(engine.id)) throw new Error(`duplicate path engine id: ${engine.id}`);
  byId.set(engine.id, engine);
  engines.push(engine);
  return engine;
}

export function pathEngines() {
  return engines.slice();
}

export function getPathEngine(id) {
  return byId.get(id) || engines[0];
}
