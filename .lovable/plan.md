# ARTEMIS — Lunar Communication Blackout Predictor (Build Plan)

Fully client-side simulation app (no backend, no API keys). Data queue persists in the browser (IndexedDB/localStorage).

## Visual direction
Dark mission-control: near-black navy background, cyan/electric-blue accents, amber warnings, red loss, green transmit. Fonts: "Space Grotesk" (headings) + "JetBrains Mono" (telemetry). Persistent "SIMULATION ENVIRONMENT" badge. Sidebar nav; collapses to a drawer on small screens.

## Pages (each its own route)
1. **Mission Dashboard** `/` — mission overview, terrain map, control panel (speed, distances, time to blackout, duration, reconnection), alert banner, sim controls, mini queue status.
2. **Terrain Explorer** `/terrain` — full heatmap with zoom/pan, legend, click-to-inspect cell, cross-section between rover and endpoint (terrain, antennas, LOS ray green/red, obstruction highlighted), CSV/JSON grid upload with validation.
3. **Route Planner** `/routes` — pick start/destination/endpoint on map, speed, slope limit; Route A (direct, distance-weighted A*) vs Route B (A* weighted for slope + comm visibility); side-by-side comparison and recommendation (safety hard constraint, then weighted score); "no safe route" state.
4. **Blackout Prediction** `/blackout` — comm timeline along route (clear/warning/lost/restored segments), next blackout details, per-sample LOS chart.
5. **Data Continuity** `/data` — data generator buttons (emergency, health, nav, science, image), auto-generate toggle, priority queue table (P1–P4, FIFO within priority), progress, ACK, retry, storage capacity.
6. **Analytics & Reports** `/analytics` — Recharts: availability over time, blackout durations, generated/buffered/transmitted/remaining, route distance & energy comparison; event log; CSV export.
7. **Settings** `/settings` — antenna heights, endpoint position, speed, max slope, warning threshold, tx rate, storage capacity, sim speed.
8. **Demo Mode** (panel on dashboard + `/demo`) — 4 one-click deterministic scenarios: Normal, Approaching Crater, Blackout, Restoration.

## Alerts
Amber "COMMUNICATION BLACKOUT APPROACHING" (time, duration, reconnection point, queued data), red "COMMUNICATION LOST — LOCAL DATA BUFFER ACTIVE", green "COMMUNICATION RESTORED — DATA TRANSMISSION RESUMED".

## Technical details
- Pure TS engine modules in `src/engine/` (no React): `terrain.ts` (seeded synthetic grid: crater with rims, ridge, slope, flat plain; bilinear sampling; CSV/JSON import + validation), `los.ts` (sample along antenna-to-antenna line, compare terrain vs ray height, return CLEAR/BLOCKED + obstruction point), `pathfinding.ts` (8-neighbour A*, slope threshold as impassable, energy = distance × (1 + slope factor + climb)), `prediction.ts` (LOS per route sample, CLEAR↔BLOCKED transitions, distance/time from speed), `queue.ts` (priority + FIFO, ack before delete, retry with simulated failure using seeded PRNG), `simulation.ts` (tick controller: move rover, generate data, transmit at tx rate when CLEAR, log events).
- State: a zustand store holding settings, terrain, routes, sim state; queue persisted to IndexedDB (idb-keyval), settings to localStorage.
- Visuals: Canvas for heatmap (cached ImageData) with SVG overlay for routes/rover/blackout zones; pointer + non-passive wheel zoom anchored at cursor; SVG cross-section; Recharts charts; lucide icons.
- Deterministic seeded PRNG for terrain, demo scenarios, and ACK failures — no `Math.random` in predictions.
- Vitest tests for engine: LOS blocked/clear on known grid, A* respects slope limit, recommendation never picks unsafe route, queue sends P1 first and FIFO within priority, item not removed before ACK.
- Per-route head() metadata; AGENTS.md records engine/UI separation.
- Honest copy: "synthetic terrain", "simplified geometric line-of-sight (no diffraction/Fresnel/link budget)", "local simulation".
