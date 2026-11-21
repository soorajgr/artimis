import { makeRng } from "./rng";

export type TerrainSource = "synthetic" | "uploaded-dem";

export interface Point {
  x: number;
  y: number;
}

/**
 * Elevation grid. Positions are expressed in grid-cell units (x = column, y = row);
 * multiply by resolutionM to get metres. Elevations are always metres.
 */
export interface Terrain {
  width: number;
  height: number;
  resolutionM: number;
  originXM: number;
  originYM: number;
  units: "m";
  source: TerrainSource;
  name: string;
  elevation: number[]; // row-major, index = y * width + x
  minElevM: number;
  maxElevM: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function cellElevation(t: Terrain, x: number, y: number): number {
  const cx = clamp(Math.round(x), 0, t.width - 1);
  const cy = clamp(Math.round(y), 0, t.height - 1);
  return t.elevation[cy * t.width + cx] ?? 0;
}

/** Bilinear interpolation of elevation (metres) at a fractional grid position; clamps to the grid edge. */
export function sampleElevation(t: Terrain, x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Invalid sample position");
  const px = clamp(x, 0, t.width - 1);
  const py = clamp(y, 0, t.height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, t.width - 1);
  const y1 = Math.min(y0 + 1, t.height - 1);
  const fx = px - x0;
  const fy = py - y0;
  const e = (cx: number, cy: number) => t.elevation[cy * t.width + cx] ?? 0;
  const top = e(x0, y0) * (1 - fx) + e(x1, y0) * fx;
  const bottom = e(x0, y1) * (1 - fx) + e(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

export function inBounds(t: Terrain, p: Point): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= t.width - 1 && p.y <= t.height - 1;
}

export function toMetres(t: Terrain, p: Point): Point {
  return { x: t.originXM + p.x * t.resolutionM, y: t.originYM + p.y * t.resolutionM };
}

function finalize(base: Omit<Terrain, "minElevM" | "maxElevM">): Terrain {
  let min = Infinity;
  let max = -Infinity;
  for (const v of base.elevation) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { ...base, minElevM: min, maxElevM: max };
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const u = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

/** Synthetic terrain: gentle north-rising slope, flat southern plain, a large rimmed crater, a small crater and a steep NW ridge. */
export function generateSyntheticTerrain(seed = 42, size = 80, resolutionM = 25): Terrain {
  const rng = makeRng(seed);
  const gs = 9;
  const lattice: number[] = Array.from({ length: (gs + 1) * (gs + 1) }, () => rng() * 2 - 1);
  const noise = (x: number, y: number) => {
    const gx = (x / (size - 1)) * gs;
    const gy = (y / (size - 1)) * gs;
    const x0 = Math.min(Math.floor(gx), gs - 1);
    const y0 = Math.min(Math.floor(gy), gs - 1);
    const fx = gx - x0;
    const fy = gy - y0;
    const l = (i: number, j: number) => lattice[j * (gs + 1) + i] ?? 0;
    const s = (v: number) => v * v * (3 - 2 * v);
    const a = l(x0, y0) + (l(x0 + 1, y0) - l(x0, y0)) * s(fx);
    const b = l(x0, y0 + 1) + (l(x0 + 1, y0 + 1) - l(x0, y0 + 1)) * s(fx);
    return a + (b - a) * s(fy);
  };
  const elevation: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = y < 22 ? 0.15 * y : 0.15 * 22 + 0.6 * (y - 22);
      const r = Math.hypot(x - 46, y - 40);
      const R = 8;
      if (r < R) h -= 55 * (1 - (r / R) ** 2);
      h += 80 * Math.exp(-(((r - R) / 2.2) ** 2));
      const r2 = Math.hypot(x - 18, y - 30);
      if (r2 < 4) h -= 12 * (1 - (r2 / 4) ** 2);
      h += 8 * Math.exp(-(((r2 - 4) / 1.3) ** 2));
      const d = distToSegment({ x, y }, { x: 6, y: 50 }, { x: 18, y: 78 });
      h += 75 * Math.exp(-((d / 3) ** 2));
      h += 2.5 * noise(x, y);
      elevation.push(Math.round(h * 100) / 100);
    }
  }
  return finalize({
    width: size,
    height: size,
    resolutionM,
    originXM: 0,
    originYM: 0,
    units: "m",
    source: "synthetic",
    name: `Synthetic terrain (seed ${seed})`,
    elevation,
  });
}

export class TerrainParseError extends Error {}

/**
 * Parse an uploaded elevation grid (metres). CSV: rows of numbers. JSON: number[][] or
 * { resolutionM?, elevation: number[][] }. Throws TerrainParseError with a readable message.
 */
export function parseTerrainFile(text: string, fileName: string, defaultResolutionM = 25): Terrain {
  let rows: unknown;
  let resolutionM = defaultResolutionM;
  const isJson = fileName.toLowerCase().endsWith(".json") || text.trim().startsWith("[") || text.trim().startsWith("{");
  if (isJson) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new TerrainParseError("File is not valid JSON.");
    }
    if (Array.isArray(data)) rows = data;
    else if (data && typeof data === "object" && "elevation" in data) {
      const obj = data as { elevation: unknown; resolutionM?: unknown };
      rows = obj.elevation;
      if (obj.resolutionM !== undefined) {
        if (typeof obj.resolutionM !== "number" || !(obj.resolutionM > 0)) throw new TerrainParseError("resolutionM must be a positive number (metres per cell).");
        resolutionM = obj.resolutionM;
      }
    } else throw new TerrainParseError('JSON must be a 2D array or an object with an "elevation" 2D array.');
  } else {
    rows = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((l) => l.split(/[,;\s]+/).map((v) => Number(v)));
  }
  if (!Array.isArray(rows) || rows.length < 8) throw new TerrainParseError("Grid must have at least 8 rows.");
  const width = Array.isArray(rows[0]) ? (rows[0] as unknown[]).length : 0;
  if (width < 8) throw new TerrainParseError("Grid must have at least 8 columns.");
  if (rows.length > 400 || width > 400) throw new TerrainParseError("Grid is too large (max 400 × 400).");
  const elevation: number[] = [];
  rows.forEach((row, j) => {
    if (!Array.isArray(row) || row.length !== width) throw new TerrainParseError(`Row ${j + 1} has a different number of columns (expected ${width}).`);
    row.forEach((v, i) => {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new TerrainParseError(`Invalid elevation at row ${j + 1}, column ${i + 1}.`);
      elevation.push(v);
    });
  });
  return finalize({
    width,
    height: rows.length,
    resolutionM,
    originXM: 0,
    originYM: 0,
    units: "m",
    source: "uploaded-dem",
    name: fileName,
    elevation,
  });
}
