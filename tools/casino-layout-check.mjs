// Measured design-only layout validation against actual shell and retained fixtures.
import fs from 'node:fs';import * as M from '../src/map.js';
const draft=JSON.parse(fs.readFileSync('design/casino-layout-v1.json')),out=process.argv.find(a=>a.endsWith('.json'))||'design/casino-layout-audit.json';
const rect=r=>({x:r.x,z:r.z??r.y/60,w:r.w,d:r.d??r.h/60});
const scaled=r=>({x:r.x/60,z:r.y/60,w:r.w/60,d:r.h/60});
const walls=M.WALLS.map((r,i)=>({...scaled(r),id:`wall-${i}`}));
const retained=M.OBSTACLES.filter(r=>draft.reservedKinds.includes(r.kind)).map((r,i)=>({...scaled(r),id:`retained-${r.kind}-${i}`,kind:r.kind}));
const plants=M.PLANTS.map(([x,y],i)=>{const p=draft.plantMoves?.[i]||[x/60,y/60];return {x:p[0]-.24,z:p[1]-.24,w:.48,d:.48,id:`plant-${i}`};});
const fixed=[...retained,...plants,...draft.fixtures];
const gameSolids=draft.objects.flatMap(o=>(o.solids||[o]).map((r,i)=>({...rect(r),id:`${o.id}-${i}`,owner:o.id})));
const obstacles=[...walls,...fixed,...gameSolids],overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.015&&Math.min(a.z+a.d,b.z+b.d)-Math.max(a.z,b.z)>.015;
const issues=[];
for(let i=0;i<fixed.length;i++)for(const b of fixed.slice(i+1))if(overlap(fixed[i],b))issues.push({kind:'retained-overlap',a:fixed[i].id,b:b.id});
for(let i=0;i<gameSolids.length;i++)for(const b of [...fixed,...walls,...gameSolids.slice(i+1)]){const a=gameSolids[i];if(a.owner!==b.owner&&overlap(a,b))issues.push({kind:'solid-overlap',a:a.id,b:b.id});}
const circleHit=(x,z,r,b)=>Math.hypot(Math.max(b.x-x,0,x-b.x-b.w),Math.max(b.z-z,0,z-b.z-b.d))<r-1e-5;
const seats=draft.objects.flatMap(o=>(o.seats||[]).map((s,i)=>({...s,id:`${o.id}-player-${i}`,owner:o.id})));
for(const s of seats)for(const b of obstacles){if(!(s.owner.startsWith('bj-')&&b.owner===s.owner)&&circleHit(s.x,s.z,.3,b))issues.push({kind:'player-obstructed',a:s.id,b:b.id});if(circleHit(...s.approach,.3,b))issues.push({kind:'approach-obstructed',a:s.id,b:b.id});}
for(let i=0;i<seats.length;i++)for(const b of seats.slice(i+1))if(Math.hypot(seats[i].x-b.x,seats[i].z-b.z)<.6)issues.push({kind:'occupied-players-overlap',a:seats[i].id,b:b.id});
for(const a of draft.aisles)for(const s of seats)if(circleHit(s.x,s.z,.3,a))issues.push({kind:'occupied-player-in-main-aisle',a:s.id,b:a.label});
for(const o of draft.objects)for(const bay of o.bays||[])for(const b of obstacles)if(b.owner!==o.id&&overlap(bay,b))issues.push({kind:'bay-obstructed',a:o.id,b:b.id});
for(const a of draft.aisles)for(const b of obstacles)if(overlap(a,b))issues.push({kind:'aisle-obstructed',a:a.label,b:b.id});
// Body-radius grid reachability through every actual door. Aisles are wider design reservations;
// this independently tests continuous reachable routes to every player approach and staff exit.
const step=.1,nx=Math.ceil(50/step),nz=Math.ceil(31.667/step),free=new Uint8Array(nx*nz),seen=new Uint8Array(nx*nz),idx=(x,z)=>Math.floor(z/step)*nx+Math.floor(x/step);
for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const px=(x+.5)*step,pz=(z+.5)*step;free[z*nx+x]=!obstacles.some(o=>circleHit(px,pz,.31,o));}
const seed=idx(22,7.5),queue=[seed];seen[seed]=1;
for(let q=0;q<queue.length;q++){const k=queue[q],x=k%nx,z=Math.floor(k/nx);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz,n=zz*nx+xx;if(xx>=0&&xx<nx&&zz>=0&&zz<nz&&free[n]&&!seen[n]){seen[n]=1;queue.push(n);}}}
const points=[...seats.map(s=>({id:s.id,x:s.approach[0],z:s.approach[1]})),...M.DOORS.flatMap((d,i)=>[d.pa,d.pb].map((p,j)=>({id:`door-${i}-${j}`,x:p.x/60,z:p.y/60}))),...M.STAFF_DOORS.map(d=>({id:`staff-${d.id}`,x:d.sx/60,z:d.sy/60})),{id:'security-use',x:(M.SECURITY.x+M.SECURITY.w+38)/60,z:(M.SECURITY.y+M.SECURITY.h/2)/60}];
for(const p of points)if(!seen[idx(p.x,p.z)])issues.push({kind:'unreachable',a:p.id,point:[p.x,p.z]});
const report={at:new Date().toISOString(),status:issues.length?'needs placement refinement':'full proposed design clearances pass; see arcade-route-check for the partly implemented production map',objects:draft.objects.length,seats:seats.length,retained:retained.length,plants:plants.length,doors:M.DOORS.length,staffExits:M.STAFF_DOORS.length,notes:draft.validationNotes,grid:{metres:step,reachableCells:queue.length},issues};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(issues.length)process.exitCode=1;
