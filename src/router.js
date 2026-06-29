/* ============================================================================
   router.js — pure, DOM-free edge-routing + node geometry.

   Extracted from the monolith so it can be unit-tested (see test/router.test.js).
   Nothing here touches the canvas or the DOM; it only maps node positions to
   rendered polylines. The app imports Geo / Nodes / edgeGeometry from here.
   ========================================================================== */

// PathEngines live in ./paths and import primitives (Nodes, orthogonalGeometry)
// back from here. The cycle is safe: every cross-reference is call-time, never
// touched while the modules are still loading.
import { getPathEngine } from "./paths/index.js";
import { getRenderer } from "./renderers/index.js";

/* ---- geometry primitives ------------------------------------------------- */
export const Geo = {
  // Do segments p1->p2 and p3->p4 properly cross? Returns intersection point or null.
  segInt(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d = (x2-x1)*(y4-y3) - (y2-y1)*(x4-x3);
    if (Math.abs(d) < 1e-9) return null;            // parallel
    const t = ((x3-x1)*(y4-y3) - (y3-y1)*(x4-x3)) / d;
    const u = ((x3-x1)*(y2-y1) - (y3-y1)*(x2-x1)) / d;
    if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
    return { x: x1 + t*(x2-x1), y: y1 + t*(y2-y1), t };
  },
  sampleQuad(p0, c, p1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, mt = 1 - t;
      pts.push({
        x: mt*mt*p0.x + 2*mt*t*c.x + t*t*p1.x,
        y: mt*mt*p0.y + 2*mt*t*c.y + t*t*p1.y,
      });
    }
    return pts;
  },
  dist(ax, ay, bx, by) { return Math.hypot(ax-bx, ay-by); },
  clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
};

const clamp = Geo.clamp;

/* ---- node geometry — size, shape, border, hit-testing -------------------- */
export const Nodes = {
  R: 8,
  half(n) {
    if (n.shape === "rect" || n.shape === "diamond") return { hw: n.w/2, hh: n.h/2 };
    return { hw: this.R, hh: this.R };
  },
  // point on the node's border along the ray from its centre toward (tx,ty)
  boundary(n, tx, ty) {
    const dx = tx - n.x, dy = ty - n.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx/L, uy = dy/L, { hw, hh } = this.half(n);
    let s;
    if (n.shape === "rect")
      s = Math.min(hw / (Math.abs(ux) || 1e-6), hh / (Math.abs(uy) || 1e-6));
    else if (n.shape === "diamond")
      s = 1 / ((Math.abs(ux)/hw) + (Math.abs(uy)/hh) + 1e-9);
    else
      s = this.R;
    return { x: n.x + ux*s, y: n.y + uy*s };
  },
  hit(n, x, y) {
    if (n.shape === "rect" || n.shape === "diamond") {
      const { hw, hh } = this.half(n);
      return Math.abs(x - n.x) <= hw + 4 && Math.abs(y - n.y) <= hh + 4;
    }
    return Geo.dist(x, y, n.x, n.y) <= this.R + 5;
  },
  // is point (x,y) inside node n's body? (convex shape test, no margin)
  inBody(n, x, y) {
    const { hw, hh } = this.half(n);
    const dx = x - n.x, dy = y - n.y, shape = n.shape || "circle";
    if (shape === "circle")  return dx*dx + dy*dy <= this.R*this.R;
    if (shape === "diamond") return Math.abs(dx)/hw + Math.abs(dy)/hh <= 1;
    return Math.abs(dx) <= hw && Math.abs(dy) <= hh;          // rect
  },
  // Does segment (x1,y1)->(x2,y2) pass THROUGH node n's body (not merely graze a
  // corner)? An edge that runs across a non-incident node's interior is, visually
  // and combinatorially, a crossing — without this a solver can hide an edge
  // inside a node and report a fake 0 crossings (the Q₃ "cube-in-cube" trap). We
  // clip the segment to the (convex) shape and require a real penetration depth.
  segHitsBody(n, x1, y1, x2, y2) {
    const { hw, hh } = this.half(n);
    const ax = x1 - n.x, ay = y1 - n.y, dx = x2 - x1, dy = y2 - y1;
    const L = Math.hypot(dx, dy) || 1;
    const MIN = 3;                                   // ignore sub-3px grazes
    const shape = n.shape || "circle";
    let t0 = 0, t1 = 1;
    if (shape === "circle") {
      // |(ax,ay) + t·(dx,dy)| ≤ R  →  A t² + B t + C ≤ 0
      const A = dx*dx + dy*dy, B = 2*(ax*dx + ay*dy), C = ax*ax + ay*ay - this.R*this.R;
      const disc = B*B - 4*A*C;
      if (disc <= 0) return false;
      const sq = Math.sqrt(disc);
      t0 = (-B - sq) / (2*A); t1 = (-B + sq) / (2*A);
    } else {
      // convex body as half-planes nx·x + ny·y ≤ c; clip [0,1] to the inside.
      const planes = shape === "diamond"
        ? [[1/hw, 1/hh, 1], [1/hw, -1/hh, 1], [-1/hw, 1/hh, 1], [-1/hw, -1/hh, 1]]
        : [[1, 0, hw], [-1, 0, hw], [0, 1, hh], [0, -1, hh]];
      for (const [nx, ny, c] of planes) {
        const denom = nx*dx + ny*dy, num = c - (nx*ax + ny*ay);   // inside ⇔ denom·t ≤ num
        if (Math.abs(denom) < 1e-12) { if (num < 0) return false; }
        else if (denom > 0) t1 = Math.min(t1, num/denom);
        else t0 = Math.max(t0, num/denom);
        if (t0 > t1) return false;
      }
    }
    t0 = Math.max(0, t0); t1 = Math.min(1, t1);
    return (t1 - t0) * L > MIN;
  },
};

