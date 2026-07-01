# Uncharted — a graph-layout solver lab

An educational tech-demo of **graph layout as combinatorial optimization**.

```bash
npm install
npm run dev      # live dev server (Vite)
npm test         # unit tests (Vitest) — routing, ports, renderers, shapers,
                 #   crossings, arrowheads, solvers
npm run build    # → dist/index.html, a single self-contained file (opens from file://)
```

The deliverable is **one self-contained HTML file** — `npm run build` inlines
everything into `dist/index.html` via `vite-plugin-singlefile`. Most of the pipeline
(graph sources, edge routing, ports, renderers, shapers, arrowheads, crossing
detection, layout solvers) is decomposed into small, pluggable, unit-tested modules
under [`src/`](src), each behind its own registry (ports-and-adapters). Only the app
glue — state, UI wiring, the render loop, and the camera — stays inline in
[`index.html`](index.html). See [`AGENTS.md`](AGENTS.md) for the module map.

Graph drawing is a surprisingly deep problem: you want few edge crossings, short
edges, no overlapping nodes, and a balanced picture — objectives that fight each
other. Production tools (Dagre, ELK, Graphviz) hide this behind a *layout-engine
facade*. Uncharted keeps that same seam but exposes each solver iteratively, so you
can *watch* it work.

## Solvers

| Solver | Family | Idea |
| --- | --- | --- |
| **Force-directed** | Physics | Fruchterman–Reingold: edges are springs, nodes repel, the system cools into equilibrium. |
| **Simulated annealing** | Metaheuristic | Davidson–Harel: minimize a weighted cost, accepting some bad moves early to escape local minima. |
| **Hill climbing** | Local search | Same moves as annealing but greedy — a great illustration of getting stuck. |
| **Layered (Sugiyama)** | Constructive | Longest-path layering + crossing reduction. The Dagre/ELK-family approach. |
| **Circular** | Constructive | Nodes on a ring; a cheap baseline. |

## Edge routing

Edges can be drawn three ways (Display → *Edge routing*):

- **Straight** — plain chords.
- **Curved** — gentle béziers.
- **Orthogonal** — Manhattan routing via grid **A\***: edges run in straight
  horizontal/vertical segments and bend *around* node boxes with a margin. Pick the
  **Flowchart** preset (it auto-selects the layered solver + orthogonal routing) to see
  the classic boxes-and-arrows look.

Crossings (the metric **and** the little **hops**) are computed on the *actual rendered
polylines*, so a hop only ever appears where the drawn lines truly cross — in any
routing mode.

## What to look for

- **Crossings are drawn as little hops** (line-jumps), and the count is a live metric.
- Open the **Flowchart** preset for a Dagre/ELK-style orthogonal layout.
- Tune the **cost weights** and watch annealing trade crossings for edge length.
- Pit **hill climbing** against **annealing** on the same graph to see local minima bite.
- Try the famously non-planar K₃,₃ preset, or dense K₆ — crossings can be reduced but not removed.

## Design notes

See [`AGENTS.md`](AGENTS.md) for architecture, invariants, and the solver math.
