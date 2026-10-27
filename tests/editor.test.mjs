import test from 'node:test';
import assert from 'node:assert/strict';
import {previewSize,captionAt,formatTime,framingPosition} from '../studio/public/editor.mjs';
test('preview geometry preserves ratio within the available stage',()=>{
  assert.deepEqual(previewSize(600,400,'9:16'),{width:225,height:400});
  assert.deepEqual(previewSize(600,400,'16:9'),{width:600,height:337.5});
  assert.deepEqual(previewSize(280,400,'1:1'),{width:280,height:280});
});

test('fit preview stays centered after the user adjusts crop positioning',()=>{
  assert.equal(framingPosition({mode:'crop',x:.2,y:0}),'20% 0%');
  assert.equal(framingPosition({mode:'fit',x:.2,y:0}),'50% 50%');
});
test('caption selection follows source timing without displaying the previous line at a boundary',()=>{
  const cues=[{start:1,end:3,text:'First'},{start:3,end:5,text:'Second'}];
  assert.equal(captionAt(cues,.9),'');assert.equal(captionAt(cues,2),'First');assert.equal(captionAt(cues,3),'Second');assert.equal(captionAt(cues,5),'');
  assert.equal(formatTime(65.4),'01:05');
});
