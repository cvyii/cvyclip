import express from 'express';
import Busboy from 'busboy';
import {createWriteStream} from 'node:fs';
import {mkdir,mkdtemp,rm,stat as fileStat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {resolve,join,dirname,extname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {AppError,validateMedia,captionsToSrt} from './domain.mjs';
import {createAuth} from './auth.mjs';
import {createProjects,projectId} from './projects.mjs';
import {createStore} from './storage.mjs';
import {loadConfig} from './config.mjs';

const moduleDir=dirname(fileURLToPath(import.meta.url));
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
async function receiveUpload(req,config,directory){
  let uploaded,failure;const writes=[];
  await new Promise((done,reject)=>{
    let parser;try{parser=Busboy({headers:req.headers,limits:{fileSize:config.maxUploadBytes,files:1,fields:0,parts:2}});}catch{reject(new AppError('Choose a video file to upload.'));return;}
    parser.on('file',(field,stream,info)=>{
      const originalName=basename(info.filename||'video.mp4'),extension=extname(originalName).toLowerCase();
      if(uploaded||field!=='video'||!['.mp4','.mov','.webm'].includes(extension)){failure=new AppError('Choose an MP4, MOV, or WebM video.');stream.resume();return;}
      const sourcePath=join(directory,'source'+extension);uploaded={originalName,extension,sourcePath};
      stream.on('limit',()=>{failure=new AppError('This file is too large. The limit is 200 MB.',413,'file_too_large');});
      writes.push(pipeline(stream,createWriteStream(sourcePath,{flags:'wx'})).catch(()=>{failure||=new AppError('The upload was interrupted. Try again.',400,'upload_interrupted');}));
    });
    for(const event of ['filesLimit','fieldsLimit','partsLimit'])parser.on(event,()=>{failure||=new AppError('Upload one video at a time.');});
    parser.on('error',()=>reject(new AppError('The upload could not be read. Try again.')));
    req.once('aborted',()=>{parser.destroy();reject(new AppError('The upload was interrupted.'));});
    parser.on('close',()=>Promise.all(writes).then(()=>failure?reject(failure):done()));req.pipe(parser);
  });
  if(!uploaded)throw new AppError('Choose a video file to upload.');
  uploaded.sizeBytes=(await fileStat(uploaded.sourcePath)).size;if(!uploaded.sizeBytes)throw new AppError('This file is empty.');
  return uploaded;
}
function rangeFor(header,size){
  if(!header)return null;const m=/^bytes=(\d*)-(\d*)$/.exec(header);if(!m||(!m[1]&&!m[2]))throw new AppError('Unsupported video byte range.',416);
  const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=size)throw new AppError('Video byte range is outside this file.',416);
  return {start,end};
}
export function createApp({config,store,media,jobs}){
  const app=express(),auth=createAuth(config),projects=createProjects(store,config);
  app.disable('x-powered-by');if(config.trustProxy)app.set('trust proxy',1);
  app.use((_req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});if(config.secureCookies)res.set('Strict-Transport-Security','max-age=31536000');next();});
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use(express.json({limit:'1mb'}));
  app.get('/healthz',(_req,res)=>res.json({status:'ready'}));
  app.get('/api/session',(req,res)=>{const session=auth.getSession(req);res.json(session?{signedIn:true,csrfToken:session.csrfToken,aiConfigured:!!config.openaiApiKey,limits:{maxUploadBytes:config.maxUploadBytes,maxDuration:1200,dailyAnalysisSeconds:config.dailyAnalysisSeconds,retentionDays:config.retentionDays}}:{signedIn:false});});
  app.post('/api/login',auth.origin,auth.login);
  app.use('/api',auth.requireSession);
  app.use('/api',(req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?next():auth.origin(req,res,e=>e?next(e):auth.csrf(req,res,next)));
  app.post('/api/logout',auth.logout);
  app.get('/api/projects',asyncRoute(async(_req,res)=>res.json({projects:await projects.list()})));
  app.post('/api/projects',asyncRoute(async(req,res)=>{
    const tempRoot=join(config.dataDir||tmpdir(),'tmp');await mkdir(tempRoot,{recursive:true});const directory=await mkdtemp(join(tempRoot,'upload-'));
    try{const upload=await receiveUpload(req,config,directory);const metadata=validateMedia(await media.probeMedia(upload.sourcePath));const project=await projects.create({...upload,media:metadata});res.status(201).json(project);}finally{await rm(directory,{recursive:true,force:true});}
  }));
  app.get('/api/projects/:id',asyncRoute(async(req,res)=>res.json(await projects.get(req.params.id))));
  app.patch('/api/projects/:id',asyncRoute(async(req,res)=>res.json(await projects.edit(req.params.id,req.body||{}))));
  app.delete('/api/projects/:id',asyncRoute(async(req,res)=>{await projects.remove(req.params.id);res.json({deleted:true});}));
  async function streamStored(req,res,key,attachment){
    const info=await store.stat(key);if(!info)throw new AppError('This file is no longer available.',404,'not_found');
    let range;try{range=rangeFor(req.get('range'),info.size);}catch(e){res.set('Content-Range',`bytes */${info.size}`);throw e;}
    res.set({'Content-Type':info.contentType||'video/mp4','Accept-Ranges':'bytes','Content-Length':String(range?range.end-range.start+1:info.size)});
    if(attachment)res.attachment(attachment);
    if(range){res.status(206);res.set('Content-Range',`bytes ${range.start}-${range.end}/${info.size}`);}
    if(req.method==='HEAD'){res.end();return;}
    const stream=await store.openRead(key,range||{});await pipeline(stream,res);
  }
  app.get('/api/projects/:id/source',asyncRoute(async(req,res)=>{const p=await projects.get(req.params.id);await streamStored(req,res,p.sourceKey);}));
  app.get('/api/projects/:id/subtitles',asyncRoute(async(req,res)=>{const p=await projects.get(req.params.id);const start=req.query.full==='1'?0:p.clip.start,end=req.query.full==='1'?p.media.duration:p.clip.end;res.type('application/x-subrip').attachment('cvyclip-captions.srt').send(captionsToSrt(p.cues,start,end));}));
  app.get('/api/projects/:id/exports/:exportId',asyncRoute(async(req,res)=>{const p=await projects.get(req.params.id);projectId(req.params.exportId);const output=p.exports.find(e=>e.id===req.params.exportId);if(!output)throw new AppError('This export was not found.',404);await streamStored(req,res,output.key,req.query.download==='1'?'cvyclip-'+output.ratio.replace(':','x')+'.mp4':undefined);}));
  app.post('/api/projects/:id/analyze',asyncRoute(async(req,res)=>{if(!jobs)throw new AppError('Analysis is not ready.',503);await projects.get(req.params.id);res.status(202).json(await jobs.enqueueAnalysis(req.params.id,{retry:req.body?.retry===true}));}));
  app.post('/api/projects/:id/export',asyncRoute(async(req,res)=>{if(!jobs)throw new AppError('Export is not ready.',503);await projects.get(req.params.id);res.status(202).json(await jobs.enqueueExport(req.params.id,req.body?.clip));}));
  app.get('/api/usage',asyncRoute(async(_req,res)=>res.json(jobs?await jobs.usage():{usedSeconds:0,limitSeconds:config.dailyAnalysisSeconds})));
  app.get('/domain.mjs',(_req,res)=>res.sendFile(join(moduleDir,'domain.mjs')));
  app.use(express.static(join(moduleDir,'public'),{index:'index.html',maxAge:0}));
  app.use('/api',(_req,_res,next)=>next(new AppError('This endpoint was not found.',404,'not_found')));
  app.use((err,_req,res,_next)=>{if(res.headersSent){res.end();return;}const isKnown=err instanceof AppError,status=isKnown?err.status:err.type==='entity.too.large'?413:500;res.status(status).json({error:{code:isKnown?err.code:'server_error',message:isKnown?err.message:status===413?'This request is too large.':'Something went wrong. Your existing work is safe. Try again.'}});});
  return app;
}
export async function startServer(config=loadConfig()){
  if(config.workspacePassword.length<12)throw new Error('Set WORKSPACE_PASSWORD to at least 12 characters in the private .env.local file.');
  const store=await createStore(config),media=await import('./media.mjs'),{createAI}=await import('./ai.mjs'),{createJobs}=await import('./jobs.mjs');
  const jobs=await createJobs({store,media,ai:createAI(config),config});const app=createApp({config,store,media,jobs});
  const server=app.listen(config.port,config.host,()=>console.log(`CvyClip Studio: http://${config.host}:${config.port}`));
  await jobs.recover();
  const shutdown=async()=>{await jobs.shutdown();server.close();};process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  return {server,app,jobs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){startServer().catch(()=>{console.error('CvyClip could not start. Check the private server settings and storage access. No secrets were logged.');process.exitCode=1;});}
