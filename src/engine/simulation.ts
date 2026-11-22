import { computeLOS } from './los';
import { positionAt } from './prediction';
import { canStore, createItem, transmitStep, type DataItem, type DataType } from './queue';
import { nextRandom } from './rng';
import type { RouteSummary } from './routes';
import type { Terrain, Point } from './terrain';

export interface SimulationSettings {
  roverAntennaM: number; endpointAntennaM: number; roverSpeedMps: number;
  maxSlopeDeg: number; commPenalty: number; warningS: number; txRateKBps: number;
  capacityKB: number; simSpeed: number; start: Point; destination: Point; endpoint: Point;
}
export interface MissionEvent { time: number; level: 'info' | 'success' | 'warn'; msg: string }
export interface HistorySample { time: number; availability: number; bufferedKB: number; deliveredKB: number; wastedKB: number }
export interface SimulationState {
  timeS: number; progressM: number; running: boolean; autoGenerate: boolean; queue: DataItem[];
  seq: number; rngState: number; generatedKB: number; deliveredKB: number; wastedKB: number; deliveredCount: number;
  clearSeconds: number; restored: boolean; events: MissionEvent[]; history: HistorySample[];
}
export function initialSimulation(): SimulationState {
  return { timeS: 0, progressM: 0, running: false, autoGenerate: true, queue: [], seq: 0,
    rngState: 2026, generatedKB: 0, deliveredKB: 0, wastedKB: 0, deliveredCount: 0, clearSeconds: 0, restored: false,
    events: [{ time: 0, level: 'info', msg: 'Mission initialised · synthetic terrain loaded' }], history: [] };
}
export function generateData(s: SimulationState, type: DataType, capacityKB: number): SimulationState {
  const [rand, rngState] = nextRandom(s.rngState);
  const item = createItem(type, s.seq + 1, s.timeS, rand);
  if (!canStore(s.queue, item, capacityKB)) return { ...s, events: [...s.events, { time: s.timeS, level: 'warn' as const, msg: `Storage full · ${item.id} not generated` }].slice(-300) };
  const level: MissionEvent['level'] = item.priority === 1 ? 'warn' : 'info';
  return { ...s, rngState, seq: s.seq + 1, queue: [...s.queue, item], generatedKB: s.generatedKB + item.sizeKB,
    events: [...s.events, { time: s.timeS, level, msg: `${item.id} queued · priority ${item.priority}` }].slice(-300) };
}

export interface BlockedInterval {
  startM: number;
  endM: number;
  clampedStartM: number;
  clampedEndM: number;
  reconnects: boolean;
}

/**
 * Returns all blocked distance intervals occurring or intersecting within [d0, d1].
 * Prefers predicted blackout intervals when available; otherwise samples adaptively.
 */
export function getBlockedSegments(
  terrain: Terrain,
  route: RouteSummary,
  settings: SimulationSettings,
  d0: number,
  d1: number,
): BlockedInterval[] {
  if (d1 <= d0) return [];
  const maxM = route.metrics?.distanceM ?? Infinity;

  if (route.prediction?.blackouts && route.prediction.blackouts.length > 0) {
    const result: BlockedInterval[] = [];
    for (const b of route.prediction.blackouts) {
      const bStart = b.startM;
      const bEnd = b.reconnects ? b.endM : maxM;
      if (bStart < d1 && bEnd > d0) {
        result.push({
          startM: bStart,
          endM: bEnd,
          clampedStartM: Math.max(d0, bStart),
          clampedEndM: Math.min(d1, bEnd),
          reconnects: b.reconnects,
        });
      }
    }
    return result;
  }

  // Adaptive spatial sampling fallback
  const stepM = Math.max(1, Math.min(5, terrain.resolutionM / 2));
  const samples: { d: number; clear: boolean }[] = [];
  for (let d = d0; d < d1; d += stepM) {
    const pt = positionAt(route.points, d);
    const clear = computeLOS(terrain, pt, settings.roverAntennaM, settings.endpoint, settings.endpointAntennaM).status === 'CLEAR';
    samples.push({ d, clear });
  }
  const endPt = positionAt(route.points, d1);
  samples.push({
    d: d1,
    clear: computeLOS(terrain, endPt, settings.roverAntennaM, settings.endpoint, settings.endpointAntennaM).status === 'CLEAR',
  });

  const result: BlockedInterval[] = [];
  let inBlock = false;
  let blockStart = 0;
  for (const s of samples) {
    if (!s.clear && !inBlock) {
      inBlock = true;
      blockStart = s.d;
    } else if (s.clear && inBlock) {
      inBlock = false;
      result.push({
        startM: blockStart,
        endM: s.d,
        clampedStartM: Math.max(d0, blockStart),
        clampedEndM: Math.min(d1, s.d),
        reconnects: true,
      });
    }
  }
  if (inBlock) {
    result.push({
      startM: blockStart,
      endM: maxM,
      clampedStartM: Math.max(d0, blockStart),
      clampedEndM: d1,
      reconnects: false,
    });
  }
  return result;
}

