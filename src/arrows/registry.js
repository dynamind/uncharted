/* ============================================================================
   arrows/registry.js — the ArrowEngine registry.

   An ArrowEngine derives a directed arrowhead at the TARGET end of a rendered
   path:
     ArrowEngine = { id, arrow(rendered, ctx) => Head | null }
     rendered = { poly, tangents? }            // a RenderedPath
     ctx      = { mode, back }                  // routing mode + glyph length (px)
     Head     = { tx, ty,   // tip (on the border)
                  bx, by,   // base centre
                  ux, uy }  // unit heading, base→tip (points into the node)
   Returns null when the edge is shorter than the glyph (skip it).

   Pure geometry over the polyline — imports nothing, so engines self-register at
   import time and there is no dependency cycle with router.
   ========================================================================== */

const list = [];
const byId = new Map();

export function registerArrowEngine(engine) {
  if (byId.has(engine.id)) throw new Error(`duplicate arrow engine id: ${engine.id}`);
  byId.set(engine.id, engine);
  list.push(engine);
  return engine;
}

export function arrowEngines() {
  return list.slice();
}

export function getArrowEngine(id) {
  return byId.get(id) || list[0];
}
