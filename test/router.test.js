import { describe, it, expect } from "vitest";
import { orthogonalGeometry, sidesForEdge, bendCount, ORTHO, Nodes } from "../src/router.js";

// --- helpers ---------------------------------------------------------------
const rect = (x, y, w = 98, h = 40) => ({ x, y, w, h, shape: "rect" });
const diamond = (x, y, w = 104, h = 56) => ({ x, y, w, h, shape: "diamond" });

// route a single edge a→b on a roomy canvas and return its polyline
function route(a, b, extra = []) {
  const nodes = [{ ...a, id: 0 }, { ...b, id: 1 }, ...extra.map((n, i) => ({ ...n, id: 2 + i }))];
  const edges = [{ source: 0, target: 1 }];
  return orthogonalGeometry({ nodes, edges }, { x0: 0, y0: 0, x1: 1200, y1: 1200 })[0].poly;
}
const onBorder = (n, p) => {
  const { hw, hh } = Nodes.half(n);
  return Math.abs(Math.abs(p.x - n.x) - hw) < 1.5 || Math.abs(Math.abs(p.y - n.y) - hh) < 1.5
      // diamond: point lies on |dx|/hw + |dy|/hh = 1
      || Math.abs(Math.abs(p.x - n.x) / hw + Math.abs(p.y - n.y) / hh - 1) < 0.08;
};

// threshold (centre-to-centre dy) at which a side-by-side pair stops overlapping
// vertically enough to route a clean vertical channel.
const SAME_SIZE_FLIP = 40 /*2*hh*/ + 2 * ORTHO.margin + ORTHO.cell; // = 77

describe("sidesForEdge — side-by-side boxes (the reported scenario)", () => {
  it("A left of B, same Y → right/left ports", () => {
    expect(sidesForEdge(rect(200, 300), rect(500, 300))).toEqual(["r", "l"]);
  });

  it("aligned Y → a single straight segment (0 bends)", () => {
    expect(bendCount(route(rect(200, 300), rect(500, 300)))).toBe(0);
  });

  it("small Y offset (boxes still overlap incl. margin) → right/left, 2 bends", () => {
    for (const dy of [12, 24, 40, 60]) {
      const a = rect(200, 300), b = rect(500, 300 + dy);
      expect(sidesForEdge(a, b)).toEqual(["r", "l"]);
      expect(bendCount(route(a, b))).toBe(2);
    }
  });

  it("once the boxes clear vertically → bottom/top (flow downward)", () => {
    const a = rect(200, 300), b = rect(500, 300 + 200);
    expect(sidesForEdge(a, b)).toEqual(["b", "t"]);
  });

  it("the side→stacked flip happens around the margin-aware threshold, not at dy=0", () => {
    const a = rect(200, 300);
    expect(sidesForEdge(a, rect(500, 300 + (SAME_SIZE_FLIP - 12)))).toEqual(["r", "l"]); // still overlapping
    expect(sidesForEdge(a, rect(500, 300 + (SAME_SIZE_FLIP + 30)))[0]).toBe("b");        // cleared
  });

  it("symmetry: B left of A behaves the same (mirrored)", () => {
    expect(sidesForEdge(rect(500, 300), rect(200, 300))).toEqual(["l", "r"]);
  });
});

describe("sidesForEdge — stacked boxes (normal flowchart flow)", () => {
  it("B directly below A with clearance → bottom/top", () => {
    expect(sidesForEdge(rect(300, 100), rect(300, 300))).toEqual(["b", "t"]);
  });
  it("B below-and-left (a branch) still enters from the top", () => {
    expect(sidesForEdge(rect(300, 100), rect(120, 300))).toEqual(["b", "t"]);
  });
});

describe("orthogonal routing invariants", () => {
  it("every edge connects on both node borders", () => {
    const a = rect(200, 300), b = rect(560, 360);
    const poly = route(a, b);
    expect(onBorder(a, poly[0])).toBe(true);
    expect(onBorder(b, poly[poly.length - 1])).toBe(true);
  });

  it("every segment is axis-aligned (no diagonals)", () => {
    const poly = route(rect(180, 280), rect(540, 470));
    for (let i = 1; i < poly.length; i++) {
      const dx = Math.abs(poly[i].x - poly[i-1].x), dy = Math.abs(poly[i].y - poly[i-1].y);
      expect(dx < 1.5 || dy < 1.5).toBe(true);
    }
  });

  it("a diamond's branch attaches to its angled face, not the bbox corner", () => {
    // diamond A above, child B below-left → A uses bottom side, leaning left
    const A = diamond(400, 300), B = rect(180, 520), trunk = rect(400, 520);
    const nodes = [{ ...A, id: 0 }, { ...B, id: 1 }, { ...trunk, id: 2 }];
    const edges = [{ source: 0, target: 1 }, { source: 0, target: 2 }];
    const geom = orthogonalGeometry({ nodes, edges }, { x0: 0, y0: 0, x1: 1200, y1: 1200 });
    const start = geom[0].poly[0];           // A→B start, on A's border
    const { hh } = Nodes.half(A);
    expect(Math.abs(start.x - A.x)).toBeGreaterThan(2);              // leaning (off-centre)
    expect(Math.abs(start.y - A.y)).toBeLessThan(hh - 1);            // ABOVE the bbox bottom → angled face
    expect(onBorder(A, start)).toBe(true);
  });

  it("a pass-through node's two edges attach at distinct points (no skewer)", () => {
    // R dragged above both its neighbours → both edges leave R's bottom; must not stack
    const A = rect(420, 600), R = rect(180, 200), C = rect(420, 900);
    const nodes = [{ ...A, id: 0 }, { ...R, id: 1 }, { ...C, id: 2 }];
    const edges = [{ source: 0, target: 1 }, { source: 1, target: 2 }];
    const geom = orthogonalGeometry({ nodes, edges }, { x0: 0, y0: 0, x1: 1200, y1: 1200 });
    const inR = geom[0].poly[geom[0].poly.length - 1];   // attaches on R
    const outR = geom[1].poly[0];                          // leaves R
    expect(Math.round(inR.x) !== Math.round(outR.x) || Math.round(inR.y) !== Math.round(outR.y)).toBe(true);
  });
});