export function stepSimulation(s: SimulationState, terrain: Terrain, route: RouteSummary, settings: SimulationSettings, dt: number): SimulationState {
  if (!route.found || !route.safe || !route.metrics) return { ...s, running: false };

  const d0 = s.progressM;
  const maxM = route.metrics.distanceM;
  const v = settings.roverSpeedMps;
  const d1 = Math.min(maxM, d0 + dt * v);
  const distM = d1 - d0;

  // Split timestep into clear and blocked portions along the traversed path
  const blockedSegs = getBlockedSegments(terrain, route, settings, d0, d1);
  const blockedDistM = blockedSegs.reduce((sum, seg) => sum + (seg.clampedEndM - seg.clampedStartM), 0);
  const clearDistM = Math.max(0, distM - blockedDistM);

  let clearDt = 0;
  let blockedDt = 0;
  if (v > 0 && distM > 0) {
    const travelDt = distM / v;
    const clearTravelDt = clearDistM / v;
    const blockedTravelDt = blockedDistM / v;
    const remDt = Math.max(0, dt - travelDt);
    if (remDt > 0) {
      const atDestClear = computeLOS(terrain, positionAt(route.points, d1), settings.roverAntennaM, settings.endpoint, settings.endpointAntennaM).status === 'CLEAR';
      clearDt = clearTravelDt + (atDestClear ? remDt : 0);
      blockedDt = blockedTravelDt + (atDestClear ? 0 : remDt);
    } else {
      clearDt = clearTravelDt;
      blockedDt = blockedTravelDt;
    }
  } else {
    const pt = positionAt(route.points, d0);
    const curClear = computeLOS(terrain, pt, settings.roverAntennaM, settings.endpoint, settings.endpointAntennaM).status === 'CLEAR';
    clearDt = curClear ? dt : 0;
    blockedDt = curClear ? 0 : dt;
  }

  // Detect genuine communication transitions occurring within (d0, d1]
  const transitionEvents: MissionEvent[] = [];
  const startPt = positionAt(route.points, d0);
  const startClear = computeLOS(terrain, startPt, settings.roverAntennaM, settings.endpoint, settings.endpointAntennaM).status === 'CLEAR';
  const endPt = positionAt(route.points, d1);
  const endClear = computeLOS(terrain, endPt, settings.roverAntennaM, settings.endpoint, settings.endpointAntennaM).status === 'CLEAR';

  for (const seg of blockedSegs) {
    if (v > 0) {
      // Entry occurs only if the actual blackout start is strictly within (d0, d1]
      if (seg.startM > d0 && seg.startM <= d1) {
        const tLoss = s.timeS + (seg.startM - d0) / v;
        transitionEvents.push({ time: Number(tLoss.toFixed(1)), level: 'warn', msg: 'Communication lost · local data buffer active' });
      }
      // Restoration occurs only if the actual blackout end is strictly within (d0, d1] and reconnects before route end
      if (seg.reconnects && seg.endM > d0 && seg.endM <= d1 && seg.endM < maxM) {
        const tRest = s.timeS + (seg.endM - d0) / v;
        transitionEvents.push({ time: Number(tRest.toFixed(1)), level: 'success', msg: 'Communication restored · data transmission resumed' });
      }
    }
  }

  // Fallback for stationary or single-sample transitions
  if (distM === 0 && startClear !== endClear) {
    transitionEvents.push({
      time: s.timeS + dt,
      level: endClear ? 'success' : 'warn',
      msg: endClear ? 'Communication restored · data transmission resumed' : 'Communication lost · local data buffer active',
    });
  }

  let next = {
    ...s,
    timeS: s.timeS + dt,
    progressM: d1,
    running: d1 < maxM,
    clearSeconds: s.clearSeconds + clearDt,
  };

  // Periodic automatic telemetry packet generation
  if (s.autoGenerate && Math.floor(next.timeS / 12) > Math.floor(s.timeS / 12)) {
    const types: DataType[] = ['health', 'navigation', 'science', 'image'];
    next = generateData(next, types[Math.floor(next.timeS / 12) % 4] ?? 'health', settings.capacityKB);
  }

  // Execute transmission proportional to clear-link time and handle interruptions
  let txQueue = next.queue;
  let txDelivered: DataItem[] = [];
  let txEvents: MissionEvent[] = [];
  let txRng = next.rngState;
  let interruptedKB = 0;

  if (blockedDt > 0 && clearDt === 0) {
    // Entire step blocked
    const tx = transmitStep(txQueue, 0, false, txRng, 0.08, next.timeS);
    txQueue = tx.queue;
    interruptedKB += tx.interruptedKB;
    txEvents.push(...tx.events.map(e => ({ ...e, time: next.timeS })));
    txRng = tx.rngState;
  } else if (clearDt > 0 && blockedDt === 0) {
    // Entire step clear
    const tx = transmitStep(txQueue, clearDt * settings.txRateKBps, true, txRng, 0.08, next.timeS);
    txQueue = tx.queue;
    txDelivered = tx.delivered;
    txEvents.push(...tx.events.map(e => ({ ...e, time: next.timeS })));
    txRng = tx.rngState;
  } else {
    // Both clear and blocked sub-intervals occurred in this step
    if (startClear && !endClear) {
      // Clear first, then blackout
      const tx1 = transmitStep(txQueue, clearDt * settings.txRateKBps, true, txRng, 0.08, next.timeS);
      const tx2 = transmitStep(tx1.queue, 0, false, tx1.rngState, 0.08, next.timeS);
      txQueue = tx2.queue;
      txDelivered = tx1.delivered;
      interruptedKB += tx2.interruptedKB;
      txEvents.push(...tx1.events.map(e => ({ ...e, time: next.timeS })));
      txEvents.push(...tx2.events.map(e => ({ ...e, time: next.timeS })));
      txRng = tx2.rngState;
    } else {
      // Blocked first (or crossed blackout), then restored
      const tx1 = transmitStep(txQueue, 0, false, txRng, 0.08, next.timeS);
      const tx2 = transmitStep(tx1.queue, clearDt * settings.txRateKBps, true, tx1.rngState, 0.08, next.timeS);
      txQueue = tx2.queue;
      txDelivered = tx2.delivered;
      interruptedKB += tx1.interruptedKB;
      txEvents.push(...tx1.events.map(e => ({ ...e, time: next.timeS })));
      txEvents.push(...tx2.events.map(e => ({ ...e, time: next.timeS })));
      txRng = tx2.rngState;
    }
  }

  // Combine and sort events
  const allEvents = [...transitionEvents, ...txEvents].sort((a, b) => a.time - b.time);
  if (!next.running && s.running) {
    allEvents.push({ time: next.timeS, level: 'success', msg: 'Destination reached · traverse complete' });
  }

  const restored = transitionEvents.some(e => e.msg.includes('restored'))
    ? true
    : transitionEvents.some(e => e.msg.includes('lost'))
    ? false
    : !endClear
    ? false
    : s.restored && endClear;

  const deliveredKB = next.deliveredKB + txDelivered.reduce((sum, item) => sum + item.sizeKB, 0);
  const wastedKB = (s.wastedKB ?? 0) + interruptedKB;

  return {
    ...next,
    restored,
    queue: txQueue,
    rngState: txRng,
    deliveredKB,
    wastedKB,
    deliveredCount: s.deliveredCount + txDelivered.length,
    events: [...next.events, ...allEvents].slice(-300),
    history: [
      ...next.history,
      {
        time: next.timeS,
        availability: next.timeS > 0 ? (100 * next.clearSeconds) / next.timeS : 100,
        bufferedKB: txQueue.reduce((sum, i) => sum + i.sizeKB, 0),
        deliveredKB,
        wastedKB,
      },
    ].slice(-600),
  };
}
