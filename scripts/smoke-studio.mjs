import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {probeMedia} from '../studio/media.mjs';
const base=new URL(process.env.STUDIO_SMOKE_URL||'http://127.0.0.1:8090');
if(!['127.0.0.1','localhost'].includes(base.hostname))throw new Error('The container smoke test only targets localhost.');
const password=process.env.STUDIO_SMOKE_PASSWORD||'workflow-test-password';
let cookie='',csrf='';
async function request(path,options={}){
  const response=await fetch(new URL(path,base),{...options,headers:{Origin:base.origin,Cookie:cookie,'x-csrf-token':csrf,...options.headers}});
  assert.ok(response.ok,`HTTP ${response.status} at ${path}`);return response;
}
for(let i=0;;i++){
  try{assert.ok((await fetch(new URL('/healthz',base))).ok);break;}catch(e){if(i>=60)throw e;await new Promise(r=>setTimeout(r,1000));}
}
const login=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
cookie=login.headers.getSetCookie()[0].split(';')[0];csrf=(await login.json()).csrfToken;
const form=new FormData();form.append('video',new Blob([await readFile('.test-tmp/sample-video.mp4')],{type:'video/mp4'}),'ci-synthetic-video.mp4');
let project=await(await request('/api/projects',{method:'POST',body:form})).json();
const endpoint='/api/projects/'+project.id;
const cues=[{start:1.5,end:5.5,text:'A complete story. سڵاو'}];
project=await(await request(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({cues,clip:{...project.clip,start:1,end:6,ratio:'9:16'}})})).json();
assert.deepEqual((await(await request(endpoint)).json()).cues,cues);
await request(endpoint+'/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clip:project.clip})});
for(let i=0;;i++){
  project=await(await request(endpoint)).json();
  assert.notEqual(project.job.state,'failed',JSON.stringify(project.job.error));
  if(project.job.state==='ready')break;
  assert.ok(i<300,'Export did not finish within the smoke-test deadline.');await new Promise(r=>setTimeout(r,1000));
}
const output=resolve('.test-tmp/container-smoke.mp4');await mkdir('.test-tmp',{recursive:true});
await writeFile(output,Buffer.from(await(await request(endpoint+'/exports/'+project.exports[0].id+'?download=1')).arrayBuffer()));
const info=await probeMedia(output);assert.equal(info.width,1080);assert.equal(info.height,1920);assert.equal(info.hasAudio,true);assert.equal(info.codec,'h264');assert.ok(Math.abs(info.duration-5)<.25);
const srt=await(await request(endpoint+'/subtitles')).text();assert.ok(srt.includes('00:00:00,500 --> 00:00:04,500'));assert.ok(srt.includes('سڵاو'));
await request(endpoint,{method:'DELETE'});
console.log('PASS: running container login → upload → save captions/trim → render → download → H.264/audio/SRT verification.');
