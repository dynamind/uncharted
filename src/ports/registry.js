/* ============================================================================
   ports/registry.js — the PortStrategy registry, keyed by node shape.

   A PortStrategy places attachment points for ONE node's incident edges, so the
   direct PathEngine can spread a node's several edges across its border instead of
   stacking them on a single point:
     PortStrategy = {
       shape,                              // node shape key, or "default" (the fallback)
       assign(node, incident) => Point[],  // one port per incident edge, aligned to it
     }
     incident = [{ ei, end, far }]         // ei = edge index, end = 0 (source) | 1 (target),
                                           // far = the node at the other end (for direction)

   `getPortStrategy(shape)` falls back to the "default" strategy for any shape without
   a dedicated one. Today only "default" is registered (single port toward the target,
   which already snaps correctly for circle/rect/diamond); the seam exists so a
   spreading or otherwise shape-specific strategy can be dropped in later. Pure-state
   module, no imports — strategies self-register.
   ========================================================================== */

const byShape = new Map();

export function registerPortStrategy(strategy) {
  if (byShape.has(strategy.shape)) throw new Error(`duplicate port strategy: ${strategy.shape}`);
  byShape.set(strategy.shape, strategy);
  return strategy;
}

export function portStrategies() {
  return [...byShape.values()];
}

export function getPortStrategy(shape) {
  return byShape.get(shape) || byShape.get("default");
}
