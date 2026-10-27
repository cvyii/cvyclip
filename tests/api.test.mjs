import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../studio/server.mjs';
import {createStore} from '../studio/storage.mjs';

async function setup(t,overrides={}){
  const root=await mkdtemp(join(tmpdir(),'cvy-api-'));const store=await createStore({dataDir:root});
  const config={workspacePassword:'test-workspace-secret',openaiApiKey:'test-only-provider-key',maxUploadBytes:1024,maxDuration:1200,retentionDays:7,sessionHours:12,secureCookies:false,dailyAnalysisSeconds:1200,...overrides};
  const media={probeMedia:async()=>({duration:15,width:1920,height:1080,fps:30,hasAudio:true})};
  const app=createApp({config,store,media});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
  async function login(password=config.workspacePassword){const res=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password})});return {res,cookie:res.headers.get('set-cookie')?.split(';')[0],body:await res.json()};}
  return {store,base,config,login};
}
test('project and source routes require an authenticated workspace',async t=>{
  const {base}=await setup(t);
  for(const path of ['/api/projects','/api/projects/00000000-0000-4000-8000-000000000000/source'])assert.equal((await fetch(base+path)).status,401);
  const session=await (await fetch(base+'/api/session')).json();assert.equal(session.signedIn,false);assert.ok(!JSON.stringify(session).includes('test-only-provider-key'));
});
test('login sets HttpOnly session and mutations reject a missing CSRF token or foreign origin',async t=>{
  const {base,login}=await setup(t);const auth=await login();assert.equal(auth.res.status,200);assert.match(auth.res.headers.get('set-cookie'),/HttpOnly/);assert.ok(auth.body.csrfToken);
  const missing=await fetch(base+'/api/logout',{method:'POST',headers:{Origin:base,Cookie:auth.cookie}});assert.equal(missing.status,403);
  const foreign=await fetch(base+'/api/logout',{method:'POST',headers:{Origin:'https://evil.example',Cookie:auth.cookie,'X-CSRF-Token':auth.body.csrfToken}});assert.equal(foreign.status,403);
  const logout=await fetch(base+'/api/logout',{method:'POST',headers:{Origin:base,Cookie:auth.cookie,'X-CSRF-Token':auth.body.csrfToken}});assert.equal(logout.status,200);
  assert.equal((await fetch(base+'/api/projects',{headers:{Cookie:auth.cookie}})).status,401);
});
test('password guessing is throttled without exposing configuration',async t=>{
  const {login}=await setup(t);for(let i=0;i<10;i++)assert.equal((await login('wrong password')).res.status,401);
  assert.equal((await login('wrong password')).res.status,429);
});
test('upload validates size and file type, then exposes persisted media with range support',async t=>{
  const {base,login}=await setup(t);const auth=await login();const headers={Origin:base,Cookie:auth.cookie,'X-CSRF-Token':auth.body.csrfToken};
  const large=new FormData();large.append('video',new Blob([Buffer.alloc(1025)]),'large.mp4');assert.equal((await fetch(base+'/api/projects',{method:'POST',headers,body:large})).status,413);
  const bad=new FormData();bad.append('video',new Blob(['text']),'bad.html');assert.equal((await fetch(base+'/api/projects',{method:'POST',headers,body:bad})).status,400);
  const form=new FormData();form.append('video',new Blob(['0123456789'],{type:'video/mp4'}),'my video.mp4');const response=await fetch(base+'/api/projects',{method:'POST',headers,body:form});assert.equal(response.status,201);const project=await response.json();assert.equal(project.name,'my video');
  const media=await fetch(`${base}/api/projects/${project.id}/source`,{headers:{Cookie:auth.cookie,Range:'bytes=2-5'}});assert.equal(media.status,206);assert.equal(await media.text(),'2345');assert.equal(media.headers.get('content-range'),'bytes 2-5/10');
  const list=await (await fetch(base+'/api/projects',{headers:{Cookie:auth.cookie}})).json();assert.equal(list.projects.length,1);
  const invalidRange=await fetch(`${base}/api/projects/${project.id}/source`,{headers:{Cookie:auth.cookie,Range:'bytes=100-200'}});assert.equal(invalidRange.status,416);
  const remove=await fetch(`${base}/api/projects/${project.id}`,{method:'DELETE',headers});assert.equal(remove.status,200);
  assert.equal((await fetch(`${base}/api/projects/${project.id}`,{headers:{Cookie:auth.cookie}})).status,404);
});
test('expired projects are removed and upload metadata cannot expose arbitrary paths',async t=>{
  const {base,login,store}=await setup(t);const auth=await login();
  await store.writeJson('projects/00000000-0000-4000-8000-000000000000/project.json',{id:'00000000-0000-4000-8000-000000000000',name:'expired',expiresAt:'2000-01-01T00:00:00Z'});
  const list=await (await fetch(base+'/api/projects',{headers:{Cookie:auth.cookie}})).json();assert.equal(list.projects.length,0);
  assert.equal(await store.readJson('projects/00000000-0000-4000-8000-000000000000/project.json'),null);
  const res=await fetch(base+'/api/projects/not-a-valid-id',{headers:{Cookie:auth.cookie}});assert.equal(res.status,400);
});
