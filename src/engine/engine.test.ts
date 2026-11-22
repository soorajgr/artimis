import { describe, expect, it } from "vitest";
import { computeLOS } from "./los";
import { planRoute } from "./pathfinding";
import { blackoutsFromSamples } from "./prediction";
import { createItem, orderQueue, transmitStep, type DataItem } from "./queue";
import { buildRoute, computeMetrics, recommendRoute, type RouteSummary } from "./routes";
import { generateSyntheticTerrain, parseTerrainFile, sampleElevation, type Terrain } from "./terrain";

function flat(w = 20, h = 20, res = 10, fn: (x: number, y: number) => number = () => 0): Terrain {
  const elevation: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elevation.push(fn(x, y));
  return { width: w, height: h, resolutionM: res, originXM: 0, originYM: 0, units: "m", source: "synthetic", name: "t", elevation, minElevM: Math.min(...elevation), maxElevM: Math.max(...elevation) };
}

describe("terrain sampling", () => {
  it("bilinearly interpolates between cells in metres", () => {
    const t = flat(10, 10, 25, (x) => x * 10);
    expect(sampleElevation(t, 2.5, 3)).toBeCloseTo(25);
  });
  it("clamps samples outside the grid to the edge", () => {
    const t = flat(10, 10, 25, (x) => x * 10);
    expect(sampleElevation(t, 50, 0)).toBe(90);
  });
  it("stores resolution, units and source with the grid", () => {
    const s = generateSyntheticTerrain();
    expect(s.source).toBe("synthetic");
    expect(s.units).toBe("m");
    expect(s.resolutionM).toBe(25);
    const csv = Array.from({ length: 8 }, () => "1,2,3,4,5,6,7,8").join("\n");
    const u = parseTerrainFile(csv, "dem.csv", 5);
    expect(u.source).toBe("uploaded-dem");
    expect(u.resolutionM).toBe(5);
  });
  it("rejects ragged or non-numeric uploads", () => {
    const rows = Array.from({ length: 8 }, () => "1,2,3,4,5,6,7,8");
    rows[3] = "1,2,3";
    expect(() => parseTerrainFile(rows.join("\n"), "a.csv")).toThrow(/Row 4/);
    expect(() => parseTerrainFile(JSON.stringify([[1, "x"]]), "a.json")).toThrow();
  });
});

describe("line of sight", () => {
  it("is clear over flat ground", () => {
    expect(computeLOS(flat(), { x: 1, y: 10 }, 2, { x: 18, y: 10 }, 10).status).toBe("CLEAR");
  });
  it("locates the obstruction position and elevation", () => {
    const t = flat(20, 20, 10, (x) => (x === 10 ? 50 : 0));
    const r = computeLOS(t, { x: 2, y: 5 }, 2, { x: 18, y: 5 }, 10);
    expect(r.status).toBe("BLOCKED");
    expect(r.worst?.x).toBeCloseTo(10);
    expect(r.worst?.terrainM).toBeCloseTo(50);
    expect(r.worst?.distanceM).toBeCloseTo(80);
  });
  it("antenna height lifts the ray over a low bump", () => {
    const t = flat(20, 20, 10, (x) => (x === 10 ? 5 : 0));
    expect(computeLOS(t, { x: 2, y: 5 }, 2, { x: 18, y: 5 }, 2).status).toBe("BLOCKED");
    expect(computeLOS(t, { x: 2, y: 5 }, 8, { x: 18, y: 5 }, 8).status).toBe("CLEAR");
  });
});

