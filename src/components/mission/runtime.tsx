import { useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { useMissionStore } from '@/state/mission';
import { buildRoute } from '@/engine/routes';
import type { SimulationSettings, SimulationState } from '@/engine/simulation';
import type { Terrain } from '@/engine/terrain';
import type { RouteId } from '@/engine/routes';
interface Snapshot {version:1;terrain:Terrain;settings:SimulationSettings;sim:SimulationState;selected:RouteId}
export function MissionRuntime(){
 useEffect(()=>{let active=true;let unsubscribe=()=>{};let pending=Promise.resolve();
 get<Snapshot>('artemis-mission-v1').then(data=>{if(!active)return;if(data?.version===1){const {terrain,settings,selected,sim}=data;useMissionStore.setState({terrain,settings,selected,sim:{...sim,running:false},routes:{A:buildRoute(terrain,'A',settings),B:buildRoute(terrain,'B',settings)}});}useMissionStore.setState({hydrated:true});
 unsubscribe=useMissionStore.subscribe(s=>{const snapshot:Snapshot={version:1,terrain:s.terrain,settings:s.settings,sim:s.sim,selected:s.selected};pending=pending.then(()=>set('artemis-mission-v1',snapshot)).catch(()=>{console.warn('Local mission persistence unavailable');});});
 }).catch(()=>{if(active)useMissionStore.setState({hydrated:true});});
 const timer=window.setInterval(()=>{const s=useMissionStore.getState();s.tick(s.settings.simSpeed*.25);},250);
 return ()=>{active=false;unsubscribe();window.clearInterval(timer);};},[]);
 return null;
}
