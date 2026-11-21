import { edgeSlopeDeg, planRoute } from "./pathfinding";
import { predictBlackouts, type Prediction } from "./prediction";
import { cellElevation, type Point, type Terrain } from "./terrain";

export type RouteId = "A" | "B";

export interface RoutePoint extends Point {
  /** Distance along the route in metres. */
  d: number;
}

export interface RouteMetrics {
  distanceM: number;
  travelTimeS: number;
  maxSlopeDeg: number;
  meanSlopeDeg: number;
  difficulty: "Low" | "Moderate" | "High";
  energyWh: number;
}

export interface RouteSummary {
  id: RouteId;
  label: string;
  found: boolean;
  reason?: string | undefined;
  safe: boolean;
  cells: Point[];
  points: RoutePoint[];
  metrics: RouteMetrics | null;
  prediction: Prediction | null;
}

export interface RouteParams {
  start: Point;
  destination: Point;
  endpoint: Point;
  roverAntennaM: number;
  endpointAntennaM: number;
  roverSpeedMps: number;
  maxSlopeDeg: number;
  commPenalty: number;
}

/** Resample a cell path at a fixed spacing (grid cells), tracking distance along route in metres. */
export function resamplePath(t: Terrain, cells: Point[], spacingCells = 0.5): RoutePoint[] {
  if (!cells.length) return [];
  const out: RoutePoint[] = [{ x: cells[0]!.x, y: cells[0]!.y, d: 0 }];
  let d = 0;
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1]!, b = cells[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / spacingCells));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, d: d + len * f * t.resolutionM });
    }
    d += len * t.resolutionM;
  }
  return out;
}

/** Simple energy model (estimate only): 0.08 Wh per metre driven + 1.2 Wh per metre climbed. */
export function computeMetrics(t: Terrain, cells: Point[], speedMps: number): RouteMetrics {
  let distanceM = 0, maxSlope = 0, slopeSum = 0, energy = 0;
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1]!, b = cells[i]!;
    const run = Math.hypot(b.x - a.x, b.y - a.y) * t.resolutionM;
    const slope = edgeSlopeDeg(t, a, b);
    const dz = cellElevation(t, b.x, b.y) - cellElevation(t, a.x, a.y);
    distanceM += run;
    maxSlope = Math.max(maxSlope, slope);
    slopeSum += slope * run;
    energy += run * 0.08 + Math.max(dz, 0) * 1.2;
  }
  const meanSlopeDeg = distanceM ? slopeSum / distanceM : 0;
  return {
    distanceM,
    travelTimeS: speedMps > 0 ? distanceM / speedMps : Infinity,
    maxSlopeDeg: maxSlope,
    meanSlopeDeg,
    difficulty: meanSlopeDeg < 4 ? "Low" : meanSlopeDeg < 9 ? "Moderate" : "High",
    energyWh: energy,
  };
}

export function buildRoute(t: Terrain, id: RouteId, p: RouteParams): RouteSummary {
  const label = id === "A" ? "Route A — Direct" : "Route B — Comm-aware";
  const plan = planRoute(t, p.start, p.destination, {
    maxSlopeDeg: p.maxSlopeDeg,
    commAware: id === "B",
    commPenalty: p.commPenalty,
    endpoint: p.endpoint,
    roverAntennaM: p.roverAntennaM,
    endpointAntennaM: p.endpointAntennaM,
  });
  if (!plan.found) return { id, label, found: false, reason: plan.reason, safe: false, cells: [], points: [], metrics: null, prediction: null };
  const metrics = computeMetrics(t, plan.cells, p.roverSpeedMps);
  const points = resamplePath(t, plan.cells);
  const prediction = predictBlackouts(t, points, p.roverSpeedMps, p.endpoint, p.roverAntennaM, p.endpointAntennaM);
  return { id, label, found: true, safe: metrics.maxSlopeDeg <= p.maxSlopeDeg + 1e-9, cells: plan.cells, points, metrics, prediction };
}

export interface Recommendation {
  id: RouteId | null;
  reason: string;
  scores: Partial<Record<RouteId, number>>;
}

/** Safety is a hard filter; among safe routes, lower weighted score wins (distance 35%, energy 25%, comm loss 40%). */
export function recommendRoute(routes: RouteSummary[]): Recommendation {
  const safe = routes.filter((r) => r.found && r.safe && r.metrics && r.prediction);
  if (!safe.length) return { id: null, reason: "No route satisfies the terrain safety constraint.", scores: {} };
  const maxD = Math.max(...safe.map((r) => r.metrics!.distanceM)) || 1;
  const maxE = Math.max(...safe.map((r) => r.metrics!.energyWh)) || 1;
  const scores: Partial<Record<RouteId, number>> = {};
  for (const r of safe) {
    scores[r.id] = 0.35 * (r.metrics!.distanceM / maxD) + 0.25 * (r.metrics!.energyWh / maxE) + 0.4 * (1 - r.prediction!.availabilityPct / 100);
  }
  const best = safe.reduce((a, b) => ((scores[b.id] ?? 9) < (scores[a.id] ?? 9) ? b : a));
  const unsafe = routes.filter((r) => !(r.found && r.safe)).map((r) => r.id);
  return {
    id: best.id,
    reason:
      (unsafe.length ? `Route ${unsafe.join(", ")} excluded (unsafe or not found). ` : "") +
      `Route ${best.id} has the best balance of distance, energy and communication availability (${best.prediction!.availabilityPct.toFixed(0)}% available).`,
    scores,
  };
}
