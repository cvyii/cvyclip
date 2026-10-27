import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore} from '../studio/storage.mjs';

test('local storage persists metadata and files across instances',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cvy-store-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=await createStore({dataDir:join(root,'data')});
  await store.writeJson('projects/one/project.json',{name:'My video'});
  const fixture=join(root,'source.txt');await writeFile(fixture,'real media bytes');
  await store.putFile('projects/one/source.mp4',fixture,'video/mp4');
  const reopened=await createStore({dataDir:join(root,'data')});
  assert.deepEqual(await reopened.readJson('projects/one/project.json'),{name:'My video'});
  assert.equal((await reopened.stat('projects/one/source.mp4')).size,16);
  assert.deepEqual((await reopened.list('projects/')).sort(),['projects/one/project.json','projects/one/source.mp4']);
  const out=join(root,'download.txt');await reopened.getFile('projects/one/source.mp4',out);
  assert.equal(await readFile(out,'utf8'),'real media bytes');
});
test('metadata updates are atomic under concurrency',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cvy-ledger-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=await createStore({dataDir:root});
  await Promise.all(Array.from({length:25},()=>store.updateJson('usage/day.json',v=>({count:(v?.count||0)+1}))));
  assert.equal((await store.readJson('usage/day.json')).count,25);
});
test('storage refuses traversal and deleting a project leaves other projects intact',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cvy-safe-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=await createStore({dataDir:root});
  for(const key of ['../outside','/absolute','a/../../bad','a\\..\\bad'])await assert.rejects(store.readJson(key));
  await store.writeJson('projects/one/project.json',{name:'one'});await store.writeJson('projects/two/project.json',{name:'two'});
  await store.remove('projects/one/');assert.equal(await store.readJson('projects/one/project.json'),null);
  assert.equal((await store.readJson('projects/two/project.json')).name,'two');
});
