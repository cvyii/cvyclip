import {readdir,readFile,stat,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {projectKey} from './projects.mjs';

export async function cleanupTemporaryFiles({config,store}){
  const root=resolve(config.dataDir,'tmp');let entries;
  try{entries=await readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const entry of entries){
    if(!entry.isDirectory()||!/^(job|upload)-[A-Za-z0-9-]+$/.test(entry.name))continue;
    const directory=resolve(root,entry.name);if(!directory.startsWith(root+sep))continue;
    try{
      if((await stat(directory)).mtimeMs>Date.now()-3600000)continue;
      let owner;try{owner=JSON.parse(await readFile(join(directory,'owner.json'),'utf8'));}catch{}
      if(owner?.projectId&&owner?.jobId&&owner?.owner){
        let project;try{project=await store.readJson(projectKey(owner.projectId));}catch{continue;}
        const lease=await store.readJson('jobs/worker.json');
        if(project?.job?.id===owner.jobId&&project.job.state==='running'&&project.job.owner===owner.owner&&lease?.owner===owner.owner&&lease.expires>Date.now())continue;
      }
      await rm(directory,{recursive:true,force:true});
    }catch(e){if(e.code!=='ENOENT')throw e;}
  }
}
