export const distance = (m: number) => m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
export const duration = (s: number | null) => s === null ? '—' : !Number.isFinite(s) ? '∞' : s < 60 ? `${s.toFixed(0)}s` : `${Math.floor(s/60)}m ${Math.floor(s%60).toString().padStart(2,'0')}s`;
export const bytes = (kb:number) => kb>=1024?`${(kb/1024).toFixed(2)} MB`:`${kb.toFixed(0)} KB`;
export const clock = (s:number) => `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor(s/60%60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
export function pageHead(name:string,description:string){ return {meta:[{title:`${name} | ARTEMIS`},{name:'description',content:description},{property:'og:title',content:`${name} | ARTEMIS`},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}; }
