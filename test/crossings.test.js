import { describe, it, expect } from "vitest";
import { getCrossingEngine } from "../src/crossings/index.js";
import { edgeGeometry } from "../src/router.js";

const eng = getCrossingEngine("default");

// the old sibling-skip the engine deliberately dropped, for contrast
const adjacent = (a, b) => a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b;

describe("crossing engine — siblings are not skipped", () => {
  it("reports a crossing between two edges that share a node but cross", () => {
    const A = { id: 0 }, B = { id: 1 }, C = { id: 2 };
    // two polylines forming an X, both incident to the shared source A
    const e1 = { poly: [{ x: -10, y: -10 }, { x: 10, y: 10 }], a: A, b: B };
    const e2 = { poly: [{ x: -10, y: 10 }, { x: 10, y: -10 }], a: A, b: C };
    const cr = eng.crossings([e1, e2]);
    expect(cr.length).toBe(1);                 // the crossing IS reported...
    expect(adjacent(e1, e2)).toBe(true);       // ...even though the edges are adjacent
  });

  it("does NOT invent a phantom crossing where incident edges merely meet", () => {
    // a clean fan: two straight edges leaving A toward diverging targets never cross
    const A = { x: 300, y: 100, id: 0 }, B = { x: 220, y: 420, id: 1 }, C = { x: 380, y: 420, id: 2 };
    const geom = edgeGeometry({ nodes: [A, B, C], edges: [{ source: 0, target: 1 }, { source: 0, target: 2 }] },
      "straight", { x0: 0, y0: 0, x1: 600, y1: 600 });
    expect(eng.crossings(geom).length).toBe(0);
  });

  it("catches the reported issue: two curved siblings that bulge across each other", () => {
    // A on top, B below-left, C straight below — the curved bulge swings A→B across
    // A→C. The old sibling-skip hid this; now it gets a hop.
    const A = { x: 300, y: 100, id: 0 }, B = { x: 200, y: 420, id: 1 }, C = { x: 300, y: 420, id: 2 };
    const geom = edgeGeometry({ nodes: [A, B, C], edges: [{ source: 0, target: 1 }, { source: 0, target: 2 }] },
      "curved", { x0: 0, y0: 0, x1: 600, y1: 600 });
    const cr = eng.crossings(geom);
    expect(cr.length).toBeGreaterThan(0);
    expect(cr.every(c => adjacent(geom[c.eA], geom[c.eB]))).toBe(true);   // all are sibling crossings
  });
});

describe("crossing engine — pierces", () => {
  it("flags an edge whose rendered line ploughs through a non-incident node body", () => {
    const A = { x: 100, y: 300, id: 0 }, B = { x: 500, y: 300, id: 1 };
    const mid = { x: 300, y: 300, w: 60, h: 40, shape: "rect", id: 2 };   // sits on the A→B line
    const geom = edgeGeometry({ nodes: [A, B, mid], edges: [{ source: 0, target: 1 }] },
      "straight", { x0: 0, y0: 0, x1: 600, y1: 600 });
    const p = eng.pierces(geom, [A, B, mid]);
    expect(p).toEqual([{ eA: 0, node: mid }]);
  });
});
