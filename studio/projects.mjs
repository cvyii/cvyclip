import {randomUUID} from 'node:crypto';
import {AppError,normalizeCues,validateClip} from './domain.mjs';

export function projectId(id){if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id||''))throw new AppError('Invalid project identifier.');return id;}
export const projectKey=id=>`projects/${projectId(id)}/project.json`;
export function createProjects(store,config){
  async function get(id){const project=await store.readJson(projectKey(id));if(!project)throw new AppError('This project was not found.',404,'not_found');if(new Date(project.expiresAt).getTime()<Date.now()){await store.remove(`projects/${id}/`);throw new AppError('This project has expired.',404,'expired');}return project;}
  return {
    get,
    async list(){const keys=(await store.list('projects/')).filter(k=>k.endsWith('/project.json'));const projects=[];for(const key of keys){const p=await store.readJson(key);if(!p)continue;if(new Date(p.expiresAt).getTime()<Date.now())await store.remove(`projects/${projectId(p.id)}/`);else projects.push(p);}return projects.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));},
    async create({originalName,media,sourcePath,sizeBytes,extension}){
      const id=randomUUID(),now=new Date(),prefix=`projects/${id}/`,sourceKey=prefix+'source'+extension;
      const name=originalName.replace(/\.[^.]+$/,'').slice(0,100)||'Untitled video';
      const project={id,name,originalName:originalName.slice(0,180),media,sourceKey,sizeBytes,createdAt:now.toISOString(),updatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+(config.retentionDays||7)*86400000).toISOString(),status:'uploaded',cues:[],suggestions:[],exports:[],clip:validateClip({start:0,end:Math.min(media.duration,45),title:name},media.duration)};
      try{await store.putFile(sourceKey,sourcePath);await store.writeJson(projectKey(id),project);return project;}catch(e){await store.remove(prefix).catch(()=>{});throw e;}
    },
    async edit(id,input){await get(id);return store.updateJson(projectKey(id),current=>{
      if(!current)throw new AppError('This project was not found.',404);
      const updated={...current,updatedAt:new Date().toISOString()};
      if(input.name!==undefined){if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw new AppError('Project name must contain 1–100 characters.');updated.name=input.name.trim();}
      if(input.cues!==undefined)updated.cues=normalizeCues(input.cues,current.media.duration);
      if(input.clip!==undefined)updated.clip=validateClip(input.clip,current.media.duration);
      return updated;
    });},
    async remove(id){const current=await get(id);if(current.job&&['queued','running'].includes(current.job.state))throw new AppError('Wait for processing to finish before deleting this project.',409,'project_busy');await store.remove(`projects/${id}/`);}
  };
}
