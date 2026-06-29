import { registerArrowEngine } from "./registry.js";

// The default arrowhead engine. The defining requirement: BOTH the tip and the
// base must lie ON the drawn line, so the triangle's wide end can never drift off
// the curve (the failure you get when you derive a direction and then step `back`
// px along *that* instead of along the line — on a bulged/dragged short edge the
// two diverge and the base floats off).
//   • curved / straight → the base is where the polyline first crosses a circle of
//     radius `back` around the tip, scanning outward from the tip. That point is on
//     the line by construction, exactly `back` px from the tip, on the outside — so
//     the heading is the line's own direction at the tip and always points inward.
//     (Paths now terminate on the node border, so every interior sample lies outside
//     the node body and this outward walk can never flip the arrow back out.)
//   • orthogonal → step `back` along the axis-aligned final segment instead (a line
//     point would round the corner and tilt the arrow off-axis).
registerArrowEngine({
  id: "default",
  arrow(rendered, { mode, back = 11 } = {}) {
    const poly = rendered.poly;
    const tip = poly[poly.length - 1], first = poly[0];
    if (Math.hypot(tip.x - first.x, tip.y - first.y) < back) return null;   // edge shorter than glyph
    let bx, by;
    if (mode === "orthogonal" || mode === "orthogonal-smooth") {
      const prev = poly[poly.length - 2];
      const dx = tip.x - prev.x, dy = tip.y - prev.y, L = Math.hypot(dx, dy);
      if (L < 1e-3) return null;
      bx = tip.x - dx/L*back; by = tip.y - dy/L*back;
    } else {
      // first point at distance `back` from the tip, walking out along the polyline
      let base = null;
      for (let i = poly.length - 2; i >= 0; i--) {
        const near = poly[i + 1], far = poly[i];
        const dNear = Math.hypot(near.x - tip.x, near.y - tip.y);
        const dFar  = Math.hypot(far.x  - tip.x, far.y  - tip.y);
        if (dNear <= back && dFar >= back) {                 // segment crosses the radius-`back` circle
          const ex = far.x - near.x, ey = far.y - near.y;
          const fx = near.x - tip.x, fy = near.y - tip.y;
          const A = ex*ex + ey*ey, B = 2*(ex*fx + ey*fy), C = fx*fx + fy*fy - back*back;
          const disc = B*B - 4*A*C;
          if (disc >= 0 && A > 1e-9) {
            const t = (-B + Math.sqrt(disc)) / (2*A);        // outward crossing
            base = { x: near.x + ex*t, y: near.y + ey*t };
            break;
          }
        }
      }
      if (!base) return null;
      bx = base.x; by = base.y;
    }
    const dx = tip.x - bx, dy = tip.y - by, L = Math.hypot(dx, dy);
    if (L < 1e-3) return null;
    return { tx: tip.x, ty: tip.y, bx, by, ux: dx/L, uy: dy/L };
  },
});
