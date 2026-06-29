import { describe, it, expect } from "vitest";
import { edgeGeometry } from "../src/router.js";
import { getCrossingEngine } from "../src/crossings/index.js";

const eng = getCrossingEngine("default");
const bounds = { x0: 0, y0: 0, x1: 600, y1: 600 };
const curvedCrossings = graph => eng.crossings(edgeGeometry(graph, "curved", bounds)).length;
const midDeflection = poly => {
  const a = poly[0], b = poly[poly.length - 1], m = poly[(poly.length / 2) | 0];
  return Math.hypot(m.x - (a.x + b.x) / 2, m.y - (a.y + b.y) / 2);
};

// The fan shaper replaces the old index-parity bulge: siblings splay apart instead of
// bulging into each other. These pin the issue-#1 fix (the parity baseline crossings
// from the numeric eval are noted per case).
describe("fan shaper — geometry-aware bulge avoids sibling crossings", () => {
  it("the reported A→B / A→C case is crossing-free (was 2 with index-parity)", () => {
    const g = { nodes: [{ x: 300, y: 100, id: 0 }, { x: 200, y: 420, id: 1 }, { x: 300, y: 420, id: 2 }],
                edges: [{ source: 0, target: 1 }, { source: 0, target: 2 }] };
    expect(curvedCrossings(g)).toBe(0);
  });

  it("a 1→5 fan-out has no sibling crossings (was 4)", () => {
    const g = { nodes: [{ x: 300, y: 80, id: 0 }, ...[160, 230, 300, 370, 440].map((x, i) => ({ x, y: 480, id: i + 1 }))],
                edges: [1, 2, 3, 4, 5].map(t => ({ source: 0, target: t })) };
    expect(curvedCrossings(g)).toBe(0);
  });

  it("a 5→1 fan-in has no sibling crossings (was 4)", () => {
    const g = { nodes: [...[160, 230, 300, 370, 440].map((x, i) => ({ x, y: 80, id: i })), { x: 300, y: 480, id: 5 }],
                edges: [0, 1, 2, 3, 4].map(s => ({ source: s, target: 5 })) };
    expect(curvedCrossings(g)).toBe(0);
  });

  it("a lone edge still curves (non-degenerate bow)", () => {
    const g = { nodes: [{ x: 120, y: 120, id: 0 }, { x: 460, y: 380, id: 1 }], edges: [{ source: 0, target: 1 }] };
    const poly = edgeGeometry(g, "curved", { x0: 0, y0: 0, x1: 800, y1: 800 })[0].poly;
    expect(midDeflection(poly)).toBeGreaterThan(3);
  });

  it("multi-edges between the same pair don't coincide", () => {
    const g = { nodes: [{ x: 200, y: 300, id: 0 }, { x: 500, y: 300, id: 1 }],
                edges: [{ source: 0, target: 1 }, { source: 0, target: 1 }] };
    const geom = edgeGeometry(g, "curved", bounds);
    const m0 = geom[0].poly[(geom[0].poly.length / 2) | 0];
    const m1 = geom[1].poly[(geom[1].poly.length / 2) | 0];
    expect(Math.hypot(m0.x - m1.x, m0.y - m1.y)).toBeGreaterThan(3);
  });

  // The fan center is the middle of the occupied arc (opposite the largest gap), not
  // the median by atan2 — so a fan straddling the ±π seam still centers correctly.
  it("a left-pointing fan straddling ±π centers on the dead-center edge", () => {
    const A = { x: 400, y: 300, id: 0 };
    const T1 = { x: 100, y: 200, id: 1 };   // up-left   (~ -161°)
    const T2 = { x: 100, y: 300, id: 2 };   // dead-left ( 180°)
    const T3 = { x: 100, y: 400, id: 3 };   // down-left (~ 161°)
    const geom = edgeGeometry({ nodes: [A, T1, T2, T3], edges: [1, 2, 3].map(t => ({ source: 0, target: t })) },
      "curved", bounds);
    expect(eng.crossings(geom).length).toBe(0);
    const [d1, d2, d3] = geom.map(g => midDeflection(g.poly));
    expect(d2).toBeLessThan(2);              // dead-left edge runs ~straight (fan center)
    expect(d1).toBeGreaterThan(3);           // the two extremes bow
    expect(d3).toBeGreaterThan(3);
  });

  // signed side of an edge's bow: which side of its chord the mid sample sits on
  const bowSide = poly => {
    const a = poly[0], b = poly[poly.length - 1], m = poly[(poly.length - 1) / 2 | 0];
    return Math.sign((b.x - a.x) * (m.y - a.y) - (b.y - a.y) * (m.x - a.x));
  };

  // A fan-out node with an incoming trunk must splay its two children to OPPOSITE sides
  // — the far-away trunk must not shove both children the same way (the reported bug).
  // Clustering puts the trunk in its own cluster so the two children splay between
  // themselves.
  it("two children of a fan-out splay to opposite sides (trunk doesn't skew them)", () => {
    const Recv = { x: 300, y: 100, id: 0 }, Auth = { x: 300, y: 320, w: 104, h: 56, shape: "diamond", id: 1 };
    const Rej = { x: 160, y: 560, id: 2 }, Parse = { x: 340, y: 560, id: 3 };
    const geom = edgeGeometry(
      { nodes: [Recv, Auth, Rej, Parse], edges: [[0,1],[1,2],[1,3]].map(([s,t]) => ({ source: s, target: t })) },
      "curved", bounds);
    expect(eng.crossings(geom).length).toBe(0);
    const sRej = bowSide(geom[1].poly), sParse = bowSide(geom[2].poly);   // Auth→Rej, Auth→Parse
    expect(sRej).not.toBe(0);
    expect(sParse).not.toBe(0);
    expect(sRej).not.toBe(sParse);                            // opposite sides ⇒ splayed apart
  });

  // A fan-IN must splay its inbound edges OUTWARD too: the leftmost source's edge should
  // bend left, the rightmost right (mirror of fan-out). Before the target-end flip the
  // fan-in bowed inward and its edges converged and crossed.
  it("a fan-in splays inbound edges outward (leftmost bends left, rightmost right)", () => {
    const L = { x: 160, y: 120, id: 0 }, M = { x: 340, y: 120, id: 1 }, R = { x: 520, y: 120, id: 2 };
    const T = { x: 340, y: 380, w: 98, h: 40, shape: "rect", id: 3 }, End = { x: 340, y: 600, id: 4 };
    const geom = edgeGeometry(
      { nodes: [L, M, R, T, End], edges: [[0,3],[1,3],[2,3],[3,4]].map(([s,t]) => ({ source: s, target: t })) },
      "curved", bounds);
    expect(eng.crossings(geom).length).toBe(0);
    const bendX = poly => { const a = poly[0], b = poly[poly.length-1], m = poly[(poly.length-1)/2|0]; return m.x - (a.x+b.x)/2; };
    expect(bendX(geom[0].poly)).toBeLessThan(-2);            // L→T (leftmost) bends LEFT
    expect(bendX(geom[2].poly)).toBeGreaterThan(2);          // R→T (rightmost) bends RIGHT
  });

  // An angularly isolated edge (a straight-through chain link: in from above, out below)
  // casts no fan vote and runs straight — the preferred look for a flowchart spine.
  it("a straight-through chain link runs straight", () => {
    const A = { x: 300, y: 100, id: 0 }, B = { x: 300, y: 320, id: 1 }, C = { x: 300, y: 540, id: 2 };
    const geom = edgeGeometry({ nodes: [A, B, C], edges: [[0,1],[1,2]].map(([s,t]) => ({ source: s, target: t })) },
      "curved", bounds);
    expect(midDeflection(geom[0].poly)).toBeLessThan(2);
    expect(midDeflection(geom[1].poly)).toBeLessThan(2);
  });
});
