import { describe, expect, it } from "vitest";
import { computeLOS } from "./los";
import { planRoute } from "./pathfinding";
import { blackoutsFromSamples, predictBlackouts } from "./prediction";
import { createItem, orderQueue, transmitStep, type DataItem } from "./queue";
import { buildRoute, type RouteSummary } from "./routes";
import { initialSimulation, stepSimulation, type SimulationSettings, type SimulationState } from "./simulation";
import { generateSyntheticTerrain, type Terrain } from "./terrain";
import {
  clearMissionState,
  isValidSnapshot,
  loadMissionState,
  saveMissionState,
  type MissionSnapshot,
} from "../state/persistence";

function flatGrid(w = 20, h = 20, res = 10, fn: (x: number, y: number) => number = () => 0): Terrain {
  const elevation: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elevation.push(fn(x, y));
  return {
    width: w,
    height: h,
    resolutionM: res,
    originXM: 0,
    originYM: 0,
    units: "m",
    source: "synthetic",
    name: "test-grid",
    elevation,
    minElevM: Math.min(...elevation),
    maxElevM: Math.max(...elevation),
  };
}

describe("Simulation Time-Step Accuracy (Phase 2)", () => {
  const settings: SimulationSettings = {
    start: { x: 0, y: 10 },
    destination: { x: 19, y: 10 },
    endpoint: { x: 10, y: 0 },
    roverAntennaM: 2,
    endpointAntennaM: 10,
    roverSpeedMps: 1, // 1 m/s for clean math
    maxSlopeDeg: 20,
    commPenalty: 3,
    warningS: 60,
    txRateKBps: 10,
    capacityKB: 1024,
    simSpeed: 1,
  };

  // Helper to build a test route with custom blackout intervals
  function mockRoute(distanceM: number, blackouts: { startM: number; endM: number; reconnects: boolean }[]): RouteSummary {
    const points = Array.from({ length: Math.ceil(distanceM) + 1 }, (_, i) => ({ x: i, y: 10, d: i }));
    return {
      id: "A",
      label: "Test Route",
      found: true,
      safe: true,
      cells: points.map((p) => ({ x: p.x, y: p.y })),
      points,
      metrics: {
        distanceM,
        travelTimeS: distanceM / settings.roverSpeedMps,
        maxSlopeDeg: 0,
        meanSlopeDeg: 0,
        difficulty: "Low",
        energyWh: 10,
      },
      prediction: {
        samples: points.map((p) => ({
          x: p.x,
          y: p.y,
          d: p.d,
          clear: !blackouts.some((b) => b.startM <= p.d && p.d < b.endM),
        })),
        blackouts: blackouts.map((b, i) => ({
          index: i,
          startM: b.startM,
          endM: b.endM,
          reconnects: b.reconnects,
          lengthM: b.endM - b.startM,
          durationS: (b.endM - b.startM) / settings.roverSpeedMps,
          startPoint: { x: b.startM, y: 10 },
          endPoint: b.reconnects ? { x: b.endM, y: 10 } : null,
          worstObstruction: null,
        })),
        totalM: distanceM,
        availabilityPct: 80,
        totalBlackoutS: blackouts.reduce((sum, b) => sum + (b.endM - b.startM), 0),
      },
    };
  }

  it("detects a narrow blackout completely crossed within a single timestep", () => {
    const terrain = flatGrid();
    // Narrow blackout between d=15 and d=25
    const route = mockRoute(100, [{ startM: 15, endM: 25, reconnects: true }]);
    const initial = { ...initialSimulation(), progressM: 10, timeS: 10 };

    // Rover travels from d=10 to d=30 in one step of 20 seconds (dt=20)
    const next = stepSimulation(initial, terrain, route, settings, 20);

    expect(next.progressM).toBe(30);
    expect(next.timeS).toBe(30);

    // Blocked distance was 10m (from 15 to 25). Clear distance was (15-10) + (30-25) = 10m.
    // At 1 m/s, clearSeconds must only accumulate 10s of clear time!
    expect(next.clearSeconds).toBeCloseTo(10);

    // Must emit both Communication lost and Communication restored chronologically
    const msgs = next.events.map((e) => e.msg);
    expect(msgs).toContain("Communication lost · local data buffer active");
    expect(msgs).toContain("Communication restored · data transmission resumed");

    const lostEvent = next.events.find((e) => e.msg.includes("lost"))!;
    const restEvent = next.events.find((e) => e.msg.includes("restored"))!;
    // Entry at d=15 -> t = 10 + (15 - 10) / 1 = 15s
    expect(lostEvent.time).toBeCloseTo(15);
    // Exit at d=25 -> t = 10 + (25 - 10) / 1 = 25s
    expect(restEvent.time).toBeCloseTo(25);
    expect(lostEvent.time).toBeLessThan(restEvent.time);
  });

  it("handles multiple blackout intervals crossed within a single timestep", () => {
    const terrain = flatGrid();
    // Two blackouts: [15, 20] and [25, 30]
    const route = mockRoute(100, [
      { startM: 15, endM: 20, reconnects: true },
      { startM: 25, endM: 30, reconnects: true },
    ]);
    const initial = { ...initialSimulation(), progressM: 10, timeS: 10 };

    // Move from d=10 to d=35 (dt=25s at 1 m/s)
    const next = stepSimulation(initial, terrain, route, settings, 25);

    expect(next.progressM).toBe(35);
    // Blocked distance = (20-15) + (30-25) = 10m. Clear distance = (15-10) + (25-20) + (35-30) = 15m.
    expect(next.clearSeconds).toBeCloseTo(15);

    const lostEvents = next.events.filter((e) => e.msg.includes("lost"));
    const restEvents = next.events.filter((e) => e.msg.includes("restored"));
    expect(lostEvents).toHaveLength(2);
    expect(restEvents).toHaveLength(2);
  });

  it("handles blackout beginning partway through a timestep", () => {
    const terrain = flatGrid();
    // Blackout from d=15 to d=35
    const route = mockRoute(100, [{ startM: 15, endM: 35, reconnects: true }]);
    const initial = { ...initialSimulation(), progressM: 10, timeS: 10 };

    // Move from d=10 to d=20 (dt=10s)
    const next = stepSimulation(initial, terrain, route, settings, 10);

    expect(next.progressM).toBe(20);
    // Clear distance = 15 - 10 = 5m. Blocked distance = 20 - 15 = 5m.
    expect(next.clearSeconds).toBeCloseTo(5);
    expect(next.events.some((e) => e.msg.includes("lost"))).toBe(true);
    expect(next.events.some((e) => e.msg.includes("restored"))).toBe(false);
  });

  it("handles communication restored partway through a timestep", () => {
    const terrain = flatGrid();
    // Blackout from d=10 to d=20
    const route = mockRoute(100, [{ startM: 10, endM: 20, reconnects: true }]);
    const initial = { ...initialSimulation(), progressM: 15, timeS: 15 };

    // Move from d=15 to d=25 (dt=10s)
    const next = stepSimulation(initial, terrain, route, settings, 10);

    expect(next.progressM).toBe(25);
    // Blocked from 15 to 20 = 5m. Clear from 20 to 25 = 5m.
    expect(next.clearSeconds).toBeCloseTo(5);
    expect(next.events.some((e) => e.msg.includes("restored"))).toBe(true);
  });

  it("calculates telemetry transmission and availability strictly using clear-link time", () => {
    const terrain = flatGrid();
    const route = mockRoute(100, [{ startM: 15, endM: 25, reconnects: true }]);
    let sim = { ...initialSimulation(), progressM: 10, timeS: 10 };
    // Queue a science packet (150 KB)
    sim.queue = [createItem("science", 1, 0, 0)];

    // Advance 20s (clearDt = 10s, txRate = 10 KB/s -> budget = 100 KB)
    sim = stepSimulation(sim, terrain, route, settings, 20);

    // The science packet was partially transmitted for 100 KB (or interrupted during blackout)
    expect(sim.history[0]?.availability).toBeCloseTo((10 / 30) * 100);
  });
});