export const ORTHO = { cell: 15, margin: 11, turn: 8 };

// Fan order for several edges leaving the SAME side of a node: the angle to each
// target, measured around the side's outward normal so it increases along the
// side's tangent. Ordering ports by this key keeps the fanned edges from crossing
// each other (the nearer target turns first, on the outer port).
function fanKey(side, dx, dy) {
  if (side === "r") return Math.atan2(dy, dx);
  if (side === "l") return Math.atan2(dy, -dx);
  if (side === "b") return Math.atan2(dx, dy);
  return Math.atan2(dx, -dy);                       // "t"
}

/* ---- min-heap for A* ----------------------------------------------------- */
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(it) { const a = this.a; a.push(it); let i = a.length-1;
    while (i > 0) { const p = (i-1)>>1; if (a[p].f <= a[i].f) break; [a[p],a[i]]=[a[i],a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) {
      let l = 2*i+1, r = l+1, s = i;
      if (l < a.length && a[l].f < a[s].f) s = l;
      if (r < a.length && a[r].f < a[s].f) s = r;
      if (s === i) break; [a[s],a[i]]=[a[i],a[s]]; i = s; } }
    return top; }
}

/* ---- orthogonal (Manhattan) routing via grid A* -------------------------- */
// `prev` (optional): the previously chosen [sourceSide, targetSide] per edge. When
// supplied, an edge KEEPS its previous sides unless a strictly-fewer-bend route now
// exists (hysteresis) — so routes don't twitch as a box is dragged, and the user can
// pick a side by the direction they approach from. Tests omit `prev` → pure bend-min.
export function orthogonalGeometry(graph, bounds, prev) {
  const { nodes, edges } = graph, C = ORTHO;
  const x0 = bounds.x0 - 36, y0 = bounds.y0 - 36;
  const cols = Math.ceil((bounds.x1 - x0 + 36) / C.cell) + 1;
  const rows = Math.ceil((bounds.y1 - y0 + 36) / C.cell) + 1;
  const gx = px => Math.round((px - x0) / C.cell);
  const gy = py => Math.round((py - y0) / C.cell);
  const wx = cx => x0 + cx * C.cell, wy = cy => y0 + cy * C.cell;
  const occ = new Uint8Array(cols * rows);          // 1 = blocked by a node

  nodes.forEach(n => {
    const { hw, hh } = Nodes.half(n);
    const cx0 = gx(n.x-hw-C.margin), cx1 = gx(n.x+hw+C.margin);
    const cy0 = gy(n.y-hh-C.margin), cy1 = gy(n.y+hh+C.margin);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      occ[cy*cols + cx] = 1;
    }
  });
  const free = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && occ[y*cols + x] === 0;

  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  const dirOf = st => st[0] === 1 ? 0 : st[0] === -1 ? 1 : st[1] === 1 ? 2 : 3;
  // sd = direction A* "arrives" travelling at the start (the source port's stub
  // direction). Without it A* turns freely at the first cell and wastes the stub,
  // adding a bend (e.g. a right-exit then an immediate down = an extra corner).
  function astar(sx, sy, gxc, gyc, sd = -1) {
    if (!free(sx, sy) || !free(gxc, gyc) || (sx === gxc && sy === gyc)) return null;
    const skey = (x, y, d) => ((y*cols + x) << 3) | (d + 1);
    const g = new Map(), came = new Map(), heap = new MinHeap();
    const h = (x, y) => Math.abs(x-gxc) + Math.abs(y-gyc);
    g.set(skey(sx,sy,sd), 0);
    heap.push({ x: sx, y: sy, d: sd, f: h(sx,sy) });
    let end = null;
    while (heap.size) {
      const cur = heap.pop(), ck = skey(cur.x, cur.y, cur.d), cg = g.get(ck);
      if (cg === undefined) continue;
      if (cur.x === gxc && cur.y === gyc) { end = ck; break; }
      for (let di = 0; di < 4; di++) {
        const nx = cur.x + DIRS[di][0], ny = cur.y + DIRS[di][1];
        if (!free(nx, ny)) continue;
        const ng = cg + 1 + (cur.d !== -1 && cur.d !== di ? C.turn : 0);
        const nk = skey(nx, ny, di);
        if (g.get(nk) === undefined || ng < g.get(nk)) {
          g.set(nk, ng); came.set(nk, ck);
          heap.push({ x: nx, y: ny, d: di, f: ng + h(nx, ny) });
        }
      }
    }
    if (end === null) return null;
    const path = [];
    for (let k = end; k !== undefined; k = came.get(k)) {
      const idx = k >> 3; path.push({ x: idx % cols, y: (idx / cols) | 0 });
    }
    return path.reverse();
  }

  // border distance perpendicular to a side, at distance `off` ALONG it:
  // rect = flat, diamond = angled face, circle = round.
  function borderPerp(shape, off, along, perp) {
    if (shape === "diamond") return perp * (1 - Math.min(1, Math.abs(off) / along));
    if (shape === "circle")  return Math.sqrt(Math.max(0, perp*perp - off*off));
    return perp;
  }
  // a port on an explicit side, offset along that side. The attach point is the
  // node's EXACT coordinate (n.x+off), NOT snapped to the lattice — otherwise the
  // port jumps a whole cell at a time as the box is dragged pixel-by-pixel. The
  // grid col/row (used only to seed A*) is still the snapped cell.
  function makePort(n, side, off) {
    const { hw, hh } = Nodes.half(n);
    const shape = n.shape || "circle";
    if (side === "t" || side === "b") {
      const px = n.x + off;
      const by = borderPerp(shape, off, hw, hh);
      const y = n.y + (side === "b" ? by : -by);
      return { x: px, y, col: gx(px), row: gy(y), step: side === "b" ? [0,1] : [0,-1], vert: true };
    }
    const py = n.y + off;
    const bx = borderPerp(shape, off, hh, hw);
    const x = n.x + (side === "r" ? bx : -bx);
    return { x, y: py, col: gx(x), row: gy(py), step: side === "r" ? [1,0] : [-1,0], vert: false };
  }
  function outer(p) {
    let c = p.col, r = p.row;
    for (let i = 0; i < 8; i++) {
      c += p.step[0]; r += p.step[1];
      if (free(c, r)) return { c, r };
    }
    return null;
  }
  const collinear = (p, q, r) =>
    Math.abs((q.x-p.x)*(r.y-p.y) - (q.y-p.y)*(r.x-p.x)) < 0.5;
  function simplify(poly) {
    const out = [poly[0]];
    for (let i = 1; i < poly.length - 1; i++)
      if (!collinear(out[out.length-1], poly[i], poly[i+1])) out.push(poly[i]);
    out.push(poly[poly.length-1]);
    return out;
  }
  function elbow(pa, pb) {
    const a = { x: pa.x, y: pa.y }, b = { x: pb.x, y: pb.y };
    if (pa.vert && pb.vert) { const my = (a.y+b.y)/2; return [a, {x:a.x,y:my}, {x:b.x,y:my}, b]; }
    if (!pa.vert && !pb.vert) { const mx = (a.x+b.x)/2; return [a, {x:mx,y:a.y}, {x:mx,y:b.y}, b]; }
    return pa.vert ? [a, {x:a.x,y:b.y}, b] : [a, {x:b.x,y:a.y}, b];
  }
  const polyLen = poly => { let s = 0;
    for (let i = 1; i < poly.length; i++) s += Math.abs(poly[i].x-poly[i-1].x) + Math.abs(poly[i].y-poly[i-1].y);
    return s; };
  // Slide the initial (fromStart) / final stub RUN onto the port's exact axis. A*
  // routes on the fixed lattice, but the ports sit at the node's exact off-lattice
  // position; without this the stub from the exact port to the first lattice cell
  // would be a diagonal. We move the whole run (consecutive cells sharing the stub
  // axis) to the port coordinate, so the stub stays straight and the following
  // segment just starts at the port's coordinate — everything stays axis-aligned.
  function alignStub(poly, port, fromStart) {
    const n = poly.length;
    const axis = port.vert ? "x" : "y", v = port.vert ? port.x : port.y;
    if (fromStart) { const a0 = poly[1][axis];
      for (let i = 1; i < n-1 && Math.abs(poly[i][axis] - a0) < 0.5; i++) poly[i][axis] = v;
    } else { const a0 = poly[n-2][axis];
      for (let i = n-2; i > 0 && Math.abs(poly[i][axis] - a0) < 0.5; i--) poly[i][axis] = v;
    }
  }
  // route between two explicit ports; null if A* can't reach. Seed A* with the
  // source stub direction so the first segment isn't wasted on a needless corner.
  function routePorts(pa, pb) {
    const oa = outer(pa), ob = outer(pb);
    const path = oa && ob ? astar(oa.c, oa.r, ob.c, ob.r, dirOf(pa.step)) : null;
    if (!path) return null;
    const poly = [{ x: pa.x, y: pa.y }];
    for (const p of path) poly.push({ x: wx(p.x), y: wy(p.y) });
    poly.push({ x: pb.x, y: pb.y });
    alignStub(poly, pa, true);
    alignStub(poly, pb, false);
    return simplify(poly);
  }

  // PHASE 1 — choose sides per edge by MINIMISING BENDS over the candidate pairs.
  //   • Stacked (boxes vertically separated): try both source exits × both target
  //     entries. A bend tie prefers top-entry / vertical (down-flow), so we get a
  //     straight trunk when aligned, a 1-bend L "side-of-A → top-of-B" when B is
  //     well off to the side, and a 1-bend "bottom-of-A → side-of-B" when B is
  //     mostly below but slightly aside (entering the side beats the 2-bend S).
  //   • Level (overlap vertically): side-to-side only — don't let a coincidentally
  //     1-bend bottom exit flip in as you drag.
  //   • Tight/degenerate (best still >2 bends): fall back to all pairs + same-side
  //     U-turns, ranked by GRID-QUANTISED length so near-equal options (t/t vs b/b)
  //     don't flicker on sub-pixel changes; a fixed order breaks exact ties.
  // length bucketed to a coarse DEADBAND so near-equal options (t/t vs b/b) don't
  // flicker as a box moves by a pixel; within a bucket a fixed candidate order (idx)
  // decides, so the choice is stable. Length only wins when it CLEARLY differs.
  const lenBucket = poly => Math.round(polyLen(poly) / (C.cell * 4));
  const evalSides = (a, b, s, pref, idx) => {
    const poly = routePorts(makePort(a, s[0], 0), makePort(b, s[1], 0));
    const bends = poly ? poly.length - 2 : Infinity;
    const score = poly ? bends*1e7 + pref*1e4 + lenBucket(poly)*100 + idx : Infinity;
    return { s, bends, score };
  };
  const usePrev = prev && prev.length === edges.length;
  const sides = edges.map((e, ei) => {
    const a = nodes[e.source], b = nodes[e.target];
    const ha = Nodes.half(a), hb = Nodes.half(b);
    const vGap = Math.max((b.y-hb.hh)-(a.y+ha.hh), (a.y-ha.hh)-(b.y+hb.hh));
    const below = b.y >= a.y, right = b.x >= a.x;
    const saV = below ? "b" : "t", saH = right ? "r" : "l";   // source sides toward B
    const tbV = below ? "t" : "b", tbH = right ? "l" : "r";   // target sides toward A
    const cands = vGap > 0
      ? [[saV, tbV, 0], [saH, tbV, 1], [saV, tbH, 2], [saH, tbH, 3]]   // stacked
      : [[saH, tbH, 0]];                                               // level
    let best = null;
    cands.forEach(([s0, s1, p], i) => {
      const r = evalSides(a, b, [s0, s1], p, i);
      if (!best || r.score < best.score) best = r;
    });
    if (best.bends > 2) {                                              // tight → go around
      const fb = [["b","b"], ["t","t"], ["r","r"], ["l","l"],   // b/b wins U-turn ties (down-flow)
                  [saV,tbV], [saH,tbV], [saV,tbH], [saH,tbH]];
      fb.forEach((s, i) => {
        const r = evalSides(a, b, s, 50, i);
        if (r.score < best.score) best = r;
      });
    }
    // hysteresis: stick with the previous sides unless the new best has strictly
    // FEWER bends (a genuine improvement). Keeps the route from twitching as a box
    // moves, and lets the drag direction choose the side.
    if (usePrev && prev[ei]) {
      const pr = evalSides(a, b, prev[ei], 0, 0);
      if (pr.bends <= best.bends) return prev[ei];
    }
    return best.s;
  });

  // PHASE 2 — offsets along each chosen side. k edges sharing a side **divide the
  // side into k+1 even sections**, ports at the interior boundaries (fan-ordered so
  // siblings never cross). A "straight" edge — one whose target is lined up with the
  // node centre on this side, so it would leave perpendicular (axis ≈ 0) — keeps the
  // CENTRE and the others spread evenly on each side of it; this is what keeps a
  // layered trunk a dead-straight column (the spine edge is the straight one) without
  // the router needing to know about the solver's trunk toggle. With no straight edge
  // (or a single one), everyone just shares the even k+1 division.
  const STRAIGHT = 4;                                  // |lean| under this ⇒ "straight out"
  const offAt = new Map();
  {
    const groups = new Map();
    const add = (ni, side, key, n, other) => {
      const { hw, hh } = Nodes.half(n);
      const along = (side === "t" || side === "b") ? hw : hh;
      const axis  = (side === "t" || side === "b") ? other.x - n.x : other.y - n.y;
      const lim = along * (n.shape === "diamond" ? 0.5 : 1);   // usable half-face (full for rect)
      const fan = fanKey(side, other.x - n.x, other.y - n.y);
      const gk = ni + ":" + side;
      (groups.get(gk) || groups.set(gk, []).get(gk)).push({ key, axis, lim, fan });
    };
    edges.forEach((e, ei) => {
      add(e.source, sides[ei][0], ei*2,   nodes[e.source], nodes[e.target]);
      add(e.target, sides[ei][1], ei*2+1, nodes[e.target], nodes[e.source]);
    });
    for (const arr of groups.values()) {
      const k = arr.length, lim = arr[0].lim;
      if (k === 1) { offAt.set(arr[0].key, 0); continue; }
      arr.sort((p, q) => p.fan - q.fan);                 // fan order ⇒ no self-crossing
      const ti = arr.findIndex(r => Math.abs(r.axis) < STRAIGHT);   // the straight / trunk edge
      if (ti >= 0) {
        offAt.set(arr[ti].key, 0);                       // trunk pinned dead-centre
        for (let i = 0; i < ti; i++)  offAt.set(arr[i].key, -lim * (ti - i) / (ti + 1));
        for (let i = ti + 1; i < k; i++) offAt.set(arr[i].key, lim * (i - ti) / (k - ti));
      } else {
        for (let i = 0; i < k; i++) offAt.set(arr[i].key, -lim + 2*lim*(i + 1)/(k + 1));
      }
    }
  }

  // PHASE 3 — final geometry with offset ports.
  const geoms = edges.map((e, ei) => {
    const a = nodes[e.source], b = nodes[e.target];
    const pa = makePort(a, sides[ei][0], offAt.get(ei*2) || 0);
    const pb = makePort(b, sides[ei][1], offAt.get(ei*2+1) || 0);
    const poly = routePorts(pa, pb) || elbow(pa, pb);
    return { poly, a, b, sides: sides[ei] };
  });

  // PHASE 4 — channel separation. A* routes each edge independently over the
  // shared occ grid, so two edges can land in the SAME lane and draw collinearly
  // on top of each other — segInt returns null for parallels, so it isn't even a
  // "crossing"/hop, the lines just merge into one. Fan such co-running segments
  // into parallel tracks (see separateLanes).
  separateLanes(geoms);
  return geoms;
}

