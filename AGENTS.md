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
  per edge = **MINIMISE BENDS** over candidate (sourceSide, targetSide) pairs by
  actually routing them; a bend tie prefers down-flow (target top / vertical).
  - Stacked (boxes vertically separated): try both source exits × both target entries
    → straight trunk when aligned; **1-bend L** "side-of-A → top-of-B" when B is well
    off to the side; **1-bend "bottom-of-A → side-of-B"** when B is mostly below but
    the side→top route is blocked (the flowchart merge: Reject/Error enter Respond's
    sides). Both ends are bend-minimised, not just the source.
  - Level (overlap vertically): side-to-side only — do NOT bend-min into a bottom exit;
    it flips in/out as you drag (looks wrong + jumps).
  - Tight/degenerate (best still >2 bends): all pairs + four **same-side U-turns**
    (top-to-top / …) ranked by **grid-quantised length** (a coarse deadband) so the
    near-equal t/t vs b/b choice doesn't flicker pixel-to-pixel; a fixed order
    (b/b first) breaks ties deterministically.
  - A* is seeded with the **source stub direction** (`dirOf(pa.step)`); without it A*
    turns freely at the first cell and wastes the stub, adding a phantom bend.
  - **Hysteresis**: `orthogonalGeometry(graph, bounds, prev)` takes the previous per-edge
    `[srcSide, tgtSide]`; an edge KEEPS its previous sides unless the new best has
    strictly FEWER bends. So routes don't twitch mid-drag, and the **drag direction picks
    the side** (approach from the left → enters the left). The App holds the state
    (`state._prevSides`, reset in `buildSolver`); tests omit `prev` → pure bend-min.
  - Several edges leaving the SAME side are ordered by **fan angle to their targets**
    (`fanKey`), not just by their lean — so siblings don't cross each other as one is
    dragged across (the nearer target turns first, on the outer port).
  - **Channel separation** (`separateLanes`, PHASE 4): A* routes each edge independently
    over the shared `occ` grid, so two edges can land in the SAME lane and draw collinearly
    on top of each other — `segInt` returns null for parallels, so it's not even a
    "crossing"/hop, the lines just merge into one. Post-process fans co-running segments
    into parallel tracks: it nudges only **interior** segments (both ends are bends), so the
    PORT endpoints (pinned on the border) never move and the **bend count is unchanged**.
    Horizontal interior segs shift in y, vertical in x — the shift moves only the two shared
    bend vertices, the perpendicular neighbours grow/shrink, everything stays axis-aligned,
    and a corner shared by an H and a V interior seg takes an independent y- and x-nudge.
    Segments are grouped by lane (orientation + perp coord within `LANE_TOL`) then by
    overlapping extent; each cluster is spread symmetrically by `LANE_STEP`, ordered by the
    perpendicular centre of each seg's neighbours so the track arriving from "above" stays
    above (minimises new crossings). Port stubs — the two end segments of any route, and so
    every segment of a 0/1-bend route — are NOT separable this way; those are de-collided at
    the ports back in PHASE 2.
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
- **An edge running THROUGH a non-incident node's body counts as a crossing**
  (`Nodes.segHitsBody` — clip the segment to the convex shape, require >3px penetration;
  rect/diamond via half-plane clip, circle via the quadratic). Without it the energy
  solvers cheat: hillclimb on Q₃ "found" a 0-crossing layout by hiding edges *inside*
  nodes (segInt sees no edge–edge cross, so it read as free). Counted in BOTH domains,
  each on its own geometry: `Objective.nodePierces` (chords, in `full` + the annealer's
  `localCost`, weighted as a crossing) drives the solver away from it; `Renderer.nodePierces`
  (rendered polylines) is added to the on-screen crossing count so the HUD can't lie.
  Orthogonal A* routes around obstacles, so pierces are ~0 there — this bites the straight
  routing the energy solvers use. The HUD shows `crossings.length + pierces.length`.

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

`cost = w_cross*(crossings + nodePierces) + w_len*Σ edgeLength + w_overlap*nodeOverlaps + w_border*offscreen`
(an edge through a non-incident node body — `nodePierces` — is weighted as a crossing)
Weights are user-tunable sliders. SA/hillclimb optimize this directly; force-directed
approximates it physically; constructive solvers (layered/circular) target structure.

## Conventions

- No frameworks. Vanilla JS, modules-in-one-file via IIFE/namespaces.
- Keep solver code readable and commented — this is *educational*; clarity beats cleverness.
- Commit messages: imperative, scoped (`feat:`, `chore:`, `docs:`, `fix:`).

## Status (keep honest)

