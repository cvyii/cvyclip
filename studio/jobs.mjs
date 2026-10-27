import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile,stat} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {AppError,validateClip,normalizeCues,captionsToAss} from './domain.mjs';
import {createProjects,projectKey} from './projects.mjs';

const stamp=()=>new Date().toISOString(),leaseKey='jobs/worker.json',leaseMs=45000;
export async function createJobs({store,media,ai,config}){
  const owner=randomUUID(),projects=createProjects(store,config);let draining=false,stopped=false,drainPromise=Promise.resolve(),controller;
  const dayKey=()=>`usage/${new Date().toISOString().slice(0,10)}.json`;
  async function usage(){const value=await store.readJson(dayKey());return {usedSeconds:value?.usedSeconds||0,limitSeconds:config.dailyAnalysisSeconds||1200,date:new Date().toISOString().slice(0,10)};}
  async function reserve(id,seconds){return store.updateJson(dayKey(),current=>{const value=current||{usedSeconds:0,reservations:{}};if(value.reservations[id])return value;if(value.usedSeconds+seconds>(config.dailyAnalysisSeconds||1200))throw new AppError('Today’s AI analysis allowance is used. Your video is saved; you can edit manually or return tomorrow.',429,'daily_limit');return {...value,usedSeconds:value.usedSeconds+seconds,reservations:{...value.reservations,[id]:seconds}};});}
  async function update(id,jobId,fn){return store.updateJson(projectKey(id),p=>{if(!p||p.job?.id!==jobId)throw new AppError('This processing job changed. Reload the project.',409,'job_changed');return fn(p);});}
  async function claim(){const lease=await store.updateJson(leaseKey,current=>current?.owner&&current.owner!==owner&&current.expires>Date.now()?current:{owner,expires:Date.now()+leaseMs});return lease.owner===owner;}
  async function release(){await store.updateJson(leaseKey,current=>current?.owner===owner?{owner:null,expires:0}:current||{owner:null,expires:0});}
  async function processJob(project){
    const job=project.job;controller=new AbortController();let lastProgress=0,pendingProgress=Promise.resolve();
    await update(project.id,job.id,p=>({...p,status:job.type==='analysis'?'analyzing':'exporting',job:{...p.job,state:'running',owner,heartbeat:stamp(),stage:'Preparing your video',progress:.03}}));
    const heartbeat=setInterval(()=>{Promise.all([store.updateJson(leaseKey,l=>{if(l?.owner!==owner)throw new Error('Lease lost');return {...l,expires:Date.now()+leaseMs};}),update(project.id,job.id,p=>({...p,job:{...p.job,heartbeat:stamp()}}))]).catch(()=>controller?.abort());},10000);heartbeat.unref();
    const root=join(config.dataDir||tmpdir(),'tmp');await mkdir(root,{recursive:true});const directory=await mkdtemp(join(root,'job-'));
    const progress=async(stage,value,extra={})=>update(project.id,job.id,p=>({...p,...extra,updatedAt:stamp(),job:{...p.job,stage,progress:value,heartbeat:stamp()}}));
    try{
      const input=join(directory,'source'+extname(project.sourceKey));await store.getFile(project.sourceKey,input);
      if(job.type==='analysis'){
        let transcript=project.transcript;
        if(!transcript){
          await progress('Extracting audio',.1);const audio=join(directory,'speech.mp3');await media.extractAudio(input,audio,{signal:controller.signal});
          await reserve(job.id,Math.ceil(project.media.duration));await progress('Transcribing speech',.25);
          await update(project.id,job.id,p=>({...p,job:{...p.job,providerInFlight:true}}));
          transcript=await ai.transcribeAudio(audio,{signal:controller.signal});
          transcript={...transcript,cues:normalizeCues(transcript.cues,project.media.duration)};
          await update(project.id,job.id,p=>({...p,transcript,cues:transcript.cues,job:{...p.job,providerInFlight:false,stage:'Finding complete stories',progress:.65}}));
        }
        await update(project.id,job.id,p=>({...p,job:{...p.job,providerInFlight:true,stage:'Finding highlights',progress:.7}}));
        const suggestions=await ai.suggestClips(transcript,project.media.duration,{signal:controller.signal});
        await update(project.id,job.id,p=>({...p,status:'ready',suggestions,updatedAt:stamp(),job:{...p.job,state:'ready',providerInFlight:false,stage:'Your highlights are ready',progress:1,finishedAt:stamp()}}));
      }else{
        const clip=validateClip(job.clip,project.media.duration),captionsPath=join(directory,'captions.ass'),output=join(directory,'clip.mp4');
        await writeFile(captionsPath,captionsToAss(job.cues||[],clip));await progress('Rendering your MP4',.1);
        await media.renderClip({input,output,captionsPath,clip,signal:controller.signal,onProgress(value){if(Date.now()-lastProgress<900&&value<1)return;lastProgress=Date.now();pendingProgress=pendingProgress.then(()=>progress('Rendering your MP4',.1+.8*value)).catch(()=>{});}});
        await pendingProgress;await progress('Saving your finished clip',.93);const exportId=randomUUID(),key=`projects/${project.id}/exports/${exportId}.mp4`;
        await store.putFile(key,output,'video/mp4');const bytes=(await stat(output)).size;if(!bytes)throw new AppError('The video renderer did not produce a file.',502,'empty_export');
        await update(project.id,job.id,p=>({...p,status:p.transcript?'ready':'uploaded',updatedAt:stamp(),exports:[{id:exportId,key,ratio:clip.ratio,sizeBytes:bytes,duration:clip.end-clip.start,createdAt:stamp(),clip},...p.exports],job:{...p.job,state:'ready',stage:'Your clip is ready',progress:1,finishedAt:stamp()}}));
      }
    }catch(error){const safe=error instanceof AppError?{code:error.code,message:error.message}:{code:'processing_failed',message:'Processing could not finish. Your uploaded video and completed work are saved. Choose Retry when ready.'};await update(project.id,job.id,p=>({...p,status:'error',updatedAt:stamp(),job:{...p.job,state:'failed',providerInFlight:false,error:safe,stage:'Needs your attention',finishedAt:stamp()}})).catch(()=>{});
    }finally{clearInterval(heartbeat);await rm(directory,{recursive:true,force:true});controller=null;}
  }
  async function drain(){
    if(draining||stopped)return;draining=true;
    try{if(!await claim())return;for(;;){if(stopped)break;const next=(await projects.list()).find(p=>p.job?.state==='queued');if(!next)break;await processJob(next);}}
    finally{await release().catch(()=>{});draining=false;}
  }
  function schedule(){if(stopped)return;queueMicrotask(()=>{drainPromise=drain().catch(()=>{});});}
  async function recover(){
    const all=await projects.list();for(const p of all){if(p.job?.state==='running'&&new Date(p.job.heartbeat||0).getTime()<Date.now()-leaseMs){await update(p.id,p.job.id,current=>({...current,status:'error',job:{...current.job,state:'failed',providerInFlight:false,error:{code:'interrupted',message:'Processing was interrupted. Completed work is saved. Choose Retry; AI requests will not restart automatically.'},stage:'Interrupted',finishedAt:stamp()}}));}}
    schedule();
  }
  const timer=setInterval(()=>recover().catch(()=>{}),10000);timer.unref();
  return {
    usage,recover,
    async enqueueAnalysis(id,{retry=false}={}){
      if(!config.openaiApiKey)throw new AppError('Configure your OpenAI key before using AI analysis.',503,'ai_not_configured');
      await projects.get(id);const p=await store.updateJson(projectKey(id),current=>{
        if(!current)throw new AppError('Project not found.',404);
        if(current.job&&['queued','running'].includes(current.job.state))return current;
        if(current.suggestions.length&&!retry)return current;
        if(current.job?.state==='failed'&&!retry)throw new AppError('Choose Retry to start another AI request.',409,'retry_required');
        return {...current,status:'analyzing',job:{id:randomUUID(),type:'analysis',state:'queued',progress:0,stage:'Waiting to analyze',createdAt:stamp(),heartbeat:stamp()}};
      });schedule();return p;
    },
    async enqueueExport(id,input){
      const current=await projects.get(id);const clip=validateClip(input||current.clip,current.media.duration);
      const p=await store.updateJson(projectKey(id),value=>{if(value.job&&['queued','running'].includes(value.job.state))throw new AppError('Wait for the current job to finish before exporting.',409,'project_busy');return {...value,clip,status:'exporting',job:{id:randomUUID(),type:'export',state:'queued',clip,cues:value.cues,stage:'Waiting to render',progress:0,createdAt:stamp(),heartbeat:stamp()}};});schedule();return p;
    },
    async getJob(id){return (await projects.get(id)).job;},
    async shutdown(){stopped=true;clearInterval(timer);controller?.abort();await drainPromise;await release().catch(()=>{});}
  };
}
