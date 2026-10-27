import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createAI} from '../studio/ai.mjs';
const config={openaiApiKey:'test-secret-not-for-logs',transcriptionModel:'whisper-1',highlightModel:'gpt-4.1-mini'};
test('transcription preserves provider timestamps and groups real words for readable captions',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cvy-ai-'));t.after(()=>rm(root,{recursive:true,force:true}));const audio=join(root,'speech.mp3');await writeFile(audio,'audio');
  const ai=createAI(config,{fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.body.get('response_format'),'verbose_json');
    return Response.json({task:'transcribe',language:'english',duration:2,text:'A good idea.',segments:[{start:0,end:2,text:'A good idea.'}],words:[{start:.1,end:.3,word:'A'},{start:.4,end:.8,word:'good'},{start:.9,end:1.4,word:'idea.'}]});
  }});
  const result=await ai.transcribeAudio(audio);assert.equal(result.language,'english');assert.deepEqual(result.cues,[{start:.1,end:1.4,text:'A good idea.'}]);
});
test('provider quota errors are actionable and never reveal a key or raw provider message',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cvy-quota-'));t.after(()=>rm(root,{recursive:true,force:true}));const audio=join(root,'speech.mp3');await writeFile(audio,'audio');
  const ai=createAI(config,{fetchImpl:async()=>Response.json({error:{message:'raw secret '+config.openaiApiKey,code:'insufficient_quota'}},{status:429})});
  await assert.rejects(ai.transcribeAudio(audio),e=>e.code==='provider_quota'&&!e.message.includes(config.openaiApiKey));
});
test('highlight selection validates structured output timing rather than trusting AI values',async()=>{
  const transcript={text:'A story',cues:[{start:0,end:15,text:'A story'}]};
  const response=clips=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({clips})}]}]});
  const good=createAI(config,{fetchImpl:async(_url,o)=>{const body=JSON.parse(o.body);assert.equal(body.store,false);assert.equal(body.text.format.type,'json_schema');return Response.json(response([{start:0,end:10,title:'One idea',rationale:'A complete thought.'}]));}});
  assert.equal((await good.suggestClips(transcript,15))[0].end,10);
  const bad=createAI(config,{fetchImpl:async()=>Response.json(response([{start:-2,end:900,title:'bad',rationale:'bad'}]))});
  await assert.rejects(bad.suggestClips(transcript,15),e=>e.code==='invalid_ai_output');
});

test('AI highlights reject missing, null and nonnumeric timing instead of filling editor defaults',async()=>{
  for(const timing of [{},{start:null,end:null},{start:'1',end:10}]){
    const ai=createAI(config,{fetchImpl:async()=>Response.json({output_text:JSON.stringify({clips:[{...timing,title:'Incomplete',rationale:'No reliable timing'}]})})});
    await assert.rejects(ai.suggestClips({cues:[{start:0,end:60,text:'Speech'}]},60),e=>e.code==='invalid_ai_output');
  }
});
