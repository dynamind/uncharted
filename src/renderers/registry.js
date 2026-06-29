/* ============================================================================
   renderers/registry.js — the Renderer registry.

   A Renderer flattens one Path into a RenderedPath:
     Renderer = { id, render(path, ctx) => RenderedPath }
     RenderedPath = { poly: Point[], tangents: Vector[] }   // tangents[i] ∥ poly[i]
   `poly` is the drawn polyline; `tangents` are per-vertex unit directions so that
   downstream arrow / crossing engines read true geometry off the rendered line
   rather than re-deriving it from control points. `ctx` carries per-edge hints
   (e.g. { index } for fan alternation).

   Like the other registries this module owns only state + accessors and imports
   nothing, so renderer files can self-register at import time without a cycle.
   ========================================================================== */

const list = [];
const byId = new Map();

export function registerRenderer(renderer) {
  if (byId.has(renderer.id)) throw new Error(`duplicate renderer id: ${renderer.id}`);
  byId.set(renderer.id, renderer);
  list.push(renderer);
  return renderer;
}

export function renderers() {
  return list.slice();
}

export function getRenderer(id) {
  return byId.get(id) || list[0];
}

// Per-vertex unit tangents: central difference for interior vertices, the adjacent
// segment at the endpoints. For a 2-point straight line every tangent is the chord.
export function tangentsOf(poly) {
  const n = poly.length, t = [];
  for (let i = 0; i < n; i++) {
    const p = poly[Math.max(0, i - 1)], q = poly[Math.min(n - 1, i + 1)];
    const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
    t.push({ x: dx / L, y: dy / L });
  }
  return t;
}