describe("Diagonal Path Safety & Corner-Cutting (Phase 3)", () => {
  it("rejects diagonal movement when an orthogonal neighbor is an impassable cliff", () => {
    // Grid: (0,0) is 0m, (1,1) is 0m. But (1,0) is a 100m cliff!
    const t = flatGrid(4, 4, 10, (x, y) => {
      if (x === 1 && y === 0) return 100; // Impassable cliff at corner
      return 0;
    });

    const opts = {
      maxSlopeDeg: 20,
      commAware: false,
      commPenalty: 0,
      endpoint: { x: 3, y: 3 },
      roverAntennaM: 2,
      endpointAntennaM: 10,
    };

    const path = planRoute(t, { x: 0, y: 0 }, { x: 1, y: 1 }, opts);
    // Directly stepping diagonally (0,0)->(1,1) cuts the cliff corner at (1,0)
    // The pathfinder must either navigate around via (0,1)->(1,1) or not step directly across the corner
    if (path.found) {
      expect(path.cells).not.toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]);
      expect(path.cells).toEqual([
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ]);
    }
  });

  it("allows valid diagonal movement across smooth, safe terrain", () => {
    const t = flatGrid(4, 4, 10, () => 0); // Completely flat
    const opts = {
      maxSlopeDeg: 20,
      commAware: false,
      commPenalty: 0,
      endpoint: { x: 3, y: 3 },
      roverAntennaM: 2,
      endpointAntennaM: 10,
    };

    const path = planRoute(t, { x: 0, y: 0 }, { x: 2, y: 2 }, opts);
    expect(path.found).toBe(true);
    // Can step diagonally across flat terrain
    expect(path.cells.length).toBeLessThanOrEqual(4);
  });

  it("both Route A and Route B strictly enforce maximum slope safety limits", () => {
    const t = generateSyntheticTerrain();
    const params = {
      start: { x: 30, y: 10 },
      destination: { x: 30, y: 72 },
      endpoint: { x: 72, y: 40 },
      roverAntennaM: 2,
      endpointAntennaM: 10,
      roverSpeedMps: 0.5,
      maxSlopeDeg: 20,
      commPenalty: 3,
    };

    for (const id of ["A", "B"] as const) {
      const r = buildRoute(t, id, params);
      expect(r.found).toBe(true);
      expect(r.metrics!.maxSlopeDeg).toBeLessThanOrEqual(20);
    }
  });
});

