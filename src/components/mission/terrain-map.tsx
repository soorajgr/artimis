import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Maximize, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMission } from '@/state/mission';
import { sampleElevation, toMetres, type Point, type Terrain } from '@/engine/terrain';

function makeBitmap(t:Terrain){
 const c=document.createElement('canvas');c.width=t.width;c.height=t.height;const ctx=c.getContext('2d');if(!ctx)return '';
 const styles=getComputedStyle(document.documentElement);const rgb=(token:string)=>{ctx.fillStyle=styles.getPropertyValue(token).trim();ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data;};
 const low=rgb('--map-low'),mid=rgb('--map-mid'),high=rgb('--map-high');const image=ctx.createImageData(t.width,t.height);
 for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){const e=sampleElevation(t,x,y);const f=(e-t.minElevM)/(t.maxElevM-t.minElevM||1);const a=f<.5?low:mid,b=f<.5?mid:high,u=f<.5?f*2:(f-.5)*2;const dx=sampleElevation(t,x+1,y)-sampleElevation(t,x-1,y),dy=sampleElevation(t,x,y+1)-sampleElevation(t,x,y-1);const shade=Math.max(.65,Math.min(1.35,1+(dx-dy)/60));const index=(y*t.width+x)*4;for(let k=0;k<3;k++)image.data[index+k]=Math.min(255,((a[k]??0)*(1-u)+(b[k]??0)*u)*shade);image.data[index+3]=255;}
 ctx.putImageData(image,0,0);return c.toDataURL();
}
function contours(t:Terrain){let path='';const sx=800/(t.width-1),sy=600/(t.height-1);for(let level=Math.ceil(t.minElevM/10)*10;level<=t.maxElevM;level+=10)for(let y=0;y<t.height-1;y+=1)for(let x=0;x<t.width-1;x+=1){const corners=[{x,y},{x:x+1,y},{x:x+1,y:y+1},{x,y:y+1}];const hits:Point[]=[];for(let k=0;k<4;k++){const a=corners[k],b=corners[(k+1)%4];if(!a||!b)continue;const za=sampleElevation(t,a.x,a.y),zb=sampleElevation(t,b.x,b.y);if((za<level)===(zb<level))continue;const f=(level-za)/(zb-za);hits.push({x:(a.x+(b.x-a.x)*f)*sx,y:(a.y+(b.y-a.y)*f)*sy});}for(let k=0;k+1<hits.length;k+=2){const a=hits[k],b=hits[k+1];if(a&&b)path+=`M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`;}}return path;}
export function TerrainMap({large=false,onPick}:{large?:boolean;onPick?:(p:Point)=>void}){
 const m=useMission();const [bitmap,setBitmap]=useState('');const [zoom,setZoom]=useState(1);const [pan,setPan]=useState({x:0,y:0});const [inspect,setInspect]=useState<Point|null>(null);const svg=useRef<SVGSVGElement>(null);const drag=useRef<{x:number;y:number;px:number;py:number;moved:boolean}|null>(null);
 useEffect(()=>{setBitmap(makeBitmap(m.terrain));setZoom(1);setPan({x:0,y:0});},[m.terrain]);
 const contour=useMemo(()=>contours(m.terrain),[m.terrain]);
 const xy=(p:Point)=>({x:p.x/(m.terrain.width-1)*800,y:p.y/(m.terrain.height-1)*600});
 const path=(points:Point[])=>points.map((p,i)=>{const v=xy(p);return`${i?'L':'M'}${v.x},${v.y}`;}).join(' ');
 const rover=xy(m.rover),endpoint=xy(m.settings.endpoint),destination=xy(m.settings.destination);
 const changeZoom=(factor:number)=>{setZoom(z=>Math.max(1,Math.min(5,z*factor)));};
 useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const rect=el.getBoundingClientRect();const px=(e.clientX-rect.left)/rect.width*800,py=(e.clientY-rect.top)/rect.height*600;setZoom(z=>{const next=Math.max(1,Math.min(5,z*(e.deltaY<0?1.15:1/1.15)));setPan(p=>({x:px-(px-p.x)*next/z,y:py-(py-p.y)*next/z}));return next;});};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const position=inspect?toMetres(m.terrain,inspect):toMetres(m.terrain,m.rover);
 return <><div className={`terrain-map ${large?'large':''}`}><svg ref={svg} viewBox="0 0 800 600" preserveAspectRatio="none" role="img" aria-label="Interactive lunar terrain map" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,moved:false};}} onPointerMove={e=>{const d=drag.current;if(!d)return;const rect=e.currentTarget.getBoundingClientRect();if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>4)d.moved=true;if(d.moved)setPan({x:d.px+(e.clientX-d.x)*800/rect.width,y:d.py+(e.clientY-d.y)*600/rect.height});}} onPointerUp={e=>{const d=drag.current;drag.current=null;if(d?.moved)return;const rect=e.currentTarget.getBoundingClientRect();const x=((e.clientX-rect.left)/rect.width*800-pan.x)/zoom/800*(m.terrain.width-1),y=((e.clientY-rect.top)/rect.height*600-pan.y)/zoom/600*(m.terrain.height-1);const point={x:Math.max(0,Math.min(m.terrain.width-1,Math.round(x))),y:Math.max(0,Math.min(m.terrain.height-1,Math.round(y)))};setInspect(point);onPick?.(point);}}>
 <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
 {bitmap&&<image href={bitmap} width="800" height="600" preserveAspectRatio="none"/>}<path d={contour} className="map-contour"/>
 {Array.from({length:9},(_,i)=><g key={i} className="map-grid"><path d={`M${i*100},0V600M0,${i*75}H800`}/></g>)}
 {m.terrain.source==='synthetic'&&<g><text x="440" y="305" className="map-label">CRATER RIM</text><text x="430" y="332" className="map-label">+80 M</text><text x="70" y="465" className="map-label" transform="rotate(-60 70 465)">ELEVATED RIDGE</text><text x="360" y="65" className="map-label">NORTHERN PLAIN</text></g>}
 <path d={path(m.routes.B.points)} className="map-route-b"/><path d={path(m.routes.A.points)} className="map-route-a"/>
 {m.route.prediction?.blackouts.map(b=><path key={b.index} d={path(m.route.points.filter(p=>p.d>=b.startM&&p.d<=b.endM))} className="map-blackout"/>)}
 <path d={`M${rover.x},${rover.y}L${endpoint.x},${endpoint.y}`} className={`map-los ${m.los.status==='BLOCKED'?'blocked':''}`}/>
 <g transform={`translate(${destination.x} ${destination.y})`}><circle r="7" className="map-destination"/><path d="M-12 0H12M0 -12V12" className="map-destination"/><text x="15" y="4" className="map-label">DESTINATION</text></g>
 <g transform={`translate(${endpoint.x} ${endpoint.y})`}><path d="M0 -8L8 7H-8Z" className="map-endpoint"/><text x="-65" y="-16" className="map-label">RELAY 01</text></g>
 <g transform={`translate(${rover.x} ${rover.y})`}><circle r="17" fill="none" stroke="var(--primary)" strokeOpacity=".25"/><rect x="-5" y="-5" width="10" height="10" rx="2" className="map-rover"/><text x="14" y="4" className="map-label">ROVER 01</text></g>
 {inspect&&<circle cx={xy(inspect).x} cy={xy(inspect).y} r="6" fill="none" stroke="var(--warning)"/>}
 </g></svg><div className="map-toolbar"><Button variant="secondary" size="icon" title="Zoom in" aria-label="Zoom in" onClick={()=>changeZoom(1.3)}><Plus/></Button><Button variant="secondary" size="icon" title="Zoom out" aria-label="Zoom out" onClick={()=>changeZoom(1/1.3)}><Minus/></Button><Button variant="secondary" size="icon" title="Reset map view" aria-label="Reset map view" onClick={()=>{setZoom(1);setPan({x:0,y:0});}}><Maximize/></Button><span className="text-muted-foreground p-2"><Move size={15}/></span></div>
 <div className="map-coordinate">X {position.x.toFixed(0)} M · Y {position.y.toFixed(0)} M {inspect?`· ELEV ${sampleElevation(m.terrain,inspect.x,inspect.y).toFixed(1)} M`:''}</div></div>
 <div className="map-legend"><span className="flex items-center gap-2"><i className="legend-ramp"/>{m.terrain.minElevM.toFixed(0)} – {m.terrain.maxElevM.toFixed(0)} m</span><span className="text-primary">— Route A</span><span className="text-route-b">┄ Route B</span><span className="text-destructive">— Blackout zone</span><span className="ml-auto">{m.terrain.resolutionM} M / CELL</span></div></>;
}