describe("route safety", () => {
  const t = generateSyntheticTerrain();
  const params = { start: { x: 30, y: 10 }, destination: { x: 30, y: 72 }, endpoint: { x: 72, y: 40 }, roverAntennaM: 2, endpointAntennaM: 10, roverSpeedMps: 0.5, maxSlopeDeg: 20, commPenalty: 3 };
  it("both routes respect the maximum slope", () => {
    for (const id of ["A", "B"] as const) {
      const r = buildRoute(t, id, params);
      expect(r.found).toBe(true);
      expect(r.metrics!.maxSlopeDeg).toBeLessThanOrEqual(20);
    }
  });
  it("Route B's communication penalty yields more availability than Route A", () => {
    const a = buildRoute(t, "A", params), b = buildRoute(t, "B", params);
    expect(b.prediction!.availabilityPct).toBeGreaterThan(a.prediction!.availabilityPct);
  });
  it("reports no path when a wall exceeds the slope limit", () => {
    const wall = flat(20, 20, 10, (x) => (x === 10 ? 100 : 0));
    const r = planRoute(wall, { x: 2, y: 2 }, { x: 18, y: 2 }, { maxSlopeDeg: 20, commAware: false, commPenalty: 0, endpoint: { x: 0, y: 0 }, roverAntennaM: 2, endpointAntennaM: 2 });
    expect(r.found).toBe(false);
  });
  it("never recommends an unsafe route even with better communication", () => {
    const base = buildRoute(t, "A", params);
    const unsafeB: RouteSummary = { ...base, id: "B", safe: false, prediction: { ...base.prediction!, availabilityPct: 100 } };
    const safeA: RouteSummary = { ...base, prediction: { ...base.prediction!, availabilityPct: 10 } };
    expect(recommendRoute([safeA, unsafeB]).id).toBe("A");
    expect(recommendRoute([{ ...safeA, safe: false }, unsafeB]).id).toBeNull();
  });
  it("estimates distance in metres", () => {
    expect(computeMetrics(flat(), [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 1).distanceM).toBe(20);
  });
});

describe("blackout transitions", () => {
  const mk = (pattern: string) => pattern.split("").map((c, i) => ({ x: i, y: 0, d: i * 10, clear: c === "1" }));
  it("duration = distance from first blocked to first clear / speed", () => {
    const p = blackoutsFromSamples(null, mk("1100011"), 0.5);
    expect(p.blackouts).toHaveLength(1);
    expect(p.blackouts[0]!.startM).toBe(20);
    expect(p.blackouts[0]!.endM).toBe(50);
    expect(p.blackouts[0]!.durationS).toBe(60);
  });
  it("flags blackouts with no reconnection before route end", () => {
    const p = blackoutsFromSamples(null, mk("11000"), 1);
    expect(p.blackouts[0]!.reconnects).toBe(false);
    expect(p.blackouts[0]!.endPoint).toBeNull();
  });
  it("detects multiple blackouts", () => {
    expect(blackoutsFromSamples(null, mk("1010101"), 1).blackouts).toHaveLength(3);
  });
});

describe("priority transmission", () => {
  const q: DataItem[] = [createItem("image", 1, 0, 0), createItem("science", 2, 0, 0), createItem("health", 3, 0, 0), createItem("navigation", 4, 0, 0), createItem("emergency", 5, 0, 0)];
  it("orders critical first and FIFO within priority", () => {
    expect(orderQueue(q).map((i) => i.seq)).toEqual([3, 5, 4, 2, 1]);
  });
  it("sends nothing while the link is blocked", () => {
    const r = transmitStep(q, 1000, false, 1, 0, 0);
    expect(r.sentKB).toBe(0);
    expect(r.queue).toHaveLength(5);
  });
  it("keeps items until acknowledged, then removes them", () => {
    const s1 = transmitStep(q, 10, true, 1, 0, 0);
    expect(s1.queue).toHaveLength(5);
    expect(s1.queue.find((i) => i.seq === 3)!.status).toBe("awaiting-ack");
    const s2 = transmitStep(s1.queue, 0, true, s1.rngState, 0, 1);
    expect(s2.delivered.map((i) => i.seq)).toEqual([3, 5]);
    expect(s2.queue).toHaveLength(3);
  });
  it("failed ACK keeps the item for retry", () => {
    const s1 = transmitStep(q, 10, true, 1, 1, 0);
    const s2 = transmitStep(s1.queue, 0, true, s1.rngState, 1, 1);
    expect(s2.delivered).toHaveLength(0);
    expect(s2.queue.find((i) => i.seq === 3)!.status).toBe("retry");
  });
});
