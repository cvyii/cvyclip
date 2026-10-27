import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {basename,dirname} from 'node:path';
import {AppError,outputSize} from './domain.mjs';
const require=createRequire(import.meta.url);
function tool(name){return name==='ffmpeg'?(process.env.FFMPEG_PATH||require('ffmpeg-static')):(process.env.FFPROBE_PATH||require('ffprobe-static').path);}
function execute(name,args,{timeoutMs=600000,signal,onOutput,cwd}={}){
  return new Promise((done,reject)=>{
    let stdout='',stderr='',ended=false;
    const child=spawn(tool(name),args,{cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new AppError('This video took too long to process. Try a shorter clip.',408,'processing_timeout'));},timeoutMs);timer.unref();
    const abort=()=>{child.kill('SIGKILL');finish(new AppError('Processing was interrupted. You can retry from the project.',409,'interrupted'));};
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    function finish(error){if(ended)return;ended=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):done({stdout,stderr});}
    child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.length>2*1024*1024){child.kill();finish(new AppError('This file produced too much metadata. Use a simpler video.'));}onOutput?.(chunk.toString());});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-16000);});
    child.once('error',()=>finish(new AppError('Video processing tools are unavailable. Check the server installation.',503,'media_unavailable')));
    child.once('close',code=>{if(code===0)finish();else finish(new AppError('This video could not be processed. Try an MP4 with H.264 video and an audio track.',400,'invalid_media'));});
  });
}
export async function probeMedia(path){
  const {stdout}=await execute('ffprobe',['-v','error','-show_format','-show_streams','-of','json',path],{timeoutMs:30000});
  let data;try{data=JSON.parse(stdout);}catch{throw new AppError('This video metadata could not be read.');}
  const video=data.streams?.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);
  if(!video)throw new AppError('This file does not contain a video track.');
  const codedWidth=Number(video.width),codedHeight=Number(video.height),[sarN,sarD]=String(video.sample_aspect_ratio||'1:1').split(':').map(Number),sampleAspectRatio=sarN>0&&sarD>0?sarN/sarD:1;
  let width=Math.round(codedWidth*sampleAspectRatio),height=codedHeight;
  const rotation=Number(video.side_data_list?.find(s=>s.rotation!==undefined)?.rotation??video.tags?.rotate??0);
  if(Math.abs(rotation)%180===90)[width,height]=[height,width];
  const [n,d]=String(video.avg_frame_rate||'30/1').split('/').map(Number);
  return {duration:Number(data.format?.duration??video.duration),width,height,codedWidth,codedHeight,sampleAspectRatio,fps:d?n/d:30,hasAudio:!!data.streams?.some(s=>s.codec_type==='audio'),codec:video.codec_name,rotation};
}
export async function extractAudio(input,output,{signal}={}){
  await execute('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-i',input,'-vn','-ac','1','-ar','16000','-c:a','libmp3lame','-b:a','64k','-y',output],{timeoutMs:300000,signal});
  return output;
}
export async function renderClip({input,output,captionsPath,clip,onProgress,signal}){
  const {width,height}=outputSize(clip.ratio),duration=clip.end-clip.start,ratio=width/height;
  const filters=clip.mode==='fit'
    ?[`scale=w='if(gte(dar,${ratio}),${width},max(2,trunc(${height}*dar/2)*2))':h='if(gte(dar,${ratio}),max(2,trunc(${width}/dar/2)*2),${height})'`,'setsar=1',`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x101016`]
    :[`crop=w='max(2,trunc(min(iw,ih*${ratio}/sar)/2)*2)':h='max(2,trunc(min(ih,iw*sar/${ratio})/2)*2)':x='(iw-ow)*${clip.x}':y='(ih-oh)*${clip.y}'`,`scale=${width}:${height}`];
  filters.push('setsar=1');
  if(clip.captions&&captionsPath){const name=basename(captionsPath);if(!/^[A-Za-z0-9_.-]+\.ass$/.test(name))throw new AppError('Invalid caption file.');filters.push(`subtitles=filename=${name}`);}
  let buffer='';onProgress?.(0);
  await execute('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-ss',String(clip.start),'-i',input,'-t',String(duration),'-map','0:v:0','-map','0:a:0?','-vf',filters.join(','),'-af','aresample=async=1:first_pts=0','-r','30','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','128k','-movflags','+faststart','-progress','pipe:1','-nostats','-y',output],{
    cwd:captionsPath?dirname(captionsPath):dirname(output),signal,timeoutMs:600000,
    onOutput(text){buffer+=text;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){const match=/^out_time_us=(\d+)/.exec(line);if(match)onProgress?.(Math.min(.99,Number(match[1])/1000000/duration));}}
  });onProgress?.(1);return output;
}
