/* ============================================================================
   objective.js — the combinatorial cost the solvers fight against.

   Everything (the live metric, the hops, and the metaheuristics) reads
   crossings from here, so the number on screen is the number being optimized.
   Crossings use straight chords between node centers — the classic
   straight-line crossing number — while edges are merely *drawn* curved.

   Pure and DOM-free (like router.js), so it's unit-testable in isolation.
   Not a registry: nothing else implements a second Objective.
   ========================================================================== */

import { Geo, Nodes } from "./router.js";

export const Objective = {
  minDist: 34,                       // nodes closer than this "overlap"
  idealK(graph, bounds) {
    const W = bounds.x1 - bounds.x0, H = bounds.y1 - bounds.y0;
    return Math.sqrt((W*H) / Math.max(1, graph.nodes.length)) * 0.6;
  },
  // all pairwise edge crossings (non-adjacent edges) with intersection points
  crossings(graph) {
    const { nodes, edges } = graph, out = [];
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i], a = nodes[e.source], b = nodes[e.target];
      for (let j = i+1; j < edges.length; j++) {
        const f = edges[j];
        if (e.source===f.source || e.source===f.target ||
            e.target===f.source || e.target===f.target) continue;
        const c = nodes[f.source], d = nodes[f.target];
        const hit = Geo.segInt(a.x,a.y,b.x,b.y, c.x,c.y,d.x,d.y);
        if (hit) out.push({ x: hit.x, y: hit.y, eA: i, eB: j });
      }
    }
    return out;
  },
  // edges that run THROUGH a non-incident node's body. Geometrically these are
  // crossings too; counting them stops hillclimb/SA hiding an edge inside a node
  // to fake a 0-crossing layout (the Q₃ cube-in-cube trap the user hit).
  nodePierces(graph) {
    const { nodes, edges } = graph; let n = 0;
    for (const e of edges) {
      const a = nodes[e.source], b = nodes[e.target];
      for (let k = 0; k < nodes.length; k++) {
        if (k === e.source || k === e.target) continue;
        if (Nodes.segHitsBody(nodes[k], a.x, a.y, b.x, b.y)) n++;
      }
    }
    return n;
  },
  totalLength(graph) {
    let s = 0;
    for (const e of graph.edges) {
      const a = graph.nodes[e.source], b = graph.nodes[e.target];
      s += Geo.dist(a.x, a.y, b.x, b.y);
    }
    return s;
  },
  // Penalise *deviation* from the ideal length k, not raw length — otherwise the
  // optimizer just collapses the whole graph toward a point.
  lengthPenalty(graph, k) {
    let p = 0;
    for (const e of graph.edges) {
      const a = graph.nodes[e.source], b = graph.nodes[e.target];
      p += Math.abs(Geo.dist(a.x, a.y, b.x, b.y) - k) / k;
    }
    return p;
  },
  overlap(graph) {
    const { nodes } = graph; let p = 0;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i+1; j < nodes.length; j++) {
        const d = Geo.dist(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
        if (d < this.minDist) p += (this.minDist - d);
      }
    return p;
  },
  // weighted total — what SA/hillclimb minimize. A node-pierce counts as a
  // crossing (same weight) so the optimizer can't route through a node for free.
  full(graph, bounds, w) {
    const k = this.idealK(graph, bounds);
    const cr = this.crossings(graph).length + this.nodePierces(graph);
    const lenPen = this.lengthPenalty(graph, k);
    const ov = this.overlap(graph);
    return w.cross*cr*10 + w.len*lenPen + w.overlap*(ov/this.minDist);
  },
};