describe("Interrupted Transmission Accounting (Phase 4)", () => {
  it("interrupted active transmission resets packet to retry and tracks wasted bytes", () => {
    const item = createItem("science", 1, 0, 0);
    // Simulate packet already partially transmitted (50 KB sent)
    const inFlight: DataItem = { ...item, status: "transmitting", sentKB: 50 };

    // Blackout occurs (linkClear = false)
    const res = transmitStep([inFlight], 0, false, 2026, 0.08, 10);

    expect(res.interruptedKB).toBe(50);
    expect(res.delivered).toHaveLength(0);
    expect(res.queue[0]?.status).toBe("retry");
    expect(res.queue[0]?.sentKB).toBe(0);
    expect(res.queue[0]?.attempts).toBe(1);

    expect(res.events).toHaveLength(1);
    expect(res.events[0]?.level).toBe("warn");
    expect(res.events[0]?.msg).toContain("Transmission interrupted by blackout");
    expect(res.events[0]?.msg).toContain("50 KB");
  });

  it("resumes and retransmits retried packet after link is restored", () => {
    const item = createItem("health", 1, 0, 0); // small health packet ~16KB
    const inFlight: DataItem = { ...item, status: "transmitting", sentKB: 8 };

    // 1. Interrupted by blackout
    const step1 = transmitStep([inFlight], 0, false, 2026, 0, 10);
    expect(step1.queue[0]?.status).toBe("retry");

    // 2. Link restored with sufficient bandwidth budget
    const step2 = transmitStep(step1.queue, 100, true, step1.rngState, 0, 11);
    expect(step2.queue[0]?.status).toBe("awaiting-ack");
    expect(step2.queue[0]?.sentKB).toBe(step2.queue[0]?.sizeKB);

    // 3. Next step ACKs the packet
    const step3 = transmitStep(step2.queue, 0, true, step2.rngState, 0, 12);
    expect(step3.delivered).toHaveLength(1);
    expect(step3.delivered[0]?.id).toBe(item.id);
  });

  it("strictly enforces P1 to P4 priority order with FIFO within same priority", () => {
    const q: DataItem[] = [
      createItem("image", 10, 0, 0),     // P4
      createItem("science", 20, 0, 0),   // P3
      createItem("navigation", 30, 0, 0),// P2
      createItem("health", 40, 0, 0),    // P1
      createItem("emergency", 41, 0, 0), // P1
    ];

    const ordered = orderQueue(q);
    expect(ordered.map((i) => i.priority)).toEqual([1, 1, 2, 3, 4]);
    // FIFO within P1
    expect(ordered.filter((i) => i.priority === 1).map((i) => i.seq)).toEqual([40, 41]);
  });
});

