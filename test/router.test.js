import { describe, it, expect } from "vitest";
import { orthogonalGeometry, bendCount, Nodes } from "../src/router.js";

// --- helpers ---------------------------------------------------------------
const rect = (x, y, w = 98, h = 40) => ({ x, y, w, h, shape: "rect" });
const diamond = (x, y, w = 104, h = 56) => ({ x, y, w, h, shape: "diamond" });

// route a single edge a→b and return the geometry { poly, sides, ... }
function edge(a, b, bounds = { x0: 0, y0: 0, x1: 1200, y1: 1200 }, extra = []) {
  const nodes = [{ ...a, id: 0 }, { ...b, id: 1 }, ...extra.map((n, i) => ({ ...n, id: 2 + i }))];
  return orthogonalGeometry({ nodes, edges: [{ source: 0, target: 1 }] }, bounds)[0];
}
const onBorder = (n, p) => {
  const { hw, hh } = Nodes.half(n);
  return Math.abs(Math.abs(p.x - n.x) - hw) < 1.5 || Math.abs(Math.abs(p.y - n.y) - hh) < 1.5
      || Math.abs(Math.abs(p.x - n.x) / hw + Math.abs(p.y - n.y) / hh - 1) < 0.08; // diamond face
};

describe("side-by-side boxes (the reported scenario)", () => {
  it("aligned Y → right/left ports, a single straight segment (0 bends)", () => {
    const g = edge(rect(200, 300), rect(500, 300));
    expect(g.sides).toEqual(["r", "l"]);
    expect(bendCount(g.poly)).toBe(0);
  });

  it("small Y offset, still overlapping vertically → side-to-side, 2 bends", () => {
    for (const dy of [10, 24, 36]) {        // vGap < 0 ⇒ level boxes ⇒ enter the side
      const g = edge(rect(200, 300), rect(500, 300 + dy));
      expect(g.sides).toEqual(["r", "l"]);
      expect(bendCount(g.poly)).toBe(2);
    }
  });

  // Issue 1: once B clears vertically AND sits off to the side, a 1-bend L
  // (source's side → target's top) beats the 2-bend bottom→top S.
  it("B below and off to the side → side-of-A to top-of-B, 1 bend", () => {
    const g = edge(rect(200, 300), rect(500, 560));   // far right, clearly below
    expect(g.sides).toEqual(["r", "t"]);
    expect(bendCount(g.poly)).toBe(1);
  });
});

// The headline invariant: drag a side-by-side box through a vertical range pixel
// by pixel — a ≤2-bend orthogonal route always exists, so the router must find it
// (this is what caught the 4-bend band near the old vertical/horizontal flip).
describe("pixel sweep — a side-by-side edge never exceeds 2 bends", () => {
  it("holds across the whole vertical range", () => {
    const bounds = { x0: 0, y0: 0, x1: 900, y1: 900 };
    const offenders = [];
    for (let dy = -260; dy <= 260; dy++) {
      const g = edge(rect(220, 450), rect(560, 450 + dy), bounds);  // dx=340 ⇒ always horizontally clear
      const b = bendCount(g.poly);
      if (b > 2) offenders.push({ dy, bends: b, sides: g.sides });
    }
    expect(offenders).toEqual([]);
  });

  it("also holds when sweeping horizontally past a box", () => {
    const bounds = { x0: 0, y0: 0, x1: 900, y1: 900 };
    const offenders = [];
    for (let dx = -260; dx <= 260; dx++) {
      const g = edge(rect(450, 250), rect(450 + dx, 560), bounds);  // dy=310 ⇒ always vertically clear
      const b = bendCount(g.poly);
      if (b > 2) offenders.push({ dx, bends: b });
    }
    expect(offenders).toEqual([]);
  });

  // The reported wedge: boxes nearly side-by-side with the channel between them too
  // tight to route through. A same-side U-turn (over the top / under the bottom) is
  // 2 bends; the old code wrapped vertically in 4.
  it("tight horizontal gap → ≤2 bends via a U-turn, never a 4-bend wrap", () => {
    const bounds = { x0: 0, y0: 0, x1: 900, y1: 900 };
    const offenders = [];
    for (let gap = 2; gap <= 280; gap++) {            // edge-to-edge gap, clear → very tight
      const g = edge(rect(220, 450), rect(220 + 98 + gap, 450), bounds);  // same Y
      const b = bendCount(g.poly);
      if (b > 2) offenders.push({ gap, bends: b });
    }
    expect(offenders).toEqual([]);
  });

  it("tight gap with a small Y offset still stays ≤2 bends", () => {
    for (const dy of [0, 12, 28]) {
      const g = edge(rect(220, 450), rect(338, 450 + dy));  // ~20px gap (< 2*margin)
      expect(bendCount(g.poly)).toBeLessThanOrEqual(2);
    }
  });
});

