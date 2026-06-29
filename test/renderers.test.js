import { describe, it, expect } from "vitest";
import { getRenderer } from "../src/renderers/index.js";
import { edgeGeometry, arrowHeading } from "../src/router.js";

const rounded = getRenderer("rounded");

describe("rounded renderer (smooth orthogonal)", () => {
  it("rounds an L-corner: drops the sharp vertex, keeps endpoints, stays inside the corner", () => {
    const path = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] };  // right angle at (100,0)
    const { poly } = rounded.render(path);
    expect(poly[0]).toEqual({ x: 0, y: 0 });
    expect(poly[poly.length - 1]).toEqual({ x: 100, y: 100 });
    expect(poly.some(p => p.x === 100 && p.y === 0)).toBe(false);             // sharp corner cut away
    poly.forEach(p => {                                                        // fillet stays within the L's bbox
      expect(p.x).toBeGreaterThanOrEqual(-1e-6); expect(p.x).toBeLessThanOrEqual(100 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(-1e-6); expect(p.y).toBeLessThanOrEqual(100 + 1e-6);
    });
    const nearestToCorner = Math.min(...poly.map(p => Math.hypot(p.x - 100, p.y - 0)));
    expect(nearestToCorner).toBeGreaterThan(1);                               // genuinely rounded back
  });

  it("leaves a straight 2-point spine untouched", () => {
    const poly = rounded.render({ points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] }).poly;
    expect(poly).toHaveLength(2);
  });

  it("clamps the radius to half the shorter segment (no overlap on short runs)", () => {
    // a 6px-long middle segment: fillets must not cross past its midpoint
    const path = { points: [{ x: 0, y: 0 }, { x: 0, y: 6 }, { x: 40, y: 6 }, { x: 40, y: 40 }] };
    const { poly } = rounded.render(path);
    expect(poly.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe("orthogonal-smooth routing", () => {
  const n = [{ x: 200, y: 200, w: 80, h: 36, shape: "rect", id: 0 },
             { x: 480, y: 420, w: 80, h: 36, shape: "rect", id: 1 }];
  const bounds = { x0: 0, y0: 0, x1: 800, y1: 700 };

  it("produces a rounded (densely sampled) poly on an L route", () => {
    const g = edgeGeometry({ nodes: n, edges: [{ source: 0, target: 1 }] }, "orthogonal-smooth", bounds)[0];
    expect(g.poly.length).toBeGreaterThan(5);                                 // corner sampled, not a sharp L
  });

  it("keeps the arrowhead axis-aligned (final approach stays straight)", () => {
    const poly = edgeGeometry({ nodes: n, edges: [{ source: 0, target: 1 }] }, "orthogonal-smooth", bounds)[0].poly;
    const h = arrowHeading(poly, n[0], n[1], "orthogonal-smooth");
    expect(Math.min(Math.abs(h.ux), Math.abs(h.uy))).toBeLessThan(0.02);
  });
});
