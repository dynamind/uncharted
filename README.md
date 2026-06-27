# Uncharted — a graph-layout solver lab

An educational, self-contained tech-demo of **graph layout as combinatorial
optimization**. Open [`index.html`](index.html) in any browser — no build, no
server, no network.

Graph drawing is a surprisingly deep problem: you want few edge crossings, short
edges, no overlapping nodes, and a balanced picture — objectives that fight each
other. Production tools (Dagre, ELK, Graphviz) hide this behind a *layout-engine
facade*. Uncharted keeps that same seam but turns the lights on inside, so you can
*watch* different solvers attack the problem.

## Solvers

| Solver | Family | Idea |
| --- | --- | --- |
| **Force-directed** | Physics | Fruchterman–Reingold: edges are springs, nodes repel, the system cools into equilibrium. |
| **Simulated annealing** | Metaheuristic | Davidson–Harel: minimize a weighted cost, accepting some bad moves early to escape local minima. |
| **Hill climbing** | Local search | Same moves as annealing but greedy — a great illustration of getting stuck. |
| **Layered (Sugiyama)** | Constructive | Longest-path layering + crossing reduction. The Dagre/ELK-family approach. |
| **Circular** | Constructive | Nodes on a ring; a cheap baseline. |

## What to look for

- **Crossings are drawn as little hops** (line-jumps), and the count is a live metric.
- Tune the **cost weights** and watch annealing trade crossings for edge length.
- Pit **hill climbing** against **annealing** on the same graph to see local minima bite.
- Try the famously non-planar graphs (K₃,₃, K₅) — crossings can be reduced but not removed.

## Design notes

See [`AGENTS.md`](AGENTS.md) for architecture, invariants, and the solver math.
