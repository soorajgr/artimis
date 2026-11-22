# Agent Guidelines — ARTEMIS

## Project Architecture
- **Framework:** TanStack Start / React 19 / Vite / Tailwind CSS 4.
- **Routing:** TanStack Router typed file-based routing (`src/routes/`).
- **State:** Zustand store (`src/state/mission.ts`) with IndexedDB (`idb-keyval`) local persistence.
- **Engine:** Pure deterministic geometric algorithms in `src/engine/` (LOS, A* pathfinding, prediction, priority queue).

## Invariants
1. Do not introduce machine-learning or pseudo-AI claims. All calculations are physical and geometric.
2. Maintain terrain safety limits ($\le 20^\circ$ slope) as a strict hard constraint.
3. Keep Store-and-Forward data buffering active continuously across all traverse states.
