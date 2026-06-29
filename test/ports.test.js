import { describe, it, expect } from "vitest";
import { edgeGeometry, Nodes } from "../src/router.js";
import { getPortStrategy } from "../src/ports/index.js";

const bounds = { x0: 0, y0: 0, x1: 600, y1: 600 };

// Ports currently use a single attach point per edge (toward the target). Spreading
// was tried and dropped — it reads mechanical on organic straight/curved edges;
// sibling crossings are handled by the curve's bulge instead. These tests pin the
// single-port behavior and the registry seam (so a future opt-in spread is a clean add).
describe("ports — single attach point toward the target (no spread)", () => {
  const B = { x: 300, y: 300, w: 120, h: 60, shape: "rect", id: 0 };
  const T = [{ x: 200, y: 520, id: 1 }, { x: 300, y: 520, id: 2 }, { x: 400, y: 520, id: 3 }];

  it("a box edge attaches where the centre→target ray crosses the face", () => {
    const graph = { nodes: [B, T[1]], edges: [{ source: 0, target: 1 }] };
    const p = edgeGeometry(graph, "straight", bounds)[0].poly[0];
    const exp = Nodes.boundary(B, T[1].x, T[1].y);
    expect(p.x).toBeCloseTo(exp.x, 6);
    expect(p.y).toBeCloseTo(exp.y, 6);
  });

  it("siblings do NOT spread — each port is its own center→target crossing", () => {
    const graph = { nodes: [B, ...T], edges: [0, 1, 2].map(k => ({ source: 0, target: k + 1 })) };
    const ports = edgeGeometry(graph, "straight", bounds).map(g => g.poly[0]);
    ports.forEach((p, i) => {
      const exp = Nodes.boundary(B, T[i].x, T[i].y);
      expect(p.x).toBeCloseTo(exp.x, 6);
      expect(p.y).toBeCloseTo(exp.y, 6);
    });
  });

  it("circle and diamond attach on their true border (default strategy snaps correctly)", () => {
    for (const shape of ["circle", "diamond"]) {
      const N = { x: 300, y: 300, w: 90, h: 60, shape, id: 0 }, F = { x: 540, y: 300, id: 1 };
      const p = edgeGeometry({ nodes: [N, F], edges: [{ source: 0, target: 1 }] }, "straight", bounds)[0].poly[0];
      const exp = Nodes.boundary(N, F.x, F.y);
      expect(p.x).toBeCloseTo(exp.x, 6);
      expect(p.y).toBeCloseTo(exp.y, 6);
    }
  });
});

describe("port strategy registry", () => {
  it("every shape resolves to the default strategy (only one registered today)", () => {
    expect(getPortStrategy("rect")).toBe(getPortStrategy("default"));
    expect(getPortStrategy("circle")).toBe(getPortStrategy("default"));
    expect(getPortStrategy("diamond")).toBe(getPortStrategy("default"));
  });
});