/* ---- channel separation -------------------------------------------------- */
// Nudge edge segments that share a grid lane apart into parallel tracks. We only
// touch INTERIOR segments — those whose BOTH endpoints are bends — so the port
// endpoints (poly[0] / poly[last], pinned on the node border) never move and the
// bend count is unchanged. A horizontal interior segment is shifted in y, a
// vertical one in x; the shift moves only the two shared bend vertices, so the
// perpendicular neighbour segments just grow/shrink and everything stays axis-
// aligned. Shifts compose cleanly: a corner shared by a horizontal and a vertical
// interior segment gets an independent y- and x-nudge.
const LANE_TOL = 6;     // segments within this perpendicular gap count as one lane
const LANE_STEP = 7;    // px between separated parallel tracks
export function separateLanes(geoms) {
  // interior segments: index i in [1 .. poly.length-3] (skip the two port stubs).
  const H = [], V = [];   // {gi, pi, lane, lo, hi, key}
  geoms.forEach((g, gi) => {
    const p = g.poly;
    for (let i = 1; i < p.length - 2; i++) {
      const a = p[i], b = p[i+1];
      const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
      if (dy < 1.5 && dx >= 1.5)        // horizontal: lane = y, ordered by neighbour y
        H.push({ gi, pi: i, lane: a.y, lo: Math.min(a.x,b.x), hi: Math.max(a.x,b.x),
                 key: p[i-1].y + p[i+2].y });
      else if (dx < 1.5 && dy >= 1.5)   // vertical: lane = x, ordered by neighbour x
        V.push({ gi, pi: i, lane: a.x, lo: Math.min(a.y,b.y), hi: Math.max(a.y,b.y),
                 key: p[i-1].x + p[i+2].x });
    }
  });

  // delta accumulator per (geom, point); ports never receive a delta.
  const dpos = geoms.map(g => g.poly.map(() => ({ dx: 0, dy: 0 })));

  // cluster segments of one orientation that share a lane AND overlap along it,
  // then spread the cluster symmetrically. `axis` is "dy" (horizontal) or "dx".
  const spread = (segs, axis) => {
    segs.sort((s, t) => s.lane - t.lane || s.lo - t.lo);
    let i = 0;
    while (i < segs.length) {
      // grow a lane band: contiguous segments within LANE_TOL of the band's lane
      let j = i + 1;
      while (j < segs.length && segs[j].lane - segs[i].lane < LANE_TOL) j++;
      const band = segs.slice(i, j);
      i = j;
      // within the band, find overlapping-extent clusters (a sweep over [lo,hi])
      band.sort((s, t) => s.lo - t.lo);
      let k = 0;
      while (k < band.length) {
        let m = k + 1, reach = band[k].hi;
        while (m < band.length && band[m].lo < reach - 0.5) { reach = Math.max(reach, band[m].hi); m++; }
        const cluster = band.slice(k, m);
        k = m;
        if (cluster.length < 2) continue;
        // order by the perpendicular centre of each segment's neighbours so the
        // track that arrives from "above" stays above — minimises new crossings.
        cluster.sort((s, t) => s.key - t.key || s.gi - t.gi);
        const n = cluster.length;
        cluster.forEach((s, idx) => {
          const off = (idx - (n - 1) / 2) * LANE_STEP;
          dpos[s.gi][s.pi][axis] += off;
          dpos[s.gi][s.pi + 1][axis] += off;
        });
      }
    }
  };
  spread(H, "dy");
  spread(V, "dx");

  geoms.forEach((g, gi) => {
    const d = dpos[gi];
    g.poly = g.poly.map((pt, i) => ({ x: pt.x + d[i].dx, y: pt.y + d[i].dy }));
  });
  return geoms;
}

