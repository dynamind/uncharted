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

## Build / dev / test (Vite + Vitest)

The project is now a small **Vite** app so the routing logic can be unit-tested.
- `npm install` once. `npm run dev` (Vite dev server) for live work; `npm test`
  (Vitest) runs `test/*.test.js`; `npm run build` emits **`dist/index.html`**.
- **The single-file requirement still holds**: `vite-plugin-singlefile` inlines the
  whole module graph, so `dist/index.html` is self-contained and opens from `file://`.
  Verify after routing changes: `npm run build` then `grep -c '<script src' dist/index.html`
  must be 0. The committed root `index.html` is the Vite *entry* (imports `./src/router.js`)
  and won't run directly from `file://` — that's expected; ship the built `dist/index.html`.
- `src/router.js` is **pure / DOM-free** (Geo, Nodes, ORTHO, sidesForEdge,
  orthogonalGeometry, edgeGeometry). Everything else stays inline in `index.html`'s
  `<script type="module">`. Keep the router pure so the tests stay fast and trustworthy.

## Hard requirements (from the user, do not regress)

- **Self-contained single-file deliverable** (`dist/index.html`). No external scripts,
  fonts, or assets at runtime; opens from `file://`.
- **Dark color palette**, with a **subtle dot-grid background**.
- Edges are **curved** (physics-y, pleasant) by default; orthogonal for flowcharts.
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
  happen inside a box, or the endpoint clip turns it into a diagonal). Side choice
  per edge: **FIX the target's entry side** from the box relationship (vertically
  separated ⇒ enter top/bottom = down/up flow; otherwise enter the facing left/right
  side), then **MINIMISE BENDS over the source's exit** by routing the candidates.
  - Stacked (vertical entry): source exit ∈ {vertical, horizontal} → straight trunk when
    aligned, a **1-bend L** (side-of-A → top-of-B) when B is off to the side.
  - Level (side entry): source exit is the matching side (side-to-side); we do NOT
    bend-min into a bottom exit, because that flips in/out as you drag (looks wrong +
    jumps).
  - If the best is still >2 bends (boxes wedged tight): try the other entry side and the
    four **same-side U-turns** (top-to-top / bottom-to-bottom / …) that go AROUND the gap
    in 2 bends instead of wrapping in 4.
  - A* is seeded with the **source stub direction** (`dirOf(pa.step)`); without it A*
    turns freely at the first cell and wastes the stub, adding a phantom bend.
  - Several edges leaving the SAME side are ordered by **fan angle to their targets**
    (`fanKey`), not just by their lean — so siblings don't cross each other as one is
    dragged across (the nearer target turns first, on the outer port).
  Each result carries its chosen `sides` for testing. Invariant (test/router.test.js):
  sweeping a side-by-side box through a vertical range, the route **never exceeds 2
  bends** (a ≤2-bend route always exists when one axis has clearance; near-overlap on
  BOTH axes is the only case that detours, and that's unavoidable). Ports also
  **lean** toward the other
  endpoint, then **de-collided per node-side** (`offAt` map): edges sharing a side are
  spread to distinct slots (min SEP), single-edge sides stay centred, trunk children
  sit at offset 0. Without this, dragging a node so two of its edges share a side made
  them snap to the same point — one line skewering the box ("not connected").
  The attach point's perpendicular coord is the **shape border** (`borderPerp`): rect =
  flat, **diamond = angled face** (tapers to the vertex), circle = round — so a leaning
  port on a decision diamond meets its slanted edge, not the bounding box. Constructive
  solvers **snap exactly onto on-grid targets when settled**, so edges line up to the px.
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
  top) + barycentre crossing reduction + **priority/median x-alignment** (`alignTo(±1)`).
  - **Trunk mode** (`params.trunk`, "Straight trunks" toggle, default on): each node's
    *primary child* = the one with the deepest downstream chain; primary parent↔child
    links are hard-aligned (priority 1e6) so the main flow is one straight column and
    branches get shoved to the side. Toggle off = balanced/symmetric (median of all).
  - Box centres are **snapped to the orthogonal routing lattice** (phase 4) so ports sit
    dead-centre and aligned chains share an exact column.
  The Dagre/ELK analogue. Pair with orthogonal routing for the flowchart.
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

## Speed control

- The Speed slider indexes a `SPEEDS` table; `state.speedRate` is *steps per frame* and
  may be **< 1**. `frame()` accumulates it (`state._accum`) and runs `floor` steps, so the
  low end animates genuinely slowly (down to 0.15 steps/frame).

## TODO / ideas not yet done

- Real ELK backend behind the facade (would validate the seam).
- Orthogonal routing: separate parallel edges into distinct **channels** (they can overlap
  in a shared lane now); dummy nodes for long layered edges + Brandes–Köpf x-coords.
- Arrowheads on directed edges (the flowchart reads as undirected lines today).
- Best-cost-so-far tracking / a convergence sparkline; A/B race two solvers.
