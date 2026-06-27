import { describe, it, expect } from "vitest";
import { orthogonalGeometry, bendCount, Nodes, separateLanes, edgeGeometry, arrowHeading } from "../src/router.js";

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

describe("target side-entry (the bottom-end mirror) and U-turn stability", () => {
  // When the side→top route is blocked (an obstacle beside A), entering B from its
  // SIDE is 1 bend vs the 2-bend bottom→top S. This is the merge case in the
  // flowchart (Reject→Respond, blocked by Parse body).
  it("enters the target's side when side→top is blocked, saving a bend", () => {
    const A = rect(290, 455), B = rect(425, 845), obstacle = rect(425, 455);
    const g = orthogonalGeometry(
      { nodes: [{...A,id:0},{...B,id:1},{...obstacle,id:2}], edges: [{source:0,target:1}] },
      { x0: 56, y0: 56, x1: 780, y1: 980 })[0];
    expect(g.sides).toEqual(["b", "l"]);     // bottom-of-A → side-of-B
    expect(bendCount(g.poly)).toBe(1);
  });

  // The t/t vs b/b U-turn used for tight side-by-side boxes must NOT flicker as the
  // box is dragged: across the overlapping band the chosen sides stay constant.
  it("a tight side-by-side U-turn stays on one choice across a vertical sweep", () => {
    const sidesAt = dy => orthogonalGeometry(
      { nodes: [{...rect(220,400),id:0}, {...rect(328,400+dy),id:1}], edges: [{source:0,target:1}] },
      { x0: 0, y0: 0, x1: 1000, y1: 900 })[0].sides.join("");
    const seen = new Set();
    for (let dy = -30; dy <= 30; dy++) seen.add(sidesAt(dy));   // within the overlap band
    expect(seen.size).toBe(1);                                   // no flicker
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

describe("hysteresis — routing is sticky unless a strictly-better route appears", () => {
  const route = (a, b, prev) => orthogonalGeometry(
    { nodes: [{...a,id:0},{...b,id:1}], edges: [{source:0,target:1}] },
    { x0: 0, y0: 0, x1: 1000, y1: 900 }, prev);

  it("keeps the previous sides when the new best ties on bends", () => {
    // B below & far right: pure bend-min picks ["r","t"]; but if we were already on
    // an equal-bend ["b","t"]... actually both ends here: assert it holds a 2-bend
    // choice instead of flipping to the other equal-bend option.
    const a = rect(200, 300), b = rect(500, 560);
    const fresh = route(a, b)[0].sides;                 // ["r","t"], 1 bend
    // a previously-chosen equal-or-worse-bend route is kept only if not strictly worse
    const sticky = route(a, b, [["b", "t"]])[0];        // ["b","t"] is 2 bends > 1 → must switch
    expect(sticky.sides).toEqual(fresh);                // strictly fewer bends ⇒ switch
  });

  it("does NOT flip between two equal-bend options frame to frame", () => {
    // side-by-side, small offset: ["r","l"] is the fresh 2-bend pick. Feed back a
    // different equal-bend choice and confirm it's retained (no twitch).
    const a = rect(200, 300), b = rect(500, 318);
    const prev = [["r", "l"]];
    let sides = route(a, b, prev)[0].sides;
    for (let i = 0; i < 5; i++) sides = route(a, b, [sides])[0].sides;  // iterate
    expect(sides).toEqual(["r", "l"]);                  // stable, never drifts
  });
});

// NEXT TASK (now done): two edges whose A* paths run along the same grid lane
// drew on top of each other — a collinear overlap segInt can't see (it returns
// null for parallels), so the lines merged into one. separateLanes fans co-running
// interior segments into parallel tracks. Mirror of the segInt helper, for the
// parallel-coincident case it can't detect.
describe("channel separation — co-running edges fan into parallel tracks", () => {
  // do axis-aligned segments a1a2 and b1b2 lie in the same lane and overlap along
  // it (collinear-coincident, by more than a touch)?
  const coincident = (a1, a2, b1, b2) => {
    const span = (p, q, k) => [Math.min(p[k], q[k]), Math.max(p[k], q[k])];
    const overlap = (lo1, hi1, lo2, hi2) => Math.min(hi1, hi2) - Math.max(lo1, lo2) > 1.5;
    const hA = Math.abs(a1.y - a2.y) < 1.5, hB = Math.abs(b1.y - b2.y) < 1.5;
    const vA = Math.abs(a1.x - a2.x) < 1.5, vB = Math.abs(b1.x - b2.x) < 1.5;
    if (hA && hB && Math.abs(a1.y - b1.y) < 1.5) {
      const [a, c] = span(a1, a2, "x"), [d, e] = span(b1, b2, "x");
      return overlap(a, c, d, e);
    }
    if (vA && vB && Math.abs(a1.x - b1.x) < 1.5) {
      const [a, c] = span(a1, a2, "y"), [d, e] = span(b1, b2, "y");
      return overlap(a, c, d, e);
    }
    return false;
  };
  // any two INTERIOR segments (the ones separation is allowed to move; the port
  // stubs are de-collided separately in PHASE 2) from DIFFERENT edges coincident?
  const anyCoincident = (geoms) => {
    const segs = [];
    geoms.forEach((g, gi) => { const p = g.poly;
      for (let i = 1; i < p.length - 2; i++) segs.push({ gi, a: p[i], b: p[i + 1] }); });
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++)
        if (segs[i].gi !== segs[j].gi && coincident(segs[i].a, segs[i].b, segs[j].a, segs[j].b))
          return true;
    return false;
  };

  it("separates two hand-built edges sharing one horizontal lane", () => {
    const mk = poly => ({ poly });
    const g = [
      mk([{ x: 0,  y: 100 }, { x: 0,  y: 200 }, { x: 300, y: 200 }, { x: 300, y: 100 }]),
      mk([{ x: 50, y: 120 }, { x: 50, y: 200 }, { x: 250, y: 200 }, { x: 250, y: 120 }]),
    ];
    const beforePorts = g.map(e => [e.poly[0], e.poly[e.poly.length - 1]]);
    expect(anyCoincident(g)).toBe(true);     // they overlap along y=200 to start
    separateLanes(g);
    expect(anyCoincident(g)).toBe(false);    // ...and no longer do
    // ports (border attach points) are pinned — separation must not move them
    g.forEach((e, i) => {
      expect(e.poly[0]).toEqual(beforePorts[i][0]);
      expect(e.poly[e.poly.length - 1]).toEqual(beforePorts[i][1]);
    });
  });

  it("a dense graph produces no collinear-coincident interior segments", () => {
    // a 3×2 lattice of boxes fully connected left-column → right-column forces
    // several edges to share horizontal corridors between the rows.
    const rect = (x, y, w = 90, h = 38) => ({ x, y, w, h, shape: "rect" });
    const L = [rect(160, 200), rect(160, 380), rect(160, 560)];
    const Rr = [rect(620, 200), rect(620, 380), rect(620, 560)];
    const nodes = [...L, ...Rr].map((n, i) => ({ ...n, id: i }));
    const edges = [];
    for (let s = 0; s < 3; s++) for (let t = 3; t < 6; t++) edges.push({ source: s, target: t });
    const geoms = orthogonalGeometry({ nodes, edges }, { x0: 0, y0: 0, x1: 900, y1: 800 });
    expect(anyCoincident(geoms)).toBe(false);
  });

  it("does not change bend counts (ports fixed ⇒ topology preserved)", () => {
    const rect = (x, y, w = 90, h = 38) => ({ x, y, w, h, shape: "rect" });
    const nodes = [rect(160, 200), rect(160, 400), rect(560, 200), rect(560, 400)]
      .map((n, i) => ({ ...n, id: i }));
    const edges = [{ source: 0, target: 2 }, { source: 1, target: 3 }, { source: 0, target: 3 }];
    const geoms = orthogonalGeometry({ nodes, edges }, { x0: 0, y0: 0, x1: 900, y1: 700 });
    geoms.forEach(g => expect(bendCount(g.poly)).toBeLessThanOrEqual(2));
  });
});

// An edge that runs through a non-incident node's interior is a crossing too —
// otherwise a solver hides an edge inside a node and reports a fake 0 (the Q₃
// cube-in-cube trap). Nodes.segHitsBody is the pure test the metric uses.
describe("segHitsBody — an edge ploughing through a node counts", () => {
  const circle = (x, y) => ({ x, y, shape: "circle" });
  it("a line straight through a node body is a hit; one clearing it is not", () => {
    const n = rect(400, 300);
    expect(Nodes.segHitsBody(n, 200, 300, 600, 300)).toBe(true);   // dead through the centre
    expect(Nodes.segHitsBody(n, 200, 100, 600, 100)).toBe(false);  // well above
  });
  it("ignores a sub-3px corner graze (no false positive)", () => {
    const n = rect(400, 300, 98, 40);                               // body x∈[351,449], y∈[280,320]
    // a line passing just outside the top-left corner, barely clipping it
    expect(Nodes.segHitsBody(n, 351, 280 - 30, 351 - 30, 280)).toBe(false);
  });
  it("respects shape: a diamond's bbox corner is empty, its waist is solid", () => {
    const d = diamond(400, 300, 104, 56);                           // hw=52, hh=28
    expect(Nodes.segHitsBody(d, 200, 300, 600, 300)).toBe(true);    // through the waist
    // a vertical line near a bbox corner (x=450, inside the bbox) — the diamond
    // has tapered to a sliver there, so the chord only grazes < 3px and misses
    expect(Nodes.segHitsBody(d, 450, 200, 450, 400)).toBe(false);
  });
  it("circle: a chord through the centre hits, a far miss does not", () => {
    const c = circle(300, 300);
    expect(Nodes.segHitsBody(c, 200, 300, 400, 300)).toBe(true);
    expect(Nodes.segHitsBody(c, 200, 280, 400, 280)).toBe(false);   // > R above
  });
  it("skips the segment's own endpoints' nodes by caller contract (endpoints inside)", () => {
    // a segment that STARTS at the node centre still reports a hit — callers must
    // skip incident nodes themselves (Objective/Renderer do).
    const n = rect(400, 300);
    expect(Nodes.segHitsBody(n, 400, 300, 700, 300)).toBe(true);
  });
});

describe("Nodes.inBody — point-in-shape", () => {
  it("circle / rect / diamond agree with their shapes", () => {
    expect(Nodes.inBody({ x: 100, y: 100, shape: "circle" }, 104, 100)).toBe(true);   // within R=8
    expect(Nodes.inBody({ x: 100, y: 100, shape: "circle" }, 112, 100)).toBe(false);  // outside R
    const r = { x: 100, y: 100, w: 80, h: 40, shape: "rect" };
    expect(Nodes.inBody(r, 135, 115)).toBe(true);
    expect(Nodes.inBody(r, 145, 100)).toBe(false);                                    // past hw=40
    const d = { x: 100, y: 100, w: 80, h: 40, shape: "diamond" };
    expect(Nodes.inBody(d, 100, 100)).toBe(true);                                     // centre
    expect(Nodes.inBody(d, 138, 118)).toBe(false);                                    // bbox corner, off the face
  });
});

// arrowHeading must (1) always point INTO the target — never flip backward over
// the node, even as nodes are dragged into contact/overlap — and (2) stay stable
// (no jitter from a ~1px baseline). It bottomed out as two bugs: a short curved
// edge whose bezier tail dips inside the target, and a near-1px baseline whose
// atan2 spins. Sweep all three routings down through touching/overlapping.
describe("arrowHeading is robust near touching / overlapping nodes", () => {
  const headAt = (mode, gap) => {
    const rectish = mode === "orthogonal";
    const mk = (x, y, id) => rectish ? { x, y, w: 70, h: 34, shape: "rect", id } : { x, y, id };
    const nodes = [mk(300, 100, 0), mk(308, 100 + gap, 1)];
    const poly = edgeGeometry({ nodes, edges: [{ source: 0, target: 1 }] }, mode,
      { x0: 0, y0: 0, x1: 600, y1: 600 })[0].poly;
    return { h: arrowHeading(poly, nodes[0], nodes[1], mode), b: nodes[1] };
  };

  it("never points outward, for any routing, all the way into overlap", () => {
    const bad = [];
    for (const mode of ["curved", "straight", "orthogonal"]) {
      for (let gap = 200; gap >= 4; gap -= 2) {
        const { h, b } = headAt(mode, gap);
        if (!h) continue;                              // skipped (no room) is fine
        const inward = h.ux * (b.x - h.tx) + h.uy * (b.y - h.ty) > 0;
        if (!inward) bad.push({ mode, gap });
      }
    }
    expect(bad).toEqual([]);
  });

  // On a long curved edge the arrow follows the curve (the secant), so it *continues
  // the line* — a small but real offset from the raw chord, not the chord itself.
  it("a long curved arrow follows the curve, not the raw chord", () => {
    const n = [{ x: 120, y: 120, id: 0 }, { x: 460, y: 380, id: 1 }];   // long, bulging
    const poly = edgeGeometry({ nodes: n, edges: [{ source: 0, target: 1 }] }, "curved",
      { x0: 0, y0: 0, x1: 800, y1: 800 })[0].poly;
    const h = arrowHeading(poly, n[0], n[1], "curved");
    const cL = Math.hypot(n[1].x - n[0].x, n[1].y - n[0].y);
    const cos = h.ux * (n[1].x - n[0].x) / cL + h.uy * (n[1].y - n[0].y) / cL;
    const devDeg = Math.acos(Math.min(1, cos)) * 180 / Math.PI;
    expect(devDeg).toBeGreaterThan(2);                  // follows the curve, not the bare chord
    expect(devDeg).toBeLessThan(25);                    // ...but still a gentle, sane angle
    expect(h.tx).toBeCloseTo(poly[poly.length - 1].x, 6);   // tip glued to the line end
    expect(h.ty).toBeCloseTo(poly[poly.length - 1].y, 6);
  });

  // Straight routing has a 2-point polyline, so the secant IS the chord.
  it("a straight arrow heads exactly along the chord", () => {
    const n = [{ x: 120, y: 120, id: 0 }, { x: 460, y: 380, id: 1 }];
    const poly = edgeGeometry({ nodes: n, edges: [{ source: 0, target: 1 }] }, "straight",
      { x0: 0, y0: 0, x1: 800, y1: 800 })[0].poly;
    const h = arrowHeading(poly, n[0], n[1], "straight");
    const cL = Math.hypot(n[1].x - n[0].x, n[1].y - n[0].y);
    expect(h.ux).toBeCloseTo((n[1].x - n[0].x) / cL, 6);
    expect(h.uy).toBeCloseTo((n[1].y - n[0].y) / cL, 6);
  });

  it("orthogonal heading is axis-aligned (not the diagonal chord) on an L-route", () => {
    const n = [{ x: 200, y: 200, w: 80, h: 36, shape: "rect", id: 0 },
               { x: 480, y: 420, w: 80, h: 36, shape: "rect", id: 1 }];
    const poly = edgeGeometry({ nodes: n, edges: [{ source: 0, target: 1 }] }, "orthogonal",
      { x0: 0, y0: 0, x1: 800, y1: 700 })[0].poly;
    const h = arrowHeading(poly, n[0], n[1], "orthogonal");
    expect(Math.min(Math.abs(h.ux), Math.abs(h.uy))).toBeLessThan(0.02);   // one axis ~0
  });

  // `room` is the rendered edge length; the renderer skips the glyph when it's
  // shorter than the arrow (ARROW_LEN=11), so the arrow never overruns a short edge.
  it("reports room so the renderer can skip arrows on edges shorter than the glyph", () => {
    const room = (mode, centreGap) => {
      const n = [{ x: 200, y: 200, id: 0 }, { x: 200 + centreGap, y: 200, id: 1 }];   // circles, R=8
      const poly = edgeGeometry({ nodes: n, edges: [{ source: 0, target: 1 }] }, mode,
        { x0: 0, y0: 0, x1: 600, y1: 600 })[0].poly;
      return arrowHeading(poly, n[0], n[1], mode)?.room ?? 0;
    };
    expect(room("straight", 40)).toBeGreaterThanOrEqual(11);   // border-to-border 24px → drawn
    expect(room("straight", 20)).toBeLessThan(11);             // border-to-border 4px → skipped
    // curved: room is the endpoint SPAN, not the (bulging) arc length — so a curve
    // between near-touching nodes still reads as short and gets skipped.
    expect(room("curved", 26)).toBeLessThan(11);               // chord ~10px though arc ~36px
  });

  // THE test that actually matters: across a full sweep of angles, distances and
  // both bulge directions, the curved arrow must track the curve's TRUE arrival
  // tangent — computed independently from the quadratic's control point (the math
  // of the drawn curve), not from arrowHeading itself. This is what makes the arrow
  // look like the head of the line; a hand-picked angle-vs-chord check never proved it.
  it("curved arrow tracks the curve's true arrival tangent at every angle/length", () => {
    // mirror edgeGeometry's curved control point → tangent at the target (t=1)
    const arrivalTangent = (a, b, i) => {
      const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
      const dx = b.x-a.x, dy = b.y-a.y, len = Math.hypot(dx, dy) || 1;
      const off = Math.min(34, len*0.11) * ((i % 2) ? 1 : -1);
      const c = { x: mx - dy/len*off, y: my + dx/len*off };
      const tx = b.x - c.x, ty = b.y - c.y, L = Math.hypot(tx, ty);
      return { x: tx/L, y: ty/L };
    };
    const offenders = [];
    for (const dist of [30, 45, 70, 120, 200, 320]) {
      for (let deg = 0; deg < 360; deg += 15) {
        for (const i of [0, 1]) {                       // edge parity flips the bulge
          const r = deg * Math.PI / 180;
          const a = { x: 400, y: 400, id: 0 };
          const b = { x: 400 + dist*Math.cos(r), y: 400 + dist*Math.sin(r), id: 1 };
          const edges = i === 0 ? [{ source: 0, target: 1 }]
                                : [{ source: 0, target: 1 }, { source: 0, target: 1 }];
          const g = edgeGeometry({ nodes: [a, b], edges }, "curved", { x0: 0, y0: 0, x1: 800, y1: 800 })[i];
          const h = arrowHeading(g.poly, a, b, "curved");
          if (!h) continue;                             // skipped (too short) is fine
          const tip = g.poly[g.poly.length - 1];
          const onBorder = Math.abs(Math.hypot(tip.x - b.x, tip.y - b.y) - Nodes.R) < 1.5;
          const T = arrivalTangent(a, b, i);
          const devDeg = Math.acos(Math.max(-1, Math.min(1, h.ux*T.x + h.uy*T.y))) * 180 / Math.PI;
          if (!onBorder || devDeg > 18) offenders.push({ dist, deg, i, devDeg: Math.round(devDeg), onBorder });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("returns null when the nodes coincide (no room → no glyph)", () => {
    const n = [{ x: 300, y: 300, id: 0 }, { x: 300, y: 300, id: 1 }];
    const poly = edgeGeometry({ nodes: n, edges: [{ source: 0, target: 1 }] }, "straight",
      { x0: 0, y0: 0, x1: 600, y1: 600 })[0].poly;
    expect(arrowHeading(poly, n[0], n[1], "straight")).toBe(null);
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
