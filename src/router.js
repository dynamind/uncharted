/* ============================================================================
   router.js — pure, DOM-free edge-routing + node geometry.

   Extracted from the monolith so it can be unit-tested (see test/router.test.js).
   Nothing here touches the canvas or the DOM; it only maps node positions to
   rendered polylines. The app imports Geo / Nodes / edgeGeometry from here.
   ========================================================================== */

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
};

export const ORTHO = { cell: 15, margin: 11, turn: 8 };
const SAMPLES = 18;        // bezier samples per curved edge

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
export function orthogonalGeometry(graph, bounds) {
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
  // a port on an explicit side, offset along that side
  function makePort(n, side, off) {
    const { hw, hh } = Nodes.half(n);
    const shape = n.shape || "circle";
    if (side === "t" || side === "b") {
      const px = wx(gx(n.x + off));
      const by = borderPerp(shape, px - n.x, hw, hh);
      const y = n.y + (side === "b" ? by : -by);
      return { x: px, y, col: gx(px), row: gy(y), step: side === "b" ? [0,1] : [0,-1], vert: true };
    }
    const py = wy(gy(n.y + off));
    const bx = borderPerp(shape, py - n.y, hh, hw);
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
  // route between two explicit ports; null if A* can't reach. Seed A* with the
  // source stub direction so the first segment isn't wasted on a needless corner.
  function routePorts(pa, pb) {
    const oa = outer(pa), ob = outer(pb);
    const path = oa && ob ? astar(oa.c, oa.r, ob.c, ob.r, dirOf(pa.step)) : null;
    if (!path) return null;
    const poly = [{ x: pa.x, y: pa.y }];
    for (const p of path) poly.push({ x: wx(p.x), y: wy(p.y) });
    poly.push({ x: pb.x, y: pb.y });
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
  const sides = edges.map(e => {
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
    return best.s;
  });

  // PHASE 2 — offsets along each chosen side: lean toward the endpoint, then
  // de-collide edges sharing a side (single-edge sides stay centred; trunk at 0).
  const SEP = C.cell + 6;
  const offAt = new Map();
  {
    const groups = new Map();
    const add = (ni, side, key, n, other) => {
      const { hw, hh } = Nodes.half(n);
      const along = (side === "t" || side === "b") ? hw : hh;
      const axis  = (side === "t" || side === "b") ? other.x - n.x : other.y - n.y;
      const lim = along * (nodes[ni].shape === "diamond" ? 0.5 : 0.7);
      const fan = fanKey(side, other.x - n.x, other.y - n.y);
      const gk = ni + ":" + side;
      (groups.get(gk) || groups.set(gk, []).get(gk)).push({ key, want: clamp(axis, -lim, lim), along, fan });
    };
    edges.forEach((e, ei) => {
      add(e.source, sides[ei][0], ei*2,   nodes[e.source], nodes[e.target]);
      add(e.target, sides[ei][1], ei*2+1, nodes[e.target], nodes[e.source]);
    });
    for (const arr of groups.values()) {
      if (arr.length === 1) { offAt.set(arr[0].key, 0); continue; }
      arr.sort((p, q) => p.fan - q.fan || p.want - q.want);   // fan order ⇒ no self-crossing
      const pos = arr.map(r => r.want);
      for (let i = 1; i < pos.length; i++) if (pos[i] < pos[i-1] + SEP) pos[i] = pos[i-1] + SEP;
      for (let i = pos.length-2; i >= 0; i--) if (pos[i] > pos[i+1] - SEP) pos[i] = pos[i+1] - SEP;
      const lim = arr[0].along * 0.82, span = pos[pos.length-1] - pos[0];
      if (span > 2*lim) for (let i = 0; i < pos.length; i++) pos[i] = -lim + 2*lim*i/(pos.length-1);
      else { const sh = pos[0] < -lim ? -lim - pos[0] : pos[pos.length-1] > lim ? lim - pos[pos.length-1] : 0;
             for (let i = 0; i < pos.length; i++) pos[i] += sh; }
      arr.forEach((r, i) => offAt.set(r.key, pos[i]));
    }
  }

  // PHASE 3 — final geometry with offset ports.
  return edges.map((e, ei) => {
    const a = nodes[e.source], b = nodes[e.target];
    const pa = makePort(a, sides[ei][0], offAt.get(ei*2) || 0);
    const pb = makePort(b, sides[ei][1], offAt.get(ei*2+1) || 0);
    const poly = routePorts(pa, pb) || elbow(pa, pb);
    return { poly, a, b, sides: sides[ei] };
  });
}

/* ---- routing dispatch (straight | curved | orthogonal) ------------------- */
export function edgeGeometry(graph, mode, bounds) {
  if (mode === "orthogonal") return orthogonalGeometry(graph, bounds);
  const { nodes, edges } = graph;
  return edges.map((e, i) => {
    const a = nodes[e.source], b = nodes[e.target];
    let poly;
    if (mode === "curved") {
      const p0 = { x: a.x, y: a.y }, p1 = { x: b.x, y: b.y };
      const mx = (p0.x+p1.x)/2, my = (p0.y+p1.y)/2;
      const dx = p1.x-p0.x, dy = p1.y-p0.y, len = Math.hypot(dx, dy) || 1;
      const off = Math.min(34, len*0.11) * ((i % 2) ? 1 : -1);
      const c = { x: mx - dy/len*off, y: my + dx/len*off };
      poly = Geo.sampleQuad(p0, c, p1, SAMPLES);
      poly[0] = Nodes.boundary(a, poly[1].x, poly[1].y);
      poly[poly.length-1] = Nodes.boundary(b, poly[poly.length-2].x, poly[poly.length-2].y);
    } else {
      poly = [Nodes.boundary(a, b.x, b.y), Nodes.boundary(b, a.x, a.y)];
    }
    return { poly, a, b };
  });
}

// bends in a (simplified) polyline = interior vertices.
export function bendCount(poly) { return Math.max(0, poly.length - 2); }
