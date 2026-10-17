import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import https from 'node:https';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const preview='https://10.42.0.37:3161/',out=process.argv[2]||'docs/playtest-build-2026-10-17.json';
const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(p=>/^(src|assets|vendor)\//.test(p)||['index.html','style.css','audio-review.html'].includes(p)).sort();
assert.ok(paths.includes('src/arcade.js')&&paths.includes('src/3d/arcade.js')&&paths.includes('src/3d/mirror.js'),'all current runtime modules must be tracked');
const agent=new https.Agent({rejectUnauthorized:false,keepAlive:true}),hash=b=>crypto.createHash('sha256').update(b).digest('hex');let next=0;const files=[];
try{
 await Promise.all(Array.from({length:4},async()=>{while(next<paths.length){const path=paths[next++],local=fs.readFileSync(path),bytes=await new Promise((resolve,reject)=>{https.get(new URL(path,preview),{agent},r=>{if(r.statusCode!==200){r.resume();reject(Error(path+': HTTP '+r.statusCode));return;}const chunks=[];r.on('data',b=>chunks.push(b));r.on('end',()=>resolve(Buffer.concat(chunks)));r.on('error',reject);}).on('error',reject);});assert.equal(hash(bytes),hash(local),path+' served bytes differ');files.push({path,bytes:bytes.length,sha256:hash(local)});}}));
 files.sort((a,b)=>a.path.localeCompare(b.path));fs.writeFileSync(out,JSON.stringify({checkedAt:new Date().toISOString(),preview,scope:'Every Git-tracked file in src/, assets/ and vendor/, plus index.html, style.css and audio-review.html. Includes mirror and both new arcade modules.',matched:files.length,files},null,2)+'\n');console.log('PASS: all '+files.length+' source/vendor/asset/entry files match served SHA-256 bytes.');
}finally{agent.destroy();}
