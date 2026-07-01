/* ============================================================================
   solvers/constructive.js — shared tween helper for constructive solvers.

   Constructive solvers (layered, circular) compute target positions up front,
   then tween into place. This mirrors how a batch backend (Dagre, ELK) works —
   structure first, the facade just animates the result.
   ========================================================================== */

export function makeConstructive(name, computeTargets) {
  return (graph, bounds, params) => {
    const targets = computeTargets(graph, bounds, params);
    let iter = 0, settled = false;
    return {
      name,
      get done() { return settled; },
      get iter() { return iter; },
      step() {
        iter++;
        let maxd = 0;
        const ns = graph.nodes;
        for (let i = 0; i < ns.length; i++) {
          const n = ns[i], t = targets[i];
          if (n.fixed || !t) continue;
          n.x += (t.x - n.x) * 0.14;          // ease toward target
          n.y += (t.y - n.y) * 0.14;
          maxd = Math.max(maxd, Math.abs(t.x - n.x) + Math.abs(t.y - n.y));
        }
        if (maxd < 0.5) {                     // land exactly on targets (on-grid) → crisp edges
          for (let i = 0; i < ns.length; i++) {
            const n = ns[i], t = targets[i];
            if (t && !n.fixed) { n.x = t.x; n.y = t.y; }
          }
          settled = true;
        }
      },
    };
  };
}
