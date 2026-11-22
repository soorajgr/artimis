# ARTEMIS — Lunar Shadow & Communication Blackout Predictor

Terrain-Aware Lunar Communication Blackout Prediction & Data Continuity System.

ARTEMIS is an aerospace-grade simulation platform designed to anticipate communication outages caused by lunar terrain obstructions, evaluate rover traverse trajectories, and protect mission telemetry using a multi-priority Store-and-Forward architecture.

---

## Key Features

1. **Topographic Terrain Engine:** 2D heatmap elevation analysis with procedural crater/ridge synthesis and custom DEM import (CSV/JSON).
2. **Line-of-Sight (LOS) Ray Tracing:** Geometric ray tracing accounting for rover and relay antenna heights and terrain clearance.
3. **Route Planner & A\* Pathfinding:** Side-by-side comparison of Route A (Direct) vs. Route B (Communication-aware) with a strict terrain slope safety constraint.
4. **Blackout Prediction & Warning System:** Early predictive detection of terrain obstruction with advance amber warnings, loss alerts, and reconnection estimations.
5. **Store-and-Forward Data Management:** 4-tier priority queue (P1 Critical to P4 Low) with local buffering during outages and automated resumption upon link restoration.
6. **Telemetry Analytics & Reporting:** Real-time communication uptime metrics, packet throughput tracking, and exportable CSV simulation reports.
7. **Judge Demonstration Suite:** 4 deterministic scenarios for evaluations (Normal, Approaching Crater, Blackout, Restoration).

---

## Local Development

Ensure you have Node.js 18+ and npm installed:

```sh
# Install dependencies
npm install

# Start local simulation server (http://localhost:8080)
npm run dev

# Run verification tests
npm test

# Type-check
npx tsc --noEmit

# Production build
npm run build
```
