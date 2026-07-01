import { describe, it, expect } from "vitest";
import { registerSolver, solvers, getSolver } from "../src/solvers/registry.js";
import "../src/solvers/index.js";
import { Objective } from "../src/objective.js";

const bounds = { x0: 0, y0: 0, x1: 600, y1: 600 };
const params = {
  spacing: 0.62, gravity: 0.03,
  cooling: 0.97,
  trunk: true,
  weights: { cross: 1, len: 1, overlap: 1 },
};

// A small crossed-quadrilateral fixture: 0-1 and 2-3 cross as drawn, 4 nodes total.
function crossedGraph() {
  return {
    nodes: [
      { x: 50, y: 50, id: 0 }, { x: 550, y: 550, id: 1 },
      { x: 550, y: 50, id: 2 }, { x: 50, y: 550, id: 3 },
    ],
    edges: [{ source: 0, target: 1 }, { source: 2, target: 3 }],
  };
}

function chainGraph() {
  // A -> B, A -> C, B -> D, C -> D  (a diamond DAG)
  return {
    nodes: [{ x: 300, y: 100, id: 0 }, { x: 150, y: 300, id: 1 },
             { x: 450, y: 300, id: 2 }, { x: 300, y: 500, id: 3 }],
    edges: [{ source: 0, target: 1 }, { source: 0, target: 2 },
             { source: 1, target: 3 }, { source: 2, target: 3 }],
  };
}

describe("solver registry", () => {
  it("throws on duplicate id", () => {
    expect(() => registerSolver({ id: "force", create: () => {} })).toThrow(/duplicate solver id/);
  });

  it("throws on unknown id", () => {
    expect(() => getSolver("nonexistent")).toThrow(/unknown solver/);
  });

  it("registers all five solvers", () => {
    const ids = solvers().map(s => s.id).sort();
    expect(ids).toEqual(["annealing", "circular", "force", "hillclimb", "layered"]);
  });
});

describe("force solver", () => {
  it("reduces total objective cost over iterations on a crossed graph", () => {
    const graph = crossedGraph();
    const before = Objective.full(graph, bounds, params.weights);
    const solver = getSolver("force").create(graph, bounds, params);
    for (let i = 0; i < 200 && !solver.done; i++) solver.step();
    const after = Objective.full(graph, bounds, params.weights);
    expect(after).toBeLessThan(before);
    for (const n of graph.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("settles (done) within a bounded number of steps", () => {
    const graph = crossedGraph();
    const solver = getSolver("force").create(graph, bounds, params);
    let steps = 0;
    while (!solver.done && steps < 1000) { solver.step(); steps++; }
    expect(solver.done).toBe(true);
  });
});

describe("annealing / hillclimb", () => {
  it("hillclimb never increases the global objective after a full step", () => {
    const graph = crossedGraph();
    const solver = getSolver("hillclimb").create(graph, bounds, params);
    let prev = Objective.full(graph, bounds, params.weights);
    for (let i = 0; i < 30; i++) {
      solver.step();
      const cur = Objective.full(graph, bounds, params.weights);
      expect(cur).toBeLessThanOrEqual(prev + 1e-9);
      prev = cur;
    }
  });

  it("done flips true once temperature drops below Tmin", () => {
    const graph = crossedGraph();
    const solver = getSolver("annealing").create(graph, bounds, params);
    let steps = 0;
    while (!solver.done && steps < 2000) { solver.step(); steps++; }
    expect(solver.done).toBe(true);
  });
});

describe("layered solver", () => {
  it("assigns layer ranks by longest path from sources", () => {
    const graph = chainGraph();
    const solver = getSolver("layered").create(graph, bounds, params);
    while (!solver.done) solver.step();
    const y = graph.nodes.map(n => n.y);
    expect(y[0]).toBeLessThan(y[1]);   // A above B
    expect(y[0]).toBeLessThan(y[2]);   // A above C
    expect(y[1]).toBeLessThan(y[3]);   // B above D
    expect(y[2]).toBeLessThan(y[3]);   // C above D
    expect(y[1]).toBeCloseTo(y[2], 0); // B and C share a layer
  });

  it("trunk mode keeps the primary chain's x aligned", () => {
    const graph = chainGraph();
    const solver = getSolver("layered").create(graph, bounds, { ...params, trunk: true });
    while (!solver.done) solver.step();
    // A's primary child is whichever of B/C has the deepest downstream chain; both
    // tie here, so just assert A lands on the SAME column as one of its children.
    const [a, b, c] = graph.nodes;
    const alignedWithB = Math.abs(a.x - b.x) < 1;
    const alignedWithC = Math.abs(a.x - c.x) < 1;
    expect(alignedWithB || alignedWithC).toBe(true);
  });
});

describe("circular solver", () => {
  it("places every node at the same radius from center", () => {
    const graph = crossedGraph();
    const solver = getSolver("circular").create(graph, bounds, params);
    while (!solver.done) solver.step();
    const cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
    const radii = graph.nodes.map(n => Math.hypot(n.x - cx, n.y - cy));
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 0);
  });
});