/* ---- arrowhead geometry -------------------------------------------------- */
// Tip + base for a directed arrowhead at the TARGET end of a rendered polyline.
// Returns { tx, ty (tip, on the border), bx, by (base centre), ux, uy (unit heading
// tip←base) } — or null when the edge is shorter than the glyph (skip it).
//
// The defining requirement: BOTH the tip and the base must lie ON the drawn line,
// so the triangle's wide end can never drift off the curve (the failure you get
// when you derive a direction and then step `back` px along *that* instead of along
// the line — on a bulged/dragged short edge the two diverge and the base floats off).
//   • curved / straight → the base is where the polyline first crosses a circle of
//     radius `back` around the tip, scanning outward from the tip. That point is on
//     the line by construction, exactly `back` px from the tip, on the outside — so
//     the heading is the line's own direction at the tip and always points inward.
//   • orthogonal → step `back` along the axis-aligned final segment instead (a line
//     point would round the corner and tilt the arrow off-axis).
export function arrowHeading(poly, source, target, mode, back = 11) {
  const tip = poly[poly.length - 1], first = poly[0];
  if (Math.hypot(tip.x - first.x, tip.y - first.y) < back) return null;   // edge shorter than glyph
  let bx, by;
  if (mode === "orthogonal") {
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
}

/* ---- routing dispatch (straight | curved | orthogonal) -------------------
   A routing mode = a (PathEngine, Renderer) pair. The PathEngine produces the
   logical, border-clipped spine; the Renderer flattens it into the drawn polyline
   (+ per-vertex tangents). Curvature is a render concern, so straight and curved
   share the `direct` 2-port spine and differ only in the renderer. Orthogonal
   draws straight through its bend spine (a rounded-corner renderer could replace
   that later). */
const ROUTING = {
  straight:   { path: "direct",     render: "straight" },
  curved:     { path: "direct",     render: "curved"   },
  orthogonal: { path: "orthogonal", render: "straight" },
};

export function edgeGeometry(graph, mode, bounds, prev) {
  const cfg = ROUTING[mode] || ROUTING.curved;
  const paths = getPathEngine(cfg.path).route(graph, bounds, prev);
  const renderer = getRenderer(cfg.render);
  return paths.map((pth, i) => {
    const { poly, tangents } = renderer.render(pth, { index: i });
    const g = { poly, tangents, a: pth.a, b: pth.b };
    if (pth.sides) g.sides = pth.sides;          // preserve orthogonal hysteresis state
    return g;
  });
}

// bends in a (simplified) polyline = interior vertices.
export function bendCount(poly) { return Math.max(0, poly.length - 2); }
