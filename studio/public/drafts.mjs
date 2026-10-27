export function stashDraft(state,preserve=true){
  if(!preserve){state.pendingDraft=null;return;}
  if(state.dirty&&state.project&&state.draft)state.pendingDraft={projectId:state.project.id,draft:structuredClone(state.draft)};
}
export function restoreDraft(state,project){
  if(state.pendingDraft?.projectId===project.id){const draft=state.pendingDraft.draft;state.pendingDraft=null;return {draft,dirty:true};}
  return {draft:{clip:structuredClone(project.clip),cues:structuredClone(project.cues)},dirty:false};
}