describe("Mission Persistence & Self-Healing (Phase 5)", () => {
  it("validates a structurally sound snapshot and rejects invalid snapshots", () => {
    const terrain = flatGrid(10, 10);
    const valid: MissionSnapshot = {
      version: 2,
      savedAt: Date.now(),
      terrain,
      settings: {
        start: { x: 0, y: 0 },
        destination: { x: 9, y: 9 },
        endpoint: { x: 5, y: 5 },
        roverAntennaM: 2,
        endpointAntennaM: 10,
        roverSpeedMps: 0.5,
        maxSlopeDeg: 20,
        commPenalty: 3,
        warningS: 180,
        txRateKBps: 32,
        capacityKB: 32768,
        simSpeed: 20,
      },
      selected: "A",
      sim: initialSimulation(),
    };

    expect(isValidSnapshot(valid)).toBe(true);

    // Corrupt snapshot (invalid version)
    expect(isValidSnapshot({ ...valid, version: 1 })).toBe(false);
    // Corrupt snapshot (elevation array length mismatch)
    expect(isValidSnapshot({ ...valid, terrain: { ...terrain, elevation: [1, 2, 3] } })).toBe(false);
    // Corrupt snapshot (missing settings)
    expect(isValidSnapshot({ ...valid, settings: null })).toBe(false);
  });

  it("saves and loads mission state across storage cycles", async () => {
    const terrain = flatGrid(10, 10);
    const snapshot: MissionSnapshot = {
      version: 2,
      savedAt: 12345678,
      terrain,
      settings: {
        start: { x: 1, y: 2 },
        destination: { x: 8, y: 8 },
        endpoint: { x: 5, y: 5 },
        roverAntennaM: 3.5,
        endpointAntennaM: 12,
        roverSpeedMps: 0.8,
        maxSlopeDeg: 18,
        commPenalty: 4,
        warningS: 120,
        txRateKBps: 64,
        capacityKB: 16384,
        simSpeed: 10,
      },
      selected: "B",
      sim: {
        ...initialSimulation(),
        progressM: 42.5,
        timeS: 120,
        deliveredCount: 7,
        deliveredKB: 256,
        wastedKB: 16,
      },
    };

    const saved = await saveMissionState(snapshot);
    expect(saved).toBe(true);

    const loaded = await loadMissionState();
    expect(loaded).not.toBeNull();
    expect(loaded?.selected).toBe("B");
    expect(loaded?.sim.progressM).toBe(42.5);
    expect(loaded?.sim.deliveredCount).toBe(7);
    expect(loaded?.sim.wastedKB).toBe(16);
    expect(loaded?.settings.roverAntennaM).toBe(3.5);
  });

  it("clearMissionState wipes stored data and subsequent load returns null", async () => {
    await clearMissionState();
    const loaded = await loadMissionState();
    expect(loaded).toBeNull();
  });
});
