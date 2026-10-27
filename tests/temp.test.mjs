import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,utimes,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore} from '../studio/storage.mjs';
import {cleanupTemporaryFiles} from '../studio/temp.mjs';
test('recovery cleans old abandoned files while preserving recent uploads and live leased work',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cvy-temp-'));t.after(()=>rm(root,{recursive:true,force:true}));const config={dataDir:root},store=await createStore(config),old=new Date(Date.now()-7200000);
  for(const name of ['job-abandoned','upload-abandoned','upload-recent','job-live']){const dir=join(root,'tmp',name);await mkdir(dir,{recursive:true});await writeFile(join(dir,'source.mp4'),'media');if(name==='job-live')await writeFile(join(dir,'owner.json'),JSON.stringify({owner:'active-worker',projectId:'00000000-0000-0000-0000-000000000001',jobId:'live'}));if(name!=='upload-recent')await utimes(dir,old,old);}
  await store.writeJson('jobs/worker.json',{owner:'active-worker',expires:Date.now()+60000});await store.writeJson('projects/00000000-0000-0000-0000-000000000001/project.json',{job:{id:'live',state:'running',owner:'active-worker'}});
  await cleanupTemporaryFiles({config,store});
  for(const name of ['job-abandoned','upload-abandoned'])await assert.rejects(stat(join(root,'tmp',name)),e=>e.code==='ENOENT');
  for(const name of ['upload-recent','job-live'])assert.ok((await stat(join(root,'tmp',name))).isDirectory());
});
