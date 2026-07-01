/* ============================================================================
   solvers/layered.js — Sugiyama-lite: the Dagre / ELK-family approach in four
   classic phases (layer assignment, crossing reduction, x-alignment,
   coordinate assignment). Pair with orthogonal routing for the flowchart.
   ========================================================================== */

import { Nodes, ORTHO } from "../router.js";
import { registerSolver } from "./registry.js";
import { makeConstructive } from "./constructive.js";

function layeredTargets(graph, bounds, params) {
  const { nodes, edges } = graph;
  const N = nodes.length;
  const trunk = !params || params.trunk !== false;   // straighten primary paths
  const adj = nodes.map(() => []);                  // undirected, for ordering
  const outAdj = nodes.map(() => []), inAdj = nodes.map(() => []);
  edges.forEach(e => {
    adj[e.source].push(e.target); adj[e.target].push(e.source);
    outAdj[e.source].push(e.target); inAdj[e.target].push(e.source);
  });

  // 1. layer assignment — longest-path along edge DIRECTION (source→target), so
  //    a DAG/flowchart flows top-down with its sources on top. Graph sources build
  //    edges with source<target, so this is acyclic; the pass count caps cycles.
  const layer = new Array(N).fill(0);
  for (let pass = 0; pass < N; pass++) {
    let changed = false;
    for (const e of edges)
      if (layer[e.target] < layer[e.source] + 1) { layer[e.target] = layer[e.source] + 1; changed = true; }
    if (!changed) break;
  }
  let maxL = 0; for (const l of layer) maxL = Math.max(maxL, l);
  const order = []; for (let l = 0; l <= maxL; l++) order.push([]);
  for (let i = 0; i < N; i++) order[layer[i]].push(i);

  // 2. crossing reduction — repeated barycenter sweeps, down then up
  const posOf = () => { const p = new Array(N);
    order.forEach(a => a.forEach((id, idx) => p[id] = idx)); return p; };
  const bary = (id, nl, p) => { let s = 0, c = 0;
    for (const v of adj[id]) if (layer[v] === nl) { s += p[v]; c++; }
    return c ? s / c : p[id]; };
  for (let sweep = 0; sweep < 12; sweep++) {
    let p = posOf();
    for (let l = 1; l <= maxL; l++) order[l].sort((a, b) => bary(a, l-1, p) - bary(b, l-1, p));
    p = posOf();
    for (let l = maxL-1; l >= 0; l--) order[l].sort((a, b) => bary(a, l+1, p) - bary(b, l+1, p));
  }

  // 3. x-coordinate alignment — the PRIORITY / MEDIAN method (à la Dagre). Each
  //    node is pulled to the MEDIAN of its neighbors in one adjacent layer, and
  //    higher-degree nodes win ties — so a node sits straight under its parent
  //    instead of being averaged off-axis. This is what removes needless bends:
  //    aligned parent↔child ports let the orthogonal router draw a single line.
  let sep = 44;
  for (const n of nodes) sep = Math.max(sep, Nodes.half(n).hw * 2 + 28);
  const x = new Array(N);
  order.forEach(arr => arr.forEach((id, idx) => x[id] = idx * sep));

  const median = vals => { vals.sort((p, q) => p - q); const m = vals.length >> 1;
    return vals.length % 2 ? vals[m] : (vals[m-1] + vals[m]) / 2; };

  // TRUNK: pick each node's primary child (the one with the deepest downstream
  // chain) and the matching primary parent. Hard-aligning these links keeps the
  // main flow dead straight; secondary branches get medianed and shoved aside.
  const depth = new Array(N).fill(-1);
  const calcDepth = u => { if (depth[u] >= 0) return depth[u]; depth[u] = 0;
    let d = 0; for (const v of outAdj[u]) d = Math.max(d, calcDepth(v) + 1);
    return (depth[u] = d); };
  for (let i = 0; i < N; i++) calcDepth(i);
  const primChild = new Array(N).fill(-1), primParent = new Array(N).fill(-1);
  for (let u = 0; u < N; u++) { let best = -1, bd = -1;
    for (const v of outAdj[u]) if (depth[v] > bd) { bd = depth[v]; best = v; }
    primChild[u] = best; }
  for (let v = 0; v < N; v++) { let best = -1, bd = -1;
    for (const u of inAdj[v]) if (primChild[u] === v && depth[u] > bd) { bd = depth[u]; best = u; }
    primParent[v] = best; }

  // align every layer to its neighbors `dl` layers away (-1 = parents above)
  function alignTo(dl) {
    const seq = []; for (let l = 0; l <= maxL; l++) seq.push(l);
    if (dl > 0) seq.reverse();
    for (const l of seq) {
      const arr = order[l]; if (arr.length < 1) continue;
      const want = {}, prio = {};
      for (const id of arr) {
        // trunk: hard-align to the primary link so the main path stays straight
        const prim = dl < 0 ? primParent[id] : primChild[id];
        if (trunk && prim !== -1) { want[id] = x[prim]; prio[id] = 1e6; continue; }
        const nb = [];
        for (const v of adj[id]) if (layer[v] === l + dl) nb.push(x[v]);
        want[id] = nb.length ? median(nb) : x[id];
        prio[id] = nb.length;
      }
      // place high-priority nodes first; they may shove lower-priority neighbors
      const byPrio = arr.map((_, i) => i).sort((a, b) => prio[arr[b]] - prio[arr[a]]);
      for (const i of byPrio) {
        const id = arr[i]; let target = want[id];
        if (target > x[id]) {                          // move right, up to next fixed peer
          let limit = Infinity;
          for (let j = i+1; j < arr.length; j++)
            if (prio[arr[j]] >= prio[id]) { limit = x[arr[j]] - (j - i) * sep; break; }
          target = Math.min(target, limit);
          if (target > x[id]) { x[id] = target;
            for (let j = i+1; j < arr.length; j++) {
              if (x[arr[j]] < x[arr[j-1]] + sep) x[arr[j]] = x[arr[j-1]] + sep; else break; } }
        } else if (target < x[id]) {                   // move left, up to next fixed peer
          let limit = -Infinity;
          for (let j = i-1; j >= 0; j--)
            if (prio[arr[j]] >= prio[id]) { limit = x[arr[j]] + (i - j) * sep; break; }
          target = Math.max(target, limit);
          if (target < x[id]) { x[id] = target;
            for (let j = i-1; j >= 0; j--) {
              if (x[arr[j]] > x[arr[j+1]] - sep) x[arr[j]] = x[arr[j+1]] - sep; else break; } }
        }
      }
    }
  }
  for (let pass = 0; pass < 4; pass++) { alignTo(-1); alignTo(+1); }
  alignTo(-1);                                          // finish top-down for tidy chains

  // 4. coordinate assignment — layer → y, aligned x as-is, snapped to the routing lattice so
  //    box centers land on grid lines (ports sit dead-center, aligned chains share an exact
  //    column → crisp straight edges).
  //    NATURAL spacing on BOTH axes — do NOT compress to the viewport. The old code scaled x
  //    into the bounds width and divided the bounds height by the layer count, so a small
  //    window squeezed the layout — and squeezing the vertical gap below what a tall node needs
  //    re-introduced the side-routing detour (a ~35px channel forces the 2-bend fallback; ~50px
  //    routes straight). The camera AUTO-FITS the result instead, so the layout keeps its
  //    natural size at any window size: `sep` already spaces columns by node width, and the gap
  //    below clears the tallest node.
  const H = bounds.y1 - bounds.y0;
  const cx = (bounds.x0 + bounds.x1) / 2;
  const bx = bounds.x0 - 36, by = bounds.y0 - 36;            // matches orthogonal grid origin
  const snap = (v, base) => base + Math.round((v - base) / ORTHO.cell) * ORTHO.cell;
  let minx = Infinity, maxx = -Infinity;
  for (const v of x) { if (v < minx) minx = v; if (v > maxx) maxx = v; }
  const mid = (minx + maxx) / 2;
  // The gap must clear the TALLEST node plus margins AND leave a routable vertical channel, or
  // the orthogonal router can't run a straight bottom→top edge and detours out the side. It's a
  // GRID MULTIPLE and only the stack ORIGIN is snapped, so every layer is on-grid AND all gaps
  // are identical (snapping each layer independently rounded a non-grid gap to 90 vs 105px).
  const cell = ORTHO.cell;
  const maxHalfH = nodes.reduce((m, n) => Math.max(m, Nodes.half(n).hh), 0);
  const need = 2 * maxHalfH + 2 * ORTHO.margin + 3 * cell;
  const gap = maxL === 0 ? 0 : Math.max(cell, Math.round(Math.max(7 * cell, need) / cell) * cell);
  const ytop = snap(bounds.y0 + (H - gap * maxL) / 2, by);         // center the stack, snap once
  const t = new Array(N);
  for (let i = 0; i < N; i++) {
    t[i] = {
      x: snap(cx + (x[i] - mid), bx),                               // natural column spacing (sep)
      y: maxL === 0 ? snap(bounds.y0 + H / 2, by) : ytop + gap * layer[i],   // already on-grid
    };
  }
  return t;
}

registerSolver({ id: "layered", create: makeConstructive("layered", layeredTargets) });
