import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore} from '../studio/storage.mjs';
import {createProjects,projectKey} from '../studio/projects.mjs';
import {createJobs} from '../studio/jobs.mjs';

async function fixture(t,options={}){
  const root=await mkdtemp(join(tmpdir(),'cvy-jobs-'));const store=await createStore({dataDir:join(root,'data')});
  const config={dataDir:join(root,'data'),retentionDays:7,dailyAnalysisSeconds:30,openaiApiKey:'test-key',...options.config};
  const projects=createProjects(store,config),source=join(root,'source.mp4');await writeFile(source,'video fixture');
  const media={extractAudio:async(_input,output)=>writeFile(output,'audio'),renderClip:async({output,onProgress})=>{onProgress?.(.5);await writeFile(output,'real-export-fixture');}};
  const ai=options.ai||{transcribeAudio:async()=>({text:'One complete story.',language:'english',cues:[{start:0,end:10,text:'One complete story.'}],words:[]}),suggestClips:async()=>[{start:0,end:10,title:'One complete idea',rationale:'A complete idea.'}]};
  let jobs=await createJobs({store,media,ai,config});
  t.after(async()=>{await jobs.shutdown();await rm(root,{recursive:true,force:true});});
  const makeProject=async(duration=10)=>projects.create({originalName:'source.mp4',sourcePath:source,sizeBytes:13,extension:'.mp4',media:{duration,width:640,height:360,hasAudio:true}});
  async function settle(id){for(let i=0;i<300;i++){const p=await projects.get(id);if(p.job&&['ready','failed'].includes(p.job.state))return p;await new Promise(r=>setTimeout(r,10));}throw new Error('Job did not finish.');}
  return {store,config,projects,makeProject,settle,get jobs(){return jobs;},async restart(){await jobs.shutdown();jobs=await createJobs({store,media,ai,config});await jobs.recover();return jobs;}};
}
test('duplicate analysis requests share a job and reserve source minutes once',async t=>{
  const f=await fixture(t);const p=await f.makeProject();const [a,b]=await Promise.all([f.jobs.enqueueAnalysis(p.id),f.jobs.enqueueAnalysis(p.id)]);assert.equal(a.job.id,b.job.id);
  const done=await f.settle(p.id);assert.equal(done.status,'ready');assert.equal(done.suggestions[0].title,'One complete idea');assert.equal((await f.jobs.usage()).usedSeconds,10);
  const again=await f.jobs.enqueueAnalysis(p.id);assert.equal(again.job.id,done.job.id);assert.equal((await f.jobs.usage()).usedSeconds,10);
});
test('daily analysis limits survive restart and block excess work before provider use',async t=>{
  const f=await fixture(t);const one=await f.makeProject(20);await f.jobs.enqueueAnalysis(one.id);await f.settle(one.id);await f.restart();
  const two=await f.makeProject(20);await f.jobs.enqueueAnalysis(two.id);const denied=await f.settle(two.id);assert.equal(denied.job.state,'failed');assert.equal(denied.job.error.code,'daily_limit');assert.equal(denied.transcript,undefined);assert.equal((await f.jobs.usage()).usedSeconds,20);
});
test('failed highlights retain the transcript and explicit retry does not retranscribe',async t=>{
  let first=true;const ai={transcribeAudio:async()=>{if(!first)throw new Error('Paid audio call repeated');return {text:'Story',language:'en',cues:[{start:0,end:10,text:'Story'}]};},suggestClips:async()=>{if(first){first=false;throw new Error('temporary remote failure');}return [{start:0,end:10,title:'Recovered',rationale:'A whole story.'}];}};
  const f=await fixture(t,{ai}),p=await f.makeProject();await f.jobs.enqueueAnalysis(p.id);const failed=await f.settle(p.id);assert.equal(failed.job.state,'failed');assert.equal(failed.cues[0].text,'Story');
  await assert.rejects(f.jobs.enqueueAnalysis(p.id),e=>e.status===409);
  await f.jobs.enqueueAnalysis(p.id,{retry:true});const done=await f.settle(p.id);assert.equal(done.job.state,'ready');assert.equal(done.suggestions[0].title,'Recovered');assert.equal((await f.jobs.usage()).usedSeconds,10);
});
test('stale in-flight provider jobs become retryable failures rather than replaying paid requests',async t=>{
  const f=await fixture(t),p=await f.makeProject();await f.store.updateJson(projectKey(p.id),v=>({...v,job:{id:'interrupted',type:'analysis',state:'running',providerInFlight:true,heartbeat:'2000-01-01T00:00:00Z'}}));
  await f.jobs.recover();const recovered=await f.projects.get(p.id);assert.equal(recovered.job.state,'failed');assert.equal(recovered.job.error.code,'interrupted');assert.equal((await f.jobs.usage()).usedSeconds,0);
});
test('manual export persists a downloadable artifact without consuming AI allowance',async t=>{
  const f=await fixture(t),p=await f.makeProject();await f.jobs.enqueueExport(p.id,{...p.clip,ratio:'1:1'});const done=await f.settle(p.id);assert.equal(done.job.state,'ready');assert.equal(done.exports.length,1);assert.equal(done.exports[0].ratio,'1:1');assert.equal((await f.store.stat(done.exports[0].key)).size,19);assert.equal((await f.jobs.usage()).usedSeconds,0);
});
