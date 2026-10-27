import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClip, normalizeCues, captionsToSrt, captionsToAss, outputSize, validateMedia } from '../studio/domain.mjs';

test('clip validation rejects invalid ranges, formats and non-finite offsets', () => {
  for (const clip of [{start:-1,end:10},{start:10,end:8},{start:0,end:91},{start:0,end:4},{start:0,end:20,ratio:'3:2'},{start:0,end:10,x:NaN},{start:0,end:60}]) {
    assert.throws(()=>validateClip(clip,30));
  }
  const clip=validateClip({start:2,end:12,ratio:'1:1',mode:'fit',x:0.25,y:0.75},30);
  assert.equal(clip.start,2); assert.equal(clip.end,12); assert.equal(clip.mode,'fit'); assert.equal(clip.x,0.25);
  assert.equal(validateClip({start:0,end:3},3).end,3);
});
test('subtitle export clips and rebases captions at selection boundaries', () => {
  const srt=captionsToSrt([{start:0,end:3,text:'Before'},{start:3,end:7,text:'Keep me'},{start:7,end:9,text:'After'}],4,8);
  assert.equal(srt,'1\n00:00:00,000 --> 00:00:03,000\nKeep me\n\n2\n00:00:03,000 --> 00:00:04,000\nAfter\n');
});
test('caption validation rejects malformed timing and safely retains Unicode', () => {
  assert.deepEqual(normalizeCues([{start:1,end:2,text:' سڵاو <world> '}],5),[{start:1,end:2,text:'سڵاو <world>'}]);
  assert.throws(()=>normalizeCues([{start:2,end:1,text:'bad'}],5));
  assert.throws(()=>normalizeCues([{start:0,end:8,text:'bad'}],5));
});
test('ASS caption export neutralizes formatting injection and preserves newlines', () => {
  const clip=validateClip({start:0,end:10,ratio:'9:16',captionStyle:'highlight'},20);
  const ass=captionsToAss([{start:1,end:3,text:'Hello {\\pos(0,0)}\nسڵاو'}],clip);
  assert.ok(ass.includes('PlayResX: 1080')); assert.ok(ass.includes('PlayResY: 1920'));
  assert.ok(ass.includes('سڵاو')); assert.ok(ass.includes('\\N'));
  assert.ok(!ass.includes('{\\pos(0,0)}'));
});
test('output dimensions match the advertised aspect ratios', () => {
  assert.deepEqual(outputSize('9:16'),{width:1080,height:1920});
  assert.deepEqual(outputSize('1:1'),{width:1080,height:1080});
  assert.deepEqual(outputSize('16:9'),{width:1920,height:1080});
});
test('source validation rejects silent, excessively long and non-video media', () => {
  assert.throws(()=>validateMedia({duration:10,width:1920,height:1080,hasAudio:false}));
  assert.throws(()=>validateMedia({duration:1201,width:1920,height:1080,hasAudio:true}));
  assert.throws(()=>validateMedia({duration:10,width:0,height:0,hasAudio:true}));
  assert.doesNotThrow(()=>validateMedia({duration:10,width:1920,height:1080,hasAudio:true}));
});

test('display-aspect correction cannot hide oversized coded video dimensions',()=>{
  assert.throws(()=>validateMedia({duration:10,width:4500,height:1000,codedWidth:9000,codedHeight:1000,hasAudio:true}));
});
