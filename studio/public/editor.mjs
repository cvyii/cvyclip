export function previewSize(availableWidth,availableHeight,ratio){const [w,h]=ratio.split(':').map(Number),r=w/h,width=Math.min(availableWidth,availableHeight*r);return {width,height:width/r};}
export function captionAt(cues,time){return cues.filter(c=>time>=c.start&&time<c.end).map(c=>c.text).join('\n');}
export function formatTime(seconds){const s=Math.max(0,Math.floor(Number(seconds)||0));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
export function framingPosition(clip){return clip.mode==='fit'?'50% 50%':`${clip.x*100}% ${clip.y*100}%`;}
export function createEditor({video,stage,frame,overlay,onTime,onPlaying,onError}){
  let project,clip,cues=[],lastText=null;
  function layout(){if(!clip)return;const size=previewSize(Math.max(10,stage.clientWidth-40),Math.max(10,stage.clientHeight-40),clip.ratio);frame.style.width=size.width+'px';frame.style.height=size.height+'px';video.style.objectFit=clip.mode==='crop'?'cover':'contain';video.style.objectPosition=framingPosition(clip);const targetWidth=clip.ratio==='16:9'?1920:1080;overlay.style.fontSize=(clip.fontSize*size.width/targetWidth)+'px';overlay.className='caption-overlay '+clip.captionStyle;overlay.style.top=clip.captionPosition==='top'?'10%':clip.captionPosition==='middle'?'50%':'auto';overlay.style.bottom=clip.captionPosition==='bottom'?'10%':'auto';overlay.style.transform=clip.captionPosition==='middle'?'translateY(-50%)':'none';draw();}
  function draw(){const text=clip?.captions?captionAt(cues,video.currentTime):'';if(text!==lastText){lastText=text;overlay.replaceChildren();if(text){const span=document.createElement('span');span.textContent=text;overlay.append(span);}}overlay.hidden=!text;onTime?.(video.currentTime,project?.media.duration||0);}
  const observer=new ResizeObserver(layout);observer.observe(stage);
  video.addEventListener('timeupdate',()=>{if(clip&&!video.paused&&video.currentTime>=clip.end){if(document.querySelector('#loop-preview').checked)video.currentTime=clip.start;else video.pause();}draw();});
  video.addEventListener('loadedmetadata',()=>{if(clip)video.currentTime=clip.start;layout();});
  video.addEventListener('play',()=>onPlaying?.(true));video.addEventListener('pause',()=>onPlaying?.(false));video.addEventListener('error',()=>{if(video.getAttribute('src'))onError?.('Your browser could not preview this video codec. Try an H.264 MP4 for the widest compatibility.');});
  return {
    load(value,newClip,newCues){project=value;clip=newClip;cues=newCues;lastText=null;const path=`/api/projects/${value.id}/source`;if(video.getAttribute('src')!==path){video.pause();video.src=path;}layout();},
    update(newClip,newCues){clip=newClip;cues=newCues;lastText=null;layout();},
    seek(time){if(project)video.currentTime=Math.max(0,Math.min(project.media.duration,Number(time)||0));},
    async toggle(){if(!clip)return;if(video.paused){if(video.currentTime<clip.start||video.currentTime>=clip.end)video.currentTime=clip.start;try{await video.play();}catch{onError?.('Playback could not start. Try the preview button again or use a compatible MP4.');}}else video.pause();},
    pause(){video.pause();},clear(){video.pause();video.removeAttribute('src');video.load();project=null;clip=null;cues=[];overlay.replaceChildren();}
  };
}
