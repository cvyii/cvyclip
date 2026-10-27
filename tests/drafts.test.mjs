import test from 'node:test';
import assert from 'node:assert/strict';
import {stashDraft,restoreDraft} from '../studio/public/drafts.mjs';
test('unsaved captions and framing survive reauthentication for the same project',()=>{
  const state={project:{id:'one'},draft:{clip:{x:.2,start:3,end:8},cues:[{start:3,end:7,text:'My unsaved words'}]},dirty:true};
  stashDraft(state);const saved=structuredClone(state.draft);state.project=null;state.draft=null;state.dirty=false;
  const restored=restoreDraft(state,{id:'one',clip:{x:.5},cues:[]});
  assert.deepEqual(restored.draft,saved);assert.equal(restored.dirty,true);assert.equal(state.pendingDraft,null);
});
test('draft recovery cannot apply one project’s edits to another and explicit sign-out forgets them',()=>{
  const state={project:{id:'one'},draft:{clip:{x:.2},cues:[]},dirty:true};stashDraft(state);
  const other={id:'two',clip:{x:.5},cues:[]};assert.deepEqual(restoreDraft(state,other),{draft:{clip:{x:.5},cues:[]},dirty:false});
  stashDraft(state,false);assert.equal(state.pendingDraft,null);
});
