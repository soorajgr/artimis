import { isLosClear } from "./los";
import { cellElevation, type Point, type Terrain } from "./terrain";

export interface PlanOptions {
  maxSlopeDeg: number;
  /** When true, LOS is evaluated at candidate nodes during search and blocked nodes are penalised. */
  commAware: boolean;
  /** Extra cost per metre travelled through a node without line of sight (multiplier of distance). */
  commPenalty: number;
  endpoint: Point;
  roverAntennaM: number;
  endpointAntennaM: number;
}

export interface PlannedPath {
  found: boolean;
  cells: Point[];
  reason?: string;
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

export function edgeSlopeDeg(t: Terrain, a: Point, b: Point): number {
  const run = Math.hypot(b.x - a.x, b.y - a.y) * t.resolutionM;
  if (run === 0) return 0;
  const dz = cellElevation(t, b.x, b.y) - cellElevation(t, a.x, a.y);
  return (Math.atan(Math.abs(dz) / run) * 180) / Math.PI;
}

class MinHeap {
  private items: { k: number; v: number }[] = [];
  get size() { return this.items.length; }
  push(v: number, k: number) {
    const a = this.items;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pi = a[p]!, ii = a[i]!;
      if (pi.k <= ii.k) break;
      a[p] = ii; a[i] = pi; i = p;
    }
  }
  pop(): number | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.k < a[m]!.k) m = l;
        if (r < a.length && a[r]!.k < a[m]!.k) m = r;
        if (m === i) break;
        const tmp = a[m]!; a[m] = a[i]!; a[i] = tmp; i = m;
      }
    }
    return top.v;
  }
}

/** 8-neighbour A*. Edges steeper than maxSlopeDeg are impassable (hard safety constraint) for every route. */
export function planRoute(t: Terrain, start: Point, goal: Point, opts: PlanOptions): PlannedPath {
  const w = t.width, h = t.height;
  const sx = Math.round(start.x), sy = Math.round(start.y);
  const gx = Math.round(goal.x), gy = Math.round(goal.y);
  if ([sx, sy, gx, gy].some((v) => !Number.isFinite(v))) return { found: false, cells: [], reason: "Invalid coordinates" };
  if (sx < 0 || sy < 0 || gx < 0 || gy < 0 || sx >= w || gx >= w || sy >= h || gy >= h)
    return { found: false, cells: [], reason: "Start or destination is outside the terrain" };
  const N = w * h;
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const losCache = new Uint8Array(N); // 0 unknown, 1 clear, 2 blocked
  const blocked = (x: number, y: number) => {
    const i = y * w + x;
    if (!losCache[i]) losCache[i] = isLosClear(t, { x, y }, opts.roverAntennaM, opts.endpoint, opts.endpointAntennaM) ? 1 : 2;
    return losCache[i] === 2;
  };
  const heur = (x: number, y: number) => Math.hypot(gx - x, gy - y) * t.resolutionM;
  const s = sy * w + sx, goalI = gy * w + gx;
  g[s] = 0;
  const open = new MinHeap();
  open.push(s, heur(sx, sy));
  while (open.size) {
    const cur = open.pop()!;
    if (closed[cur]) continue;
    if (cur === goalI) break;
    closed[cur] = 1;
    const cx = cur % w, cy = (cur - cx) / w;
    const ce = t.elevation[cur] ?? 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const run = Math.hypot(dx, dy) * t.resolutionM;
      const dz = (t.elevation[ni] ?? 0) - ce;
      const slope = (Math.atan(Math.abs(dz) / run) * 180) / Math.PI;
      if (slope > opts.maxSlopeDeg) continue;
      // Prevent corner-cutting across impassable orthogonal terrain
      if (dx !== 0 && dy !== 0) {
        const o1i = cy * w + (cx + dx);
        const o2i = (cy + dy) * w + cx;
        const e1 = t.elevation[o1i] ?? 0;
        const e2 = t.elevation[o2i] ?? 0;
        const s1 = (Math.atan(Math.abs(e1 - ce) / t.resolutionM) * 180) / Math.PI;
        const s2 = (Math.atan(Math.abs(e2 - ce) / t.resolutionM) * 180) / Math.PI;
        const s1_n = (Math.atan(Math.abs((t.elevation[ni] ?? 0) - e1) / t.resolutionM) * 180) / Math.PI;
        const s2_n = (Math.atan(Math.abs((t.elevation[ni] ?? 0) - e2) / t.resolutionM) * 180) / Math.PI;
        if (s1 > opts.maxSlopeDeg || s2 > opts.maxSlopeDeg || s1_n > opts.maxSlopeDeg || s2_n > opts.maxSlopeDeg) {
          continue;
        }
      }
      let cost = run * (1 + (0.5 * slope) / Math.max(opts.maxSlopeDeg, 1)) + Math.max(dz, 0) * 2;
      if (opts.commAware && blocked(nx, ny)) cost += run * opts.commPenalty;
      const ng = (g[cur] ?? Infinity) + cost;
      if (ng < (g[ni] ?? Infinity)) {
        g[ni] = ng;
        came[ni] = cur;
        open.push(ni, ng + heur(nx, ny));
      }
    }
  }
  if (!Number.isFinite(g[goalI] ?? Infinity)) return { found: false, cells: [], reason: "No path satisfies the maximum slope constraint" };
  const cells: Point[] = [];
  for (let i = goalI; i !== -1; i = came[i] ?? -1) {
    cells.push({ x: i % w, y: Math.floor(i / w) });
    if (i === s) break;
  }
  cells.reverse();
  return { found: true, cells };
}
