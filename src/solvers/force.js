/* ============================================================================
   solvers/force.js — Fruchterman–Reingold with cooling + center gravity.

   The original integrator stepped every node a fixed temp-sized jump along its
   net force, all at once (synchronous/Jacobi). Near equilibrium that overshoots
   in lock-step, so the whole graph flip-flopped between two mirror
   configurations every frame — the "cross-eyed" wobble. Two standard
   descent-stabilizers tame it, and the cooling schedule is unchanged in spirit
   (it still decides termination):
     • velocity as an exponential moving average of the force (DAMP) — an
       overshoot's reversed force is averaged in gradually, so the velocity
       eases through zero instead of slamming back; the EMA has unity DC gain,
       so velocity → 0 at equilibrium;
     • a learning rate LR < 1 on the step — keeps a stiff spring in the
       monotone-decay regime rather than the overshoot-oscillation one, so the
       residual jitter dies out.
   Cooling is *slow* (temp *= 0.99) so the damped dynamics always reach
   equilibrium before temp bottoms out — then `done` (temp < 0.35) reflects a
   genuinely settled layout, instead of freezing one mid-solve that then creeps
   further on the next Re-solve.
   ========================================================================== */

import { registerSolver } from "./registry.js";

registerSolver({
  id: "force",
  create(graph, bounds, params) {
    const { nodes, edges } = graph;
    const W = bounds.x1 - bounds.x0, H = bounds.y1 - bounds.y0;
    const area = W * H;
    let temp = Math.min(W, H) * 0.18;       // cooling cap on per-step travel
    let iter = 0;

    const DAMP = 0.9;         // velocity-EMA memory: higher = smoother/slower, more damping
    const LR = 0.6;           // step fraction along the velocity — <1 keeps a stiff spring in
                              // the monotone-decay regime instead of the overshoot-oscillation one

    for (const n of nodes) { n.vx = 0; n.vy = 0; }   // fresh velocities (also after Re-solve)

    const ideal = () => Math.sqrt(area / Math.max(1, nodes.length)) * (params.spacing ?? 0.62);

    return {
      name: "force",
      get done() { return temp < 0.35; },
      get iter() { return iter; },
      step() {
        iter++;
        const k = ideal();
        const grav = params.gravity ?? 0.03;
        const cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;

        for (const n of nodes) { n._dx = 0; n._dy = 0; }

        // repulsion (all pairs)
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i+1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = a.x - b.x, dy = a.y - b.y;
            let d = Math.hypot(dx, dy) || 0.01;
            if (d > k * 6) continue;            // cheap cutoff for far pairs
            const f = (k*k) / d;
            dx /= d; dy /= d;
            a._dx += dx*f; a._dy += dy*f;
            b._dx -= dx*f; b._dy -= dy*f;
          }
        }
        // attraction (edges as springs)
        for (const e of edges) {
          const a = nodes[e.source], b = nodes[e.target];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d = Math.hypot(dx, dy) || 0.01;
          const f = (d*d) / k;
          dx /= d; dy /= d;
          a._dx -= dx*f; a._dy -= dy*f;
          b._dx += dx*f; b._dy += dy*f;
        }
        // gravity toward center keeps the drawing on screen
        for (const n of nodes) {
          n._dx += (cx - n.x) * grav;
          n._dy += (cy - n.y) * grav;
        }
        // integrate: smooth each node's net force into a velocity (an exponential moving
        // average — DAMP is the memory), then step along it (LR < 1), clamped by the cooling
        // temp. The smoothing removes the cross-eyed wobble: when a node overshoots and its
        // force reverses, the averaged velocity eases through zero instead of slamming straight
        // back, so the period-2 flip-flop decays away. The EMA has unity DC gain, so at
        // equilibrium the velocity decays to zero on its own — slow cooling leaves time for
        // that to happen before temp bottoms out, so `done` (temp < 0.35) is a settled layout.
        for (const n of nodes) {
          if (n.fixed) { n.vx = 0; n.vy = 0; continue; }   // a dragged node carries no momentum
          n.vx = n.vx * DAMP + n._dx * (1 - DAMP);
          n.vy = n.vy * DAMP + n._dy * (1 - DAMP);
          const speed = Math.hypot(n.vx, n.vy) || 1e-9;
          const move = Math.min(speed * LR, temp);         // temp caps the actual travel
          n.x += n.vx / speed * move;                       // no hard container — gravity keeps it
          n.y += n.vy / speed * move;                       // cohesive; the camera auto-fits the result
        }
        temp *= 0.99;                           // cool (slow: leave the damped+LR dynamics time
                                                // to reach equilibrium before the freeze)
      },
    };
  },
});
