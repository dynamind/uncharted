# AGENTS.md — Durable memory for the Uncharted graph-layout lab

This file is the project's long-term memory. Read it first. Keep it current: when a
decision is made or an invariant established, record it here in the same commit.

## What this is

An **educational tech-demo of a graph layout solver**, served as a single
self-contained `index.html` (no build step, no network, open the file and it runs).

The framing mirrors real rendering stacks: most engines push a graph through a
**layout-engine facade** that maps onto a backend (Dagre, ELK, …). We keep that
seam clean so a real backend could be plugged in, but the *focus of the demo is the
solvers themselves* — graph layout as a combinatorial optimization problem
(minimize edge crossings, edge length, node overlap) and the metaheuristics that
attack it.

## Hard requirements (from the user, do not regress)

- **Single self-contained HTML file.** No external scripts, fonts, or assets.
  Everything inline. Must work from `file://`.
- **Dark color palette**, with a **subtle dot-grid background**.
- Edges are **curved** (physics-y, pleasant). The user explicitly enjoys nice curves.
- **Line crossings are drawn as small hops** (line-jumps / bridges).
- Git from the start; **focused commits** that tell the story of the build.

## Architecture / invariants

- `LayoutEngine` is the **facade**. Public surface: `LayoutEngine.create(graph, opts)`
  returns a *solver instance* exposing `step()` (advance one iteration, mutate node
  positions in place) and `done`. This iterative interface is what makes the solving
  *visible*; a batch backend like ELK would wrap its result behind the same seam.
- Solvers register themselves into `LayoutEngine.solvers[name]`. Adding a solver =
  add one entry; nothing else needs to know.
- Graph model: `{ nodes: [{id, x, y, shape?, w?, h?, label?, ...}], edges: [{source, target}] }`.
  `source`/`target` are node indices. Nodes default to circles; flowchart nodes set
  `shape: "rect"|"diamond"` + `w,h,label`. `Nodes` helper does size/border/hit-testing.
- Rendering: HTML5 **Canvas** (chosen for smooth 60fps physics animation).
- **Edge routing is separate from solving.** `edgeGeometry(graph, mode, bounds)` →
  per-edge rendered polylines. Modes: `straight | curved | orthogonal`. Orthogonal is
  grid **A\*** (turn-penalised) around node obstacles (+margin), connected via axis-
  aligned **ports** (route between points *outside* the boxes — never let the jog
  happen inside a box, or the endpoint clip turns it into a diagonal).
- **CROSSINGS ARE COMPUTED ON THE ACTUAL RENDERED POLYLINES** (`Renderer.crossings`,
  bbox prefilter + segment test) — the metric AND the hops read from the same points,
  so a hop only ever appears where the drawn lines truly cross. (This replaced the old
  chord-based count, which made hops drift/flip/phantom over curves.) Hops bulge to a
  consistent side (up; right for vertical runs). `Objective.crossings` (chord-based)
  still exists but is only the SA/hillclimb *optimisation target*, not what's drawn.

## Solver lineup (the point of the demo)

- `force` — Fruchterman–Reingold force-directed (springs + repulsion + cooling). Physics.
- `annealing` — Simulated Annealing à la Davidson–Harel: minimize a weighted cost
  (crossings + edge length + overlap + border). The headline metaheuristic.
- `hillclimb` — same neighborhood as SA but greedy (T=0). Shows local-minima trapping.
- `layered` — Sugiyama-lite: **longest-path layering along edge direction** (sources on
  top) + barycentre crossing reduction + **priority/median x-alignment** (each node →
  median of its neighbours, higher-degree wins ties; `alignTo(±1)` sweeps) so chains sit
  in one column and the orthogonal router draws them as a single straight line — far
  fewer bends. The Dagre/ELK analogue. Pair with orthogonal routing for the flowchart.
- `circular` — nodes on a ring; baseline + reorder. Cheap contrast.

## Routing & the flowchart example

- `flowchart` preset = a small DAG (rect boxes + decision diamonds + labels). Selecting
  it auto-switches to `layered` + `orthogonal` (see the `sel-graph` change handler).
- Orthogonal A* is deferred during energy-based solver motion (force/annealing/hillclimb
  route straight until `done`, then snap to orthogonal) — see `activeRouting()`. Geometry
  is cached by a position+routing+done signature so A* doesn't run every idle frame.

## Cost function (combinatorial objective)

`cost = w_cross*crossings + w_len*Σ edgeLength + w_overlap*nodeOverlaps + w_border*offscreen`
Weights are user-tunable sliders. SA/hillclimb optimize this directly; force-directed
approximates it physically; constructive solvers (layered/circular) target structure.

## Conventions

- No frameworks. Vanilla JS, modules-in-one-file via IIFE/namespaces.
- Keep solver code readable and commented — this is *educational*; clarity beats cleverness.
- Commit messages: imperative, scoped (`feat:`, `chore:`, `docs:`, `fix:`).

## Status (keep honest)

- DONE: facade + iterative `step()`/`done` seam; Canvas dark renderer w/ dot-grid;
  straight/curved/**orthogonal** routing; **crossing hops computed on real geometry**;
  node shapes (circle/rect/diamond) + labels; shared `Objective`; all five solvers
  (`force`, `annealing`, `hillclimb`, `layered`, `circular`); **flowchart preset**;
  tunable cost-weight + cooling sliders; per-solver explainer; node dragging; keyboard
  (space/S/R); 8 presets. Verified in-browser (Claude Preview), no console errors.
- The length term penalises |len − k| (deviation from ideal), NOT raw length —
  raw length made SA collapse the graph to a point. Do not regress this.

## TODO / ideas not yet done

- Real ELK backend behind the facade (would validate the seam).
- Orthogonal routing: separate parallel edges into distinct channels (they can overlap
  in a shared lane now); dummy nodes for long layered edges + Brandes–Köpf x-coords.
- Arrowheads on directed edges (the flowchart reads as undirected lines today).
- Best-cost-so-far tracking / a convergence sparkline; A/B race two solvers.
