import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile,stat} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {AppError,validateClip,normalizeCues,captionsToAss} from './domain.mjs';
import {createProjects,projectKey} from './projects.mjs';
import {cleanupTemporaryFiles} from './temp.mjs';

const stamp=()=>new Date().toISOString(),leaseKey='jobs/worker.json',leaseMs=45000;
const active=job=>job&&['queued','running'].includes(job.state),wakeKey=id=>`active/${id}.json`;
export async function createJobs({store,media,ai,config}){
  const owner=randomUUID(),projects=createProjects(store,config);let draining=false,stopped=false,wakeRequested=false,drainPromise=Promise.resolve(),controller;
  const dayKey=()=>`usage/${new Date().toISOString().slice(0,10)}.json`;
  async function usage(){const value=await store.readJson(dayKey());return {usedSeconds:value?.usedSeconds||0,limitSeconds:config.dailyAnalysisSeconds||1200,date:new Date().toISOString().slice(0,10)};}
  async function reserve(id,seconds){return store.updateJson(dayKey(),current=>{const value=current||{usedSeconds:0,reservations:{}};if(value.reservations[id])return value;if(value.usedSeconds+seconds>(config.dailyAnalysisSeconds||1200))throw new AppError('Today’s AI analysis allowance is used. Your video is saved; you can edit manually or return tomorrow.',429,'daily_limit');return {...value,usedSeconds:value.usedSeconds+seconds,reservations:{...value.reservations,[id]:seconds}};});}
  async function update(id,jobId,fn){return store.updateJson(projectKey(id),p=>{if(!p||p.job?.id!==jobId)throw new AppError('This processing job changed. Reload the project.',409,'job_changed');return fn(p);});}
  async function claim(){const lease=await store.updateJson(leaseKey,current=>current?.owner&&current.owner!==owner&&current.expires>Date.now()?current:{owner,expires:Date.now()+leaseMs});return lease.owner===owner;}
  async function release(){await store.updateJson(leaseKey,current=>current?.owner===owner?{owner:null,expires:0}:current||{owner:null,expires:0});}
  async function keepAwake(project){
    if(!active(project.job))return;
    const key=wakeKey(project.job.id);await store.writeJson(key,{projectId:project.id,jobId:project.job.id});
    const current=await store.readJson(projectKey(project.id));
    if(current?.job?.id!==project.job.id||!active(current.job))await store.remove(key);
  }
  async function processJob(project){
    const job=project.job,jobController=new AbortController();controller=jobController;let lastProgress=0,pendingProgress=Promise.resolve();
    const interrupted=()=>new AppError('Processing was interrupted. Completed work is saved; choose Retry when ready.',409,'interrupted');
    async function checkLease(){const lease=await store.readJson(leaseKey);if(jobController.signal.aborted||lease?.owner!==owner||lease.expires<=Date.now())throw interrupted();}
    async function apply(fn){await checkLease();return update(project.id,job.id,p=>{if(p.job.owner!==owner||p.job.state!=='running')throw interrupted();return fn(p);});}
    await checkLease();
    await update(project.id,job.id,p=>{if(p.job.state!=='queued')throw interrupted();return {...p,status:job.type==='analysis'?'analyzing':'exporting',job:{...p.job,state:'running',owner,heartbeat:stamp(),stage:'Preparing your video',progress:.03}};});
    const heartbeat=setInterval(()=>{(async()=>{await store.updateJson(leaseKey,l=>{if(l?.owner!==owner||l.expires<=Date.now())throw interrupted();return {...l,expires:Date.now()+leaseMs};});await apply(p=>({...p,job:{...p.job,heartbeat:stamp()}}));})().catch(()=>jobController.abort());},10000);heartbeat.unref();
    let directory;
    const progress=async(stage,value,extra={})=>apply(p=>({...p,...extra,updatedAt:stamp(),job:{...p.job,stage,progress:value,heartbeat:stamp()}}));
    try{
      const root=join(config.dataDir||tmpdir(),'tmp');await mkdir(root,{recursive:true});directory=await mkdtemp(join(root,'job-'));
      await writeFile(join(directory,'owner.json'),JSON.stringify({owner,projectId:project.id,jobId:job.id}));
      const input=join(directory,'source'+extname(project.sourceKey));await store.getFile(project.sourceKey,input);
      if(job.type==='analysis'){
        let transcript=project.transcript;
        if(!transcript){
          await progress('Extracting audio',.1);const audio=join(directory,'speech.mp3');await media.extractAudio(input,audio,{signal:controller.signal});
          await reserve(job.id,Math.ceil(project.media.duration));await progress('Transcribing speech',.25);
          await apply(p=>({...p,job:{...p.job,providerInFlight:true}}));await checkLease();
          transcript=await ai.transcribeAudio(audio,{signal:jobController.signal});
          transcript={...transcript,cues:normalizeCues(transcript.cues,project.media.duration)};
          await apply(p=>({...p,transcript,cues:transcript.cues,job:{...p.job,providerInFlight:false,stage:'Finding complete stories',progress:.65}}));
        }
        await apply(p=>({...p,job:{...p.job,providerInFlight:true,stage:'Finding highlights',progress:.7}}));await checkLease();
        const suggestions=await ai.suggestClips(transcript,project.media.duration,{signal:jobController.signal});
        await apply(p=>({...p,status:'ready',suggestions,updatedAt:stamp(),job:{...p.job,state:'ready',providerInFlight:false,stage:'Your highlights are ready',progress:1,finishedAt:stamp()}}));
      }else{
        const clip=validateClip(job.clip,project.media.duration),captionsPath=join(directory,'captions.ass'),output=join(directory,'clip.mp4');
        await writeFile(captionsPath,captionsToAss(job.cues||[],clip));await progress('Rendering your MP4',.1);
        await media.renderClip({input,output,captionsPath,clip,signal:jobController.signal,onProgress(value){if(Date.now()-lastProgress<900&&value<1)return;lastProgress=Date.now();pendingProgress=pendingProgress.then(()=>progress('Rendering your MP4',.1+.8*value)).catch(()=>jobController.abort());}});
        await pendingProgress;await progress('Saving your finished clip',.93);const exportId=randomUUID(),key=`projects/${project.id}/exports/${exportId}.mp4`;
        await store.putFile(key,output,'video/mp4');const bytes=(await stat(output)).size;if(!bytes)throw new AppError('The video renderer did not produce a file.',502,'empty_export');
        await apply(p=>({...p,status:p.transcript?'ready':'uploaded',updatedAt:stamp(),exports:[{id:exportId,key,ratio:clip.ratio,sizeBytes:bytes,duration:clip.end-clip.start,createdAt:stamp(),clip},...p.exports],job:{...p.job,state:'ready',stage:'Your clip is ready',progress:1,finishedAt:stamp()}}));
      }
    }catch(error){const safe=error instanceof AppError?{code:error.code,message:error.message}:{code:'processing_failed',message:'Processing could not finish. Your uploaded video and completed work are saved. Choose Retry when ready.'};await update(project.id,job.id,p=>p.job.owner===owner&&p.job.state==='running'?({...p,status:'error',updatedAt:stamp(),job:{...p.job,state:'failed',providerInFlight:false,error:safe,stage:'Needs your attention',finishedAt:stamp()}}):p).catch(()=>{});
    }finally{clearInterval(heartbeat);if(directory)await rm(directory,{recursive:true,force:true}).catch(()=>{});controller=null;const current=await store.readJson(projectKey(project.id));if(current?.job?.id!==job.id||!active(current.job))await store.remove(wakeKey(job.id));}
  }
  async function drain(){
    try{do{wakeRequested=false;if(!await claim())return;for(;;){if(stopped)break;const next=(await projects.list()).find(p=>p.job?.state==='queued');if(!next)break;await processJob(next);}await release();}while(wakeRequested&&!stopped);}
    finally{await release().catch(()=>{});draining=false;if(wakeRequested&&!stopped)schedule();}
  }
  function schedule(){if(stopped)return;wakeRequested=true;if(draining)return;draining=true;drainPromise=drain().catch(()=>{});}
  async function recover(){
    await cleanupTemporaryFiles({config,store});
    const all=await projects.list();for(const p of all){if(p.job?.state==='running'&&new Date(p.job.heartbeat||0).getTime()<Date.now()-leaseMs){await update(p.id,p.job.id,current=>current.job.state==='running'&&new Date(current.job.heartbeat||0).getTime()<Date.now()-leaseMs?({...current,status:'error',job:{...current.job,state:'failed',providerInFlight:false,error:{code:'interrupted',message:'Processing was interrupted. Completed work is saved. Choose Retry; AI requests will not restart automatically.'},stage:'Interrupted',finishedAt:stamp()}}):current);}}
    for(const p of await projects.list())await keepAwake(p);
    for(const key of await store.list('active/')){
      const marker=await store.readJson(key);if(!marker)continue;
      const p=await store.readJson(projectKey(marker.projectId));
      if(p?.job?.id!==marker.jobId||!active(p.job))await store.remove(key);
    }
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
      });await keepAwake(p);schedule();return p;
    },
    async enqueueExport(id,input){
      const current=await projects.get(id);const clip=validateClip(input||current.clip,current.media.duration);
      const p=await store.updateJson(projectKey(id),value=>{if(value.job&&['queued','running'].includes(value.job.state))throw new AppError('Wait for the current job to finish before exporting.',409,'project_busy');return {...value,clip,status:'exporting',job:{id:randomUUID(),type:'export',state:'queued',clip,cues:value.cues,stage:'Waiting to render',progress:0,createdAt:stamp(),heartbeat:stamp()}};});await keepAwake(p);schedule();return p;
    },
    async getJob(id){return (await projects.get(id)).job;},
    async shutdown(){stopped=true;clearInterval(timer);controller?.abort();await drainPromise;await release().catch(()=>{});}
  };
}
