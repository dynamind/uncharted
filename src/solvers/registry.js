/* ============================================================================
   solvers/registry.js — the layout-solver registry.

   A Solver instance exposes: step() -> advance one iteration (mutates node
   positions in place), and a `done` flag. This iterative interface is what
   makes the solving *visible*; a batch backend like ELK would resolve its
   result behind the same seam.

     Solver = {
       id: string,
       create(graph, bounds, params) => { name, step(), done, iter },
     }

   This module owns only the registry state + accessors and imports nothing
   else, so solver files can `import { registerSolver }` and self-register at
   import time without a circular-dependency TDZ (solvers/index.js
   side-effect-imports them).
   ========================================================================== */

const solverList = [];
const byId = new Map();

export function registerSolver(solver) {
  if (byId.has(solver.id)) throw new Error(`duplicate solver id: ${solver.id}`);
  byId.set(solver.id, solver);
  solverList.push(solver);
  return solver;
}

export function solvers() {
  return solverList.slice();
}

export function getSolver(id) {
  const solver = byId.get(id);
  if (!solver) throw new Error("unknown solver: " + id);
  return solver;
}
