import { computeLOS, isLosClear } from "./los";
import type { Point, Terrain } from "./terrain";

export interface RouteCommSample extends Point {
  d: number;
  clear: boolean;
}

export interface Blackout {
  index: number;
  startM: number;
  /** Distance of the first subsequently clear position, or route end when no reconnection. */
  endM: number;
  reconnects: boolean;
  lengthM: number;
  /** (endM - startM) / speed. A lower bound when reconnects is false. */
  durationS: number;
  startPoint: Point;
  endPoint: Point | null;
  worstObstruction: { x: number; y: number; terrainM: number } | null;
}

export interface Prediction {
  samples: RouteCommSample[];
  blackouts: Blackout[];
  totalM: number;
  availabilityPct: number;
  totalBlackoutS: number;
}

/** Evaluate LOS at successive route positions and derive CLEAR↔BLOCKED transitions. */
export function predictBlackouts(
  t: Terrain,
  points: { x: number; y: number; d: number }[],
  speedMps: number,
  endpoint: Point,
  roverAntennaM: number,
  endpointAntennaM: number,
): Prediction {
  const samples = points.map((p) => ({ ...p, clear: isLosClear(t, p, roverAntennaM, endpoint, endpointAntennaM) }));
  return blackoutsFromSamples(t, samples, speedMps, endpoint, roverAntennaM, endpointAntennaM);
}

export function blackoutsFromSamples(
  t: Terrain | null,
  samples: RouteCommSample[],
  speedMps: number,
  endpoint?: Point,
  roverAntennaM = 0,
  endpointAntennaM = 0,
): Prediction {
  const totalM = samples.length ? samples[samples.length - 1]!.d : 0;
  const blackouts: Blackout[] = [];
  let i = 0;
  while (i < samples.length) {
    const s = samples[i]!;
    if (s.clear) { i++; continue; }
    let j = i + 1;
    while (j < samples.length && !samples[j]!.clear) j++;
    const reconnects = j < samples.length;
    const endS = reconnects ? samples[j]! : samples[samples.length - 1]!;
    const lengthM = endS.d - s.d;
    let worst: Blackout["worstObstruction"] = null;
    if (t && endpoint) {
      const mid = samples[Math.floor((i + Math.min(j, samples.length - 1)) / 2)]!;
      const los = computeLOS(t, mid, roverAntennaM, endpoint, endpointAntennaM);
      if (los.worst) worst = { x: los.worst.x, y: los.worst.y, terrainM: los.worst.terrainM };
    }
    blackouts.push({
      index: blackouts.length,
      startM: s.d,
      endM: endS.d,
      reconnects,
      lengthM,
      durationS: speedMps > 0 ? lengthM / speedMps : Infinity,
      startPoint: { x: s.x, y: s.y },
      endPoint: reconnects ? { x: endS.x, y: endS.y } : null,
      worstObstruction: worst,
    });
    i = j;
  }
  const blackM = blackouts.reduce((a, b) => a + b.lengthM, 0);
  return {
    samples,
    blackouts,
    totalM,
    availabilityPct: totalM > 0 ? (100 * (totalM - blackM)) / totalM : samples[0]?.clear === false ? 0 : 100,
    totalBlackoutS: blackouts.reduce((a, b) => a + b.durationS, 0),
  };
}

/** Current blackout (progress inside) or next upcoming one. */
export function nextBlackout(p: Prediction | null, progressM: number): Blackout | null {
  if (!p) return null;
  return p.blackouts.find((b) => b.reconnects ? b.endM > progressM : b.endM >= progressM) ?? null;
}

export function positionAt(points: { x: number; y: number; d: number }[], progressM: number): Point {
  if (!points.length) return { x: 0, y: 0 };
  if (progressM <= 0) return { x: points[0]!.x, y: points[0]!.y };
  for (let i = 1; i < points.length; i++) {
    const b = points[i]!;
    if (b.d >= progressM) {
      const a = points[i - 1]!;
      const f = b.d === a.d ? 0 : (progressM - a.d) / (b.d - a.d);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  const last = points[points.length - 1]!;
  return { x: last.x, y: last.y };
}
