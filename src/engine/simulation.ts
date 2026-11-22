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
export interface HistorySample { time: number; availability: number; bufferedKB: number; deliveredKB: number }
export interface SimulationState {
  timeS: number; progressM: number; running: boolean; autoGenerate: boolean; queue: DataItem[];
  seq: number; rngState: number; generatedKB: number; deliveredKB: number; deliveredCount: number;
  clearSeconds: number; restored: boolean; events: MissionEvent[]; history: HistorySample[];
}
export function initialSimulation(): SimulationState {
  return { timeS: 0, progressM: 0, running: false, autoGenerate: true, queue: [], seq: 0,
    rngState: 2026, generatedKB: 0, deliveredKB: 0, deliveredCount: 0, clearSeconds: 0, restored: false,
    events: [{ time: 0, level: 'info', msg: 'Mission initialised · synthetic terrain loaded' }], history: [] };
}
export function generateData(s: SimulationState, type: DataType, capacityKB: number): SimulationState {
  const [rand, rngState] = nextRandom(s.rngState);
  const item = createItem(type, s.seq + 1, s.timeS, rand);
  if (!canStore(s.queue, item, capacityKB)) return { ...s, events: [...s.events, { time: s.timeS, level: 'warn', msg: `Storage full · ${item.id} not generated` }].slice(-300) };
  return { ...s, rngState, seq: s.seq + 1, queue: [...s.queue, item], generatedKB: s.generatedKB + item.sizeKB,
    events: [...s.events, { time: s.timeS, level: item.priority === 1 ? 'warn' : 'info', msg: `${item.id} queued · priority ${item.priority}` }].slice(-300) };
}
export function stepSimulation(s: SimulationState, terrain: Terrain, route: RouteSummary, settings: SimulationSettings, dt: number): SimulationState {
  if (!route.found || !route.safe || !route.metrics) return { ...s, running: false };
  const before = computeLOS(terrain, positionAt(route.points, s.progressM), settings.roverAntennaM, settings.endpoint, settings.endpointAntennaM).status === 'CLEAR';
  const progressM = Math.min(route.metrics.distanceM, s.progressM + dt * settings.roverSpeedMps);
  const clear = computeLOS(terrain, positionAt(route.points, progressM), settings.roverAntennaM, settings.endpoint, settings.endpointAntennaM).status === 'CLEAR';
  let next = { ...s, timeS: s.timeS + dt, progressM, running: progressM < route.metrics.distanceM, clearSeconds: s.clearSeconds + (clear ? dt : 0) };
  if (s.autoGenerate && Math.floor(next.timeS / 12) > Math.floor(s.timeS / 12)) {
    const types: DataType[] = ['health', 'navigation', 'science', 'image'];
    next = generateData(next, types[Math.floor(next.timeS / 12) % 4] ?? 'health', settings.capacityKB);
  }
  const tx = transmitStep(next.queue, dt * settings.txRateKBps, clear, next.rngState, 0.08, next.timeS);
  const events: MissionEvent[] = tx.events.map(e => ({ ...e, time: next.timeS }));
  if (before !== clear) events.push({ time: next.timeS, level: clear ? 'success' : 'warn', msg: clear ? 'Communication restored · data transmission resumed' : 'Communication lost · local data buffer active' });
  if (!next.running && s.running) events.push({ time: next.timeS, level: 'success', msg: 'Destination reached · traverse complete' });
  const deliveredKB = next.deliveredKB + tx.delivered.reduce((sum, item) => sum + item.sizeKB, 0);
  return { ...next, restored: before !== clear ? clear : s.restored, queue: tx.queue, rngState: tx.rngState,
    deliveredKB, deliveredCount: s.deliveredCount + tx.delivered.length,
    events: [...next.events, ...events].slice(-300), history: [...next.history, { time: next.timeS, availability: 100 * next.clearSeconds / next.timeS, bufferedKB: tx.queue.reduce((sum,i)=>sum+i.sizeKB,0), deliveredKB }].slice(-600) };
}