- DONE: facade + iterative `step()`/`done` seam; Canvas dark renderer w/ dot-grid;
  straight/curved/**orthogonal** routing; **crossing hops computed on real geometry**;
  node shapes (circle/rect/diamond) + labels; **arrowheads on directed edges** (toggle,
  auto-on for the flowchart); shared `Objective`; all five solvers
  (`force`, `annealing`, `hillclimb`, `layered`, `circular`); **flowchart preset**;
  tunable cost-weight + cooling sliders; per-solver explainer; node dragging; keyboard
  (space/S/R); 8 presets. Verified in-browser (Claude Preview), no console errors.
- **Orthogonal routing is mature** (this is where most recent effort went): bend-minimised
  side choice on BOTH ends, 1-bend L / bottom-to-side, U-turns for tight wedges, fan-order
  ports (no sibling crossings), A* seeded with the stub direction, grid-quantised length
  (no flicker), **hysteresis** (sticky + drag-steerable), and **channel separation**
  (`separateLanes` — co-running edges fanned into parallel tracks; verified in-browser on
  K₆). All pinned by 29 Vitest tests
  in `test/router.test.js` — the single best place to understand the routing contract.
  Run `npm test`. After ANY router change, also `npm run build` and check it stays a single
  file (`grep -c '<script src' dist/index.html` == 0).
- The length term penalises |len − k| (deviation from ideal), NOT raw length —
  raw length made SA collapse the graph to a point. Do not regress this.
- **An edge through a non-incident node counts as a crossing** (`Nodes.segHitsBody`,
  `Objective.nodePierces` / `Renderer.nodePierces`) — see the crossings invariant above.
  Stops hillclimb/SA faking 0 crossings on Q₃ by hiding edges inside nodes. Verified
  in-browser: hillclimb now lands at an honest 2-crossing local minimum on the cube.

## Speed control

- The Speed slider indexes a `SPEEDS` table; `state.speedRate` is *steps per frame* and
  may be **< 1**. `frame()` accumulates it (`state._accum`) and runs `floor` steps, so the
  low end animates genuinely slowly (down to 0.15 steps/frame).

## NEXT TASK — long-edge dummy nodes for `layered` (proper Sugiyama)

Recent work is all DONE: channel separation (`separateLanes`, PHASE 4), edge-through-node
counts as a crossing (`segHitsBody`/`nodePierces`), and **arrowheads** (filled triangle at the
target; toggle `tg-arrows`, auto-on for the flowchart). The robust **heading** is a pure
function `arrowHeading(poly, source, target)` in `router.js` (renderer `drawArrowhead` just
fills the triangle + shrinks it proportionally when `room` is tight). Heading rule, hardened
for nodes dragged into contact/overlap: take the tangent from a baseline that is BOTH ≥10px
back (a ~1px tail makes `atan2` spin → the arrow "rotates around the endpoint") AND outside
the target body (`Nodes.inBody` — a curved tail can dip inside the node and the attach point
rotates around it, flipping the triangle backward); use it only if it points inward; else
fall back to the source→target **centre chord**, which always points in and never flips.
Returns `null` (no glyph) when there's no room. 29 router tests.

The `layered` solver places a node in one layer per longest-path rank, but an edge that
spans more than one layer is drawn as a single long line straight across the intervening
layer(s) — it doesn't route around the nodes there, and barycentre crossing-reduction can't
account for it because there's no vertex to order in the middle layers. Real Sugiyama
inserts **dummy nodes** on every edge that skips a layer (one per crossed layer), orders
them in the barycentre phase like real nodes, then routes the edge through their positions
(and Brandes–Köpf for the x-coords). Add dummy-node insertion to `layered` so long edges
bend through their layers instead of cutting across, and the crossing count drops.

Where: the `layered` solver (inline in `index.html`). Keep it behind the existing solver
seam. Orthogonal routing already polylines around obstacles, so the win is clearest with
curved/straight routing and in the crossing metric. This is the biggest remaining gap to a
"real" Dagre/ELK-class layered layout.

## Known limits / nice-to-haves for routing (lower priority)

- Channel separation only fans **interior** segments. Two **port stubs** (or 0/1-bend
  routes) that overlap are de-collided at the ports (PHASE 2 offsets), not by `separateLanes`
  — in very dense fans this can still leave a short collinear stub. Could extend PHASE 2's
  spread, or allow a tiny jog (but that costs a bend — weigh it).
- `LANE_STEP`/`LANE_TOL` are fixed px; on extreme zoom they don't scale. Tie them to `cell`
  if zoom is ever added.

## Other ideas (lower priority)

- Real ELK backend behind the facade (would validate the seam end-to-end).
- Best-cost-so-far tracking / convergence sparkline; A/B race two solvers.
