import { sampleElevation, type Point, type Terrain } from "./terrain";

export interface LosSample {
  distanceM: number;
  x: number;
  y: number;
  terrainM: number;
  rayM: number;
}

export interface Obstruction {
  distanceM: number;
  x: number;
  y: number;
  terrainM: number;
  rayM: number;
  /** How far terrain rises above the ray (metres, > 0). */
  excessM: number;
}

export interface LosResult {
  status: "CLEAR" | "BLOCKED";
  distanceM: number;
  roverGroundM: number;
  endpointGroundM: number;
  roverAntennaTopM: number;
  endpointAntennaTopM: number;
  minClearanceM: number;
  samples: LosSample[];
  obstructions: Obstruction[];
  worst: Obstruction | null;
}

/** Sample spacing along the LOS segment, in grid cells (≤ half the grid resolution). */
export const LOS_SPACING_CELLS = 0.5;

function sampleCount(a: Point, b: Point) {
  return Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / LOS_SPACING_CELLS));
}

/**
 * Simplified geometric line of sight between the rover antenna and the endpoint antenna.
 * Samples the complete segment (both ends included); terrain strictly above the straight ray is an obstruction.
 * Not an RF propagation model: no diffraction, Fresnel zones, antenna gain or link budget.
 */
export function computeLOS(t: Terrain, rover: Point, roverAntennaM: number, endpoint: Point, endpointAntennaM: number): LosResult {
  const roverGroundM = sampleElevation(t, rover.x, rover.y);
  const endpointGroundM = sampleElevation(t, endpoint.x, endpoint.y);
  const h0 = roverGroundM + roverAntennaM;
  const h1 = endpointGroundM + endpointAntennaM;
  const n = sampleCount(rover, endpoint);
  const lenM = Math.hypot(endpoint.x - rover.x, endpoint.y - rover.y) * t.resolutionM;
  const samples: LosSample[] = [];
  const obstructions: Obstruction[] = [];
  let minClearanceM = Infinity;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = rover.x + (endpoint.x - rover.x) * f;
    const y = rover.y + (endpoint.y - rover.y) * f;
    const terrainM = sampleElevation(t, x, y);
    const rayM = h0 + (h1 - h0) * f;
    const distanceM = lenM * f;
    samples.push({ distanceM, x, y, terrainM, rayM });
    const clearance = rayM - terrainM;
    if (clearance < minClearanceM) minClearanceM = clearance;
    if (terrainM > rayM) obstructions.push({ distanceM, x, y, terrainM, rayM, excessM: terrainM - rayM });
  }
  let worst: Obstruction | null = null;
  for (const o of obstructions) if (!worst || o.excessM > worst.excessM) worst = o;
  return {
    status: obstructions.length ? "BLOCKED" : "CLEAR",
    distanceM: lenM,
    roverGroundM,
    endpointGroundM,
    roverAntennaTopM: h0,
    endpointAntennaTopM: h1,
    minClearanceM,
    samples,
    obstructions,
    worst,
  };
}

/** Fast boolean version with early exit; same geometry as computeLOS. */
export function isLosClear(t: Terrain, rover: Point, roverAntennaM: number, endpoint: Point, endpointAntennaM: number): boolean {
  const h0 = sampleElevation(t, rover.x, rover.y) + roverAntennaM;
  const h1 = sampleElevation(t, endpoint.x, endpoint.y) + endpointAntennaM;
  const n = sampleCount(rover, endpoint);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const terrainM = sampleElevation(t, rover.x + (endpoint.x - rover.x) * f, rover.y + (endpoint.y - rover.y) * f);
    if (terrainM > h0 + (h1 - h0) * f) return false;
  }
  return true;
}
