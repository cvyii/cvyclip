import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {probeMedia,extractAudio,renderClip} from '../studio/media.mjs';
import {validateClip,captionsToAss,validateMedia} from '../studio/domain.mjs';
const require=createRequire(import.meta.url),ffmpeg=process.env.FFMPEG_PATH||require('ffmpeg-static');
const run=args=>new Promise((resolve,reject)=>{const p=spawn(ffmpeg,args,{windowsHide:true});let errors='';const chunks=[];p.stdout.on('data',b=>chunks.push(b));p.stderr.on('data',b=>errors+=b.toString());p.on('error',reject);p.on('exit',code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error(errors.slice(-3000))));});

test('real media pipeline preserves audio, burns captions and exports the three ratios',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cvy-media-'));t.after(()=>rm(root,{recursive:true,force:true}));const input=join(root,'source.mp4');
  await run(['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',input]);
  const metadata=await probeMedia(input);assert.equal(metadata.width,640);assert.equal(metadata.height,360);assert.equal(metadata.hasAudio,true);assert.ok(Math.abs(metadata.duration-2)<0.2);
  const audio=join(root,'speech.mp3');await extractAudio(input,audio);assert.ok((await stat(audio)).size>1000);
  for(const [ratio,width,height]of [['9:16',1080,1920],['1:1',1080,1080],['16:9',1920,1080]]){
    const clip=validateClip({start:0,end:2,ratio,captionStyle:'clean'},2),captionsPath=join(root,'captions.ass'),output=join(root,ratio.replace(':','x')+'.mp4'),progress=[];
    await writeFile(captionsPath,captionsToAss([{start:0,end:2,text:'An idea {\\pos(0,0)}\nسڵاو'}],clip));
    await renderClip({input,output,captionsPath,clip,onProgress:p=>progress.push(p)});
    const rendered=await probeMedia(output);assert.equal(rendered.width,width);assert.equal(rendered.height,height);assert.equal(rendered.hasAudio,true);assert.ok(Math.abs(rendered.duration-2)<0.25);assert.ok((await stat(output)).size>5000);assert.ok(progress.some(p=>p>0));
  }
});
test('corrupt media gives a safe actionable error and a silent video is detected',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cvy-invalid-'));t.after(()=>rm(root,{recursive:true,force:true}));const bad=join(root,'bad.mp4');await writeFile(bad,'not a video');
  await assert.rejects(probeMedia(bad),e=>e.status===400&&!e.message.includes(root));
  const silent=join(root,'silent.mp4');await run(['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x240:r=30','-t','1','-an','-c:v','libx264','-y',silent]);
  const info=await probeMedia(silent);assert.equal(info.hasAudio,false);assert.throws(()=>validateMedia(info));
});

test('anamorphic, rotated and extreme-aspect sources retain display geometry with bounded rendering',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cvy-geometry-'));t.after(()=>rm(root,{recursive:true,force:true}));const input=join(root,'anamorphic.mp4');
  await run(['-v','error','-f','lavfi','-i','color=red:s=720x576:r=10','-f','lavfi','-i','sine=frequency=440','-vf','setsar=64/45','-t','1','-c:v','libx264','-c:a','aac','-y',input]);
  const info=await probeMedia(input);assert.equal(info.width,1024);assert.equal(info.height,576);
  const output=join(root,'fit.mp4');await renderClip({input,output,clip:validateClip({start:0,end:1,ratio:'16:9',mode:'fit',captions:false},1)});
  const pixels=await run(['-v','error','-i',output,'-vf','crop=2:2:0:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);assert.ok(pixels[0]>200&&pixels[1]<40&&pixels[2]<40,'16:9 display content should fill a 16:9 fit without padding');
  const rotated=join(root,'rotated.mp4');await run(['-v','error','-display_rotation:v:0','90','-i',input,'-c','copy','-y',rotated]);const rotatedInfo=await probeMedia(rotated);assert.equal(rotatedInfo.width,576);assert.equal(rotatedInfo.height,1024);
  const panorama=join(root,'panorama.mp4');await run(['-v','error','-f','lavfi','-i','color=blue:s=8192x16:r=10','-f','lavfi','-i','sine=frequency=440','-t','1','-c:v','libx264','-c:a','aac','-y',panorama]);
  validateMedia(await probeMedia(panorama));const crop=join(root,'crop.mp4');await renderClip({input:panorama,output:crop,clip:validateClip({start:0,end:1,ratio:'9:16',captions:false},1)});assert.equal((await probeMedia(crop)).width,1080);
});
