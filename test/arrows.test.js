import { describe, it, expect } from "vitest";
import { getArrowEngine } from "../src/arrows/index.js";
import { edgeGeometry, Nodes } from "../src/router.js";

const eng = getArrowEngine("default");

// eng.arrow puts the tip on the border and the base where the line crosses radius
// `back` from the tip — so BOTH ends sit ON the drawn line. It must: point inward,
// keep the base on the line (the bug that survived every angle test — the wide end
// drifting off the curve on short/dragged edges), follow the curve, stay
// axis-aligned for orthogonal, and skip when the edge is shorter than the glyph.
describe("default arrow engine is robust near touching / overlapping nodes", () => {
  const headAt = (mode, gap) => {
    const rectish = mode === "orthogonal";
    const mk = (x, y, id) => rectish ? { x, y, w: 70, h: 34, shape: "rect", id } : { x, y, id };
    const nodes = [mk(300, 100, 0), mk(308, 100 + gap, 1)];
    const poly = edgeGeometry({ nodes, edges: [{ source: 0, target: 1 }] }, mode,
      { x0: 0, y0: 0, x1: 600, y1: 600 })[0].poly;
    return { h: eng.arrow({ poly }, { mode }), b: nodes[1] };
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

  // Regression: the 180° flip on box/diamond targets. The curved bezier used to run
  // center-to-center with only the endpoints snapped, so for edges shorter than
  // ~12× the border half-extent an interior sample fell INSIDE the box/diamond body
  // and the base-finding walk stepped inward, flipping the arrow to point back out.
  // Circles (R=8) were immune, which is why the sweep above missed it. Paths now
  // terminate on the border so the curve is sampled port-to-port; assert no flip
  // across angle × distance for both box shapes, well below the old threshold.
  it("a curved arrow into a box/diamond target never flips (the reported bug)", () => {
    const bad = [];
    for (const shape of ["rect", "diamond"]) {
      for (let ang = 0; ang < 360; ang += 30) {
        for (const dist of [350, 250, 150, 90]) {
          const A = { x: 400 + dist*Math.cos(ang*Math.PI/180),
                      y: 400 + dist*Math.sin(ang*Math.PI/180), id: 0 };
          const B = { x: 400, y: 400, w: 80, h: 50, shape, id: 1 };
          const poly = edgeGeometry({ nodes: [A, B], edges: [{ source: 0, target: 1 }] },
            "curved", { x0: 0, y0: 0, x1: 800, y1: 800 })[0].poly;
          const h = eng.arrow({ poly }, { mode: "curved" });
          if (!h) continue;                                    // too short to draw — fine
          const inward = h.ux * (B.x - h.tx) + h.uy * (B.y - h.ty) > 0;
          if (!inward) bad.push({ shape, ang, dist });
        }
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
    const h = eng.arrow({ poly }, { mode: "curved" });
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
    const h = eng.arrow({ poly }, { mode: "straight" });
    const cL = Math.hypot(n[1].x - n[0].x, n[1].y - n[0].y);
    expect(h.ux).toBeCloseTo((n[1].x - n[0].x) / cL, 6);
    expect(h.uy).toBeCloseTo((n[1].y - n[0].y) / cL, 6);
  });

  it("orthogonal heading is axis-aligned (not the diagonal chord) on an L-route", () => {
    const n = [{ x: 200, y: 200, w: 80, h: 36, shape: "rect", id: 0 },
               { x: 480, y: 420, w: 80, h: 36, shape: "rect", id: 1 }];
    const poly = edgeGeometry({ nodes: n, edges: [{ source: 0, target: 1 }] }, "orthogonal",
      { x0: 0, y0: 0, x1: 800, y1: 700 })[0].poly;
    const h = eng.arrow({ poly }, { mode: "orthogonal" });
    expect(Math.min(Math.abs(h.ux), Math.abs(h.uy))).toBeLessThan(0.02);   // one axis ~0
  });

  // THE requirement that the angle tests missed: the arrow's wide end (the base)
  // must sit ON the drawn line, never drift off it — even on the short, bulged edges
  // you only get by dragging connected nodes close. Sweep angle × distance × bulge
  // and assert the base is within 1px of some polyline segment (and `back` from tip).
  it("the arrow base sits on the drawn line at every angle/length/bulge", () => {
    const ARROW_LEN = 11;
    const distToPolyline = (p, poly) => {
      let best = Infinity;
      for (let i = 1; i < poly.length; i++) {
        const a = poly[i-1], b = poly[i];
        const dx = b.x-a.x, dy = b.y-a.y, L2 = dx*dx + dy*dy || 1;
        let t = ((p.x-a.x)*dx + (p.y-a.y)*dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        best = Math.min(best, Math.hypot(p.x - (a.x+dx*t), p.y - (a.y+dy*t)));
      }
      return best;
    };
    const offenders = [];
    for (const dist of [22, 30, 45, 70, 120, 220]) {
      for (let deg = 0; deg < 360; deg += 15) {
        for (const i of [0, 1]) {
          const r = deg * Math.PI / 180;
          const a = { x: 400, y: 400, id: 0 };
          const b = { x: 400 + dist*Math.cos(r), y: 400 + dist*Math.sin(r), id: 1 };
          const edges = i === 0 ? [{ source: 0, target: 1 }]
                                : [{ source: 0, target: 1 }, { source: 0, target: 1 }];
          const g = edgeGeometry({ nodes: [a, b], edges }, "curved", { x0: 0, y0: 0, x1: 800, y1: 800 })[i];
          const h = eng.arrow({ poly: g.poly }, { mode: "curved", back: ARROW_LEN });
          if (!h) continue;
          const baseOnLine = distToPolyline({ x: h.bx, y: h.by }, g.poly);
          const baseToTip = Math.hypot(h.tx - h.bx, h.ty - h.by);
          if (baseOnLine > 1 || Math.abs(baseToTip - ARROW_LEN) > 0.5)
            offenders.push({ dist, deg, i, baseOnLine: +baseOnLine.toFixed(2), baseToTip: +baseToTip.toFixed(1) });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("skips the glyph when the edge is shorter than the arrow", () => {
    const drawn = (mode, centerGap) => {
      const n = [{ x: 200, y: 200, id: 0 }, { x: 200 + centerGap, y: 200, id: 1 }];   // circles, R=8
      const poly = edgeGeometry({ nodes: n, edges: [{ source: 0, target: 1 }] }, mode,
        { x0: 0, y0: 0, x1: 600, y1: 600 })[0].poly;
      return eng.arrow({ poly }, { mode, back: 11 }) !== null;
    };
    expect(drawn("straight", 40)).toBe(true);    // border-to-border 24px → drawn
    expect(drawn("straight", 20)).toBe(false);   // border-to-border 4px → skipped
  });

  // THE test that actually matters: across a full sweep of angles, distances and
  // both bulge directions, the curved arrow must track the curve's TRUE arrival
  // tangent — computed independently from the quadratic's control point (the math
  // of the drawn curve), not from the arrow engine itself. This is what makes the
  // arrow look like the head of the line; a hand-picked angle-vs-chord check never
  // proved it.
  it("curved arrow tracks the curve's true arrival tangent at every angle/length", () => {
    // The curve's arrival tangent at the target (t=1), recovered from the DRAWN
    // polyline itself — independent of the arrow engine and of whatever bulge rule
    // the shaper uses. The poly is a quadratic sampled uniformly, so its midpoint
    // (t=0.5) gives the control point c = 2·mid − (p0+p1)/2, and the t=1 tangent ∥ (p1 − c).
    const arrivalTangent = (poly) => {
      const p0 = poly[0], p1 = poly[poly.length - 1], mid = poly[(poly.length - 1) / 2 | 0];
      const cx = 2*mid.x - (p0.x + p1.x)/2, cy = 2*mid.y - (p0.y + p1.y)/2;
      const tx = p1.x - cx, ty = p1.y - cy, L = Math.hypot(tx, ty) || 1;
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
          const h = eng.arrow({ poly: g.poly }, { mode: "curved" });
          if (!h) continue;                             // skipped (too short) is fine
          const tip = g.poly[g.poly.length - 1];
          const onBorder = Math.abs(Math.hypot(tip.x - b.x, tip.y - b.y) - Nodes.R) < 1.5;
          const T = arrivalTangent(g.poly);
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
    expect(eng.arrow({ poly }, { mode: "straight" })).toBe(null);
  });
});
