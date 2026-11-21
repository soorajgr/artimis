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

## Refined engineering constraints
- **Terrain model**: elevations in metres; terrain object stores `resolutionM` (metres per cell), origin, width/height, units, and `source: "synthetic" | "uploaded-dem"` with name. UI badge always shows which source is active; uploads validated (rectangular, numeric, finite) with clear errors.
- **LOS**: sample the full rover-to-endpoint segment at sub-cell spacing (≤ resolution/2, both endpoints included) with bilinear interpolation; ray runs from rover ground + rover antenna height to endpoint ground + endpoint antenna height. Returns every obstruction (distance along segment, x/y, terrain elevation, ray height, clearance) plus the worst one; shown on the cross-section.
- **Safety**: max slope is a hard constraint in both A* runs (edges over the limit are impassable). Recommendation only considers routes whose max slope ≤ limit; if none, shows "no valid route".
- **Route B**: A* cost includes a communication-obstruction penalty computed by running LOS at each candidate node during search (cached per cell). Route A uses distance + slope/energy only.
- **Blackout duration**: along-route distance from first BLOCKED sample to first subsequent CLEAR sample, divided by rover speed. If no reconnection before route end, marked "no reconnection within planned route" with duration as lower bound to destination.
- **Recalculation**: all derived values (route metrics, LOS, predictions, warning times, continuity status) are memoised selectors over route + settings + terrain, so any change recomputes them.
- **Determinism**: seeded PRNG for terrain, demo scenarios, data generation and ACK failures; each demo resets to a fixed seed and state.
- **Tests (Vitest)**: terrain sampling (bilinear, bounds, units), LOS obstruction location/elevation, route safety on both routes, Route B penalty changes path vs A, blackout transitions + no-reconnection case, priority/FIFO transmission and no deletion before ACK.
- Scope unchanged: no ML, no backend, no required APIs, no NASA connectivity.