describe("stacked boxes keep flowing downward (flowchart aesthetic)", () => {
  it("B directly below A → bottom/top, straight (0 bends)", () => {
    const g = edge(rect(300, 100), rect(300, 320));
    expect(g.sides).toEqual(["b", "t"]);
    expect(bendCount(g.poly)).toBe(0);
  });
  it("B below-and-left (a branch) enters from the top via a 1-bend L", () => {
    const g = edge(rect(300, 100), rect(120, 340));
    expect(g.sides).toEqual(["l", "t"]);     // exit A's left vertex, enter B's top
    expect(bendCount(g.poly)).toBe(1);
  });
});

// Issue 2: dragging a child horizontally under a shared parent must never make
// the two sibling edges cross — ports on a shared side are ordered by fan angle.
describe("sibling edges from one node never cross (fan ordering)", () => {
  const segInt = (a1, a2, b1, b2) => {
    const d = (a2.x-a1.x)*(b2.y-b1.y) - (a2.y-a1.y)*(b2.x-b1.x);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((b1.x-a1.x)*(b2.y-b1.y) - (b1.y-a1.y)*(b2.x-b1.x)) / d;
    const u = ((b1.x-a1.x)*(a2.y-a1.y) - (b1.y-a1.y)*(a2.x-a1.x)) / d;
    return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
  };
  const polyCross = (p, q) => {
    for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++)
      if (segInt(p[i-1], p[i], q[j-1], q[j])) return true;
    return false;
  };
  it("sweep one child across the parent — siblings stay disjoint", () => {
    const rect = (x, y, w = 98, h = 40) => ({ x, y, w, h, shape: "rect" });
    const offenders = [];
    for (let bx = 120; bx <= 620; bx += 2) {
      const A = rect(360, 120), B = rect(bx, 360), C = rect(560, 360);
      const g = orthogonalGeometry(
        { nodes: [{...A,id:0},{...B,id:1},{...C,id:2}], edges: [{source:0,target:1},{source:0,target:2}] },
        { x0: 0, y0: 0, x1: 1000, y1: 800 });
      if (polyCross(g[0].poly, g[1].poly)) offenders.push(bx);
    }
    expect(offenders).toEqual([]);
  });
});

describe("orthogonal routing invariants", () => {
  it("every edge connects on both node borders, axis-aligned", () => {
    const a = rect(180, 280), b = rect(540, 470);
    const poly = edge(a, b).poly;
    expect(onBorder(a, poly[0])).toBe(true);
    expect(onBorder(b, poly[poly.length - 1])).toBe(true);
    for (let i = 1; i < poly.length; i++) {
      const dx = Math.abs(poly[i].x - poly[i-1].x), dy = Math.abs(poly[i].y - poly[i-1].y);
      expect(dx < 1.5 || dy < 1.5).toBe(true);
    }
  });

  it("a diamond's branch attaches to its angled face, not the bbox corner", () => {
    const A = diamond(400, 300), B = rect(180, 520), trunk = rect(400, 520);
    const nodes = [{ ...A, id: 0 }, { ...B, id: 1 }, { ...trunk, id: 2 }];
    const edges = [{ source: 0, target: 1 }, { source: 0, target: 2 }];
    const start = orthogonalGeometry({ nodes, edges }, { x0: 0, y0: 0, x1: 1200, y1: 1200 })[0].poly[0];
    const { hh } = Nodes.half(A);
    expect(Math.abs(start.x - A.x)).toBeGreaterThan(2);    // leaning (off-centre)
    expect(Math.abs(start.y - A.y)).toBeLessThan(hh - 1);  // above bbox bottom → angled face
    expect(onBorder(A, start)).toBe(true);
  });

  it("a pass-through node's two edges attach at distinct points (no skewer)", () => {
    const A = rect(420, 600), R = rect(180, 200), C = rect(420, 900);
    const nodes = [{ ...A, id: 0 }, { ...R, id: 1 }, { ...C, id: 2 }];
    const edges = [{ source: 0, target: 1 }, { source: 1, target: 2 }];
    const geom = orthogonalGeometry({ nodes, edges }, { x0: 0, y0: 0, x1: 1200, y1: 1200 });
    const inR = geom[0].poly[geom[0].poly.length - 1], outR = geom[1].poly[0];
    expect(Math.round(inR.x) !== Math.round(outR.x) || Math.round(inR.y) !== Math.round(outR.y)).toBe(true);
  });
});
