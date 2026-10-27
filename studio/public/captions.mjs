export function renderCaptions(container,cues,{onChange,onSeek,busy=false}){
  container.replaceChildren();if(!cues.length){const p=document.createElement('p');p.className='caption-placeholder';p.textContent='Your captions will appear here after AI analysis. You can also add and time captions yourself.';container.append(p);return;}
  cues.forEach((cue,index)=>{
    const row=document.createElement('div');row.className='caption-row';row.dataset.cueIndex=index;
    const top=document.createElement('div');top.className='caption-row-top';const label=document.createElement('span');label.textContent=String(index+1).padStart(2,'0');const seek=document.createElement('button');seek.textContent='Jump to line ↗';seek.type='button';seek.addEventListener('click',()=>onSeek(cue.start));top.append(label,seek);
    const text=document.createElement('textarea');text.value=cue.text;text.maxLength=500;text.setAttribute('aria-label',`Caption ${index+1} text`);text.dir='auto';text.disabled=busy;text.addEventListener('input',()=>{cue.text=text.value;onChange();});
    const timing=document.createElement('div');timing.className='caption-timing';
    for(const key of ['start','end']){const field=document.createElement('label');field.textContent=key==='start'?'IN':'OUT';const input=document.createElement('input');input.type='number';input.min='0';input.step='0.01';input.value=cue[key];input.disabled=busy;input.setAttribute('aria-label',`Caption ${index+1} ${key} in seconds`);input.addEventListener('input',()=>{cue[key]=Number(input.value);onChange();});field.append(input);timing.append(field);}
    const remove=document.createElement('button');remove.className='text-button';remove.textContent='Remove';remove.type='button';remove.disabled=busy;remove.addEventListener('click',()=>{cues.splice(index,1);onChange(true);});timing.append(remove);row.append(top,text,timing);container.append(row);
  });
}
