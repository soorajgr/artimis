import { create } from 'zustand';
import { useMemo } from 'react';
import { generateSyntheticTerrain, type Terrain, type Point } from '@/engine/terrain';
import { buildRoute, recommendRoute, type RouteId, type RouteSummary } from '@/engine/routes';
import { computeLOS } from '@/engine/los';
import { nextBlackout, positionAt } from '@/engine/prediction';
import { generateData, initialSimulation, stepSimulation, type SimulationSettings, type SimulationState } from '@/engine/simulation';
import type { DataType } from '@/engine/queue';

export const defaultSettings: SimulationSettings = { start: {x:30,y:10}, destination:{x:30,y:72}, endpoint:{x:72,y:40}, roverAntennaM:2, endpointAntennaM:10, roverSpeedMps:0.5, maxSlopeDeg:20, commPenalty:3, warningS:180, txRateKBps:32, capacityKB:32768, simSpeed:20 };
const terrain = generateSyntheticTerrain();
const makeRoutes = (t: Terrain, s: SimulationSettings) => ({ A: buildRoute(t,'A',s), B: buildRoute(t,'B',s) });
export type DemoId = 'normal' | 'approaching' | 'blackout' | 'restoration';
export function demoState(id: DemoId, t: Terrain, settings: SimulationSettings): { sim: SimulationState; selected: RouteId; routes: Record<RouteId,RouteSummary> } {
  const routes = makeRoutes(t,settings);
  const selected = id === 'normal' ? 'B' : 'A';
  const b = routes.A.prediction?.blackouts[0];
  let sim = initialSimulation();
  if (b) sim.progressM = id === 'approaching' ? Math.max(0,b.startM - settings.roverSpeedMps * 60) : id === 'blackout' ? (b.startM + b.endM)/2 : id === 'restoration' ? Math.min(routes.A.metrics?.distanceM ?? b.endM,b.endM+2) : 0;
  if (id === 'blackout' || id === 'restoration') for (const type of ['image','science','navigation','health','emergency'] as const) sim = generateData(sim,type,settings.capacityKB);
  sim.restored = id === 'restoration';
  sim.events.push({time:0,level:'info',msg:`Demo loaded · ${id} · seed 2026`});
  return {sim,selected,routes};
}
interface MissionStore {
 terrain: Terrain; settings: SimulationSettings; routes: Record<RouteId,RouteSummary>; selected: RouteId; sim: SimulationState; hydrated: boolean;
 setSettings: (patch: Partial<SimulationSettings>)=>void; setTerrain:(t:Terrain)=>void; select:(id:RouteId)=>void;
 toggle:()=>void; reset:()=>void; tick:(dt:number)=>void; generate:(type:DataType)=>void; setAuto:(auto:boolean)=>void; demo:(id:DemoId)=>void;
}
export const useMissionStore = create<MissionStore>((set,get)=>({
 terrain,settings:defaultSettings,routes:makeRoutes(terrain,defaultSettings),selected:'A',sim:initialSimulation(),hydrated:false,
 setSettings:patch=>set(s=>{ const settings={...s.settings,...patch}; return {settings,routes:makeRoutes(s.terrain,settings),sim:{...s.sim,progressM:0,running:false,restored:false}}; }),
 setTerrain:terrain=>set(s=>{const point=(x:number,y:number):Point=>({x:Math.round((terrain.width-1)*x),y:Math.round((terrain.height-1)*y)}); const settings={...s.settings,start:point(.38,.13),destination:point(.38,.91),endpoint:point(.91,.5)};return {terrain,settings,routes:makeRoutes(terrain,settings),sim:{...s.sim,progressM:0,running:false,restored:false}};}),
 select:selected=>set(s=>({selected,sim:{...s.sim,progressM:0,running:false,restored:false}})),
 toggle:()=>set(s=>({sim:{...s.sim,running:!s.sim.running,events:[...s.sim.events,{time:s.sim.timeS,level:'info',msg:s.sim.running?'Simulation paused':'Simulation started'}]}})),
 reset:()=>set({sim:initialSimulation()}),
 tick:dt=>{const s=get();if(s.sim.running&&s.hydrated)set({sim:stepSimulation(s.sim,s.terrain,s.routes[s.selected],s.settings,dt)});},
 generate:type=>set(s=>({sim:generateData(s.sim,type,s.settings.capacityKB)})),
 setAuto:autoGenerate=>set(s=>({sim:{...s.sim,autoGenerate}})),
 demo:id=>{const data=demoState(id,terrain,defaultSettings);set({terrain,settings:defaultSettings,...data});},
}));
export function useMission() {
 const s=useMissionStore();
 return useMemo(()=>{const route=s.routes[s.selected];const rover=positionAt(route.points,s.sim.progressM);const los=computeLOS(s.terrain,rover,s.settings.roverAntennaM,s.settings.endpoint,s.settings.endpointAntennaM);const blackout=nextBlackout(route.prediction,s.sim.progressM);const untilM=blackout?Math.max(0,blackout.startM-s.sim.progressM):null;const untilS=untilM===null?null:untilM/s.settings.roverSpeedMps;return {...s,route,rover,los,blackout,untilM,untilS,recommendation:recommendRoute(Object.values(s.routes)),warning:los.status==='CLEAR'&&untilS!==null&&untilS<=s.settings.warningS};},[s]);
}
