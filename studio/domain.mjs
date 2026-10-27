export class AppError extends Error {
  constructor(message,status=400,code='invalid_request'){super(message);this.status=status;this.code=code;}
}
const fail=(message)=>{throw new AppError(message);};
const finite=(value,name)=>typeof value==='number'&&Number.isFinite(value)?value:fail(`${name} must be a number.`);
export function outputSize(ratio){
  const sizes={'9:16':{width:1080,height:1920},'1:1':{width:1080,height:1080},'16:9':{width:1920,height:1080}};
  return sizes[ratio]?{...sizes[ratio]}:fail('Choose a supported aspect ratio.');
}
export function validateClip(input={},duration){
  finite(duration,'Video duration');if(duration<=0)fail('Video has no duration.');
  const start=finite(input.start??0,'Start'),end=finite(input.end??Math.min(duration,45),'End');
  if(start<0||end>duration+0.001||end<=start||end-start>90.001||end-start<Math.min(5,duration)-0.001)fail('Choose a clip between 5 and 90 seconds within this video.');
  const ratio=input.ratio??'9:16';outputSize(ratio);
  const mode=input.mode??'crop';if(!['crop','fit'].includes(mode))fail('Choose crop or fit.');
  const x=finite(input.x??0.5,'Horizontal framing'),y=finite(input.y??0.5,'Vertical framing');
  if(x<0||x>1||y<0||y>1)fail('Framing must stay inside the video.');
  const captionStyle=input.captionStyle??'highlight';if(!['highlight','clean'].includes(captionStyle))fail('Choose a supported caption style.');
  const captionPosition=input.captionPosition??'bottom';if(!['top','middle','bottom'].includes(captionPosition))fail('Choose a supported caption position.');
  const fontSize=finite(input.fontSize??56,'Font size');if(fontSize<24||fontSize>88)fail('Caption size must be between 24 and 88.');
  return {start,end,ratio,mode,x,y,captionStyle,captionPosition,fontSize,captions:input.captions!==false,title:String(input.title??'My clip').slice(0,100)};
}
export function normalizeCues(cues,duration){
  if(!Array.isArray(cues)||cues.length>10000)fail('Captions must be a list of timed lines.');
  return cues.map(cue=>{
    const start=finite(cue.start,'Caption start'),end=finite(cue.end,'Caption end');
    if(start<0||end<=start||end>duration+0.05)fail('Caption timing must stay inside this video.');
    if(typeof cue.text!=='string'||cue.text.length>500)fail('Each caption must contain at most 500 characters.');
    return {start,end,text:cue.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\r/g,'').trim()};
  }).filter(c=>c.text).sort((a,b)=>a.start-b.start);
}
function stamp(seconds,ass=false){
  const unit=ass?100:1000,n=Math.max(0,Math.round(seconds*unit));
  const hours=Math.floor(n/(unit*3600)),minutes=Math.floor(n/(unit*60))%60,secs=Math.floor(n/unit)%60,part=n%unit;
  return `${ass?hours:String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}${ass?'.':','}${String(part).padStart(ass?2:3,'0')}`;
}
function clipped(cues,start,end){return cues.filter(c=>c.end>start&&c.start<end).map(c=>({...c,start:Math.max(c.start,start)-start,end:Math.min(c.end,end)-start}));}
export function captionsToSrt(cues,start=0,end=Infinity){
  return clipped(cues,start,end).map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text.replace(/\r/g,'').replace(/\n\s*\n/g,'\n').replace(/-->/g,'→')}\n`).join('\n');
}
export function captionsToAss(cues,clip){
  const {width,height}=outputSize(clip.ratio),alignment={bottom:2,middle:5,top:8}[clip.captionPosition],highlight=clip.captionStyle==='highlight';
  const header=`[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans,${clip.fontSize},&H00FFFFFF,&H00FFFFFF,${highlight?'&H00322A22':'&H95000000'},${highlight?'&H00322A22':'&H90000000'},-1,0,0,0,100,100,0,0,${highlight?3:1},${highlight?12:3},0,${alignment},${Math.round(width*.08)},${Math.round(width*.08)},${Math.round(height*.1)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const safe=text=>text.replace(/\\/g,'＼').replace(/\{/g,'｛').replace(/\}/g,'｝').replace(/\r/g,'').replace(/\n/g,'\\N');
  return header+clipped(cues,clip.start,clip.end).map(c=>`Dialogue: 0,${stamp(c.start,true)},${stamp(c.end,true)},Default,,0,0,0,,${safe(c.text)}`).join('\n')+'\n';
}
export function validateMedia(media){
  if(!media||!Number.isFinite(media.duration)||media.duration<=0||!Number.isFinite(media.width)||!Number.isFinite(media.height)||media.width<16||media.height<16)fail('This file does not contain a supported video.');
  if(media.duration>1200)fail('Please upload a video of 20 minutes or less.');
  if(!media.hasAudio)fail('This video has no audio track. Please choose a video with speech.');
  if(media.width>8192||media.height>8192||media.codedWidth>8192||media.codedHeight>8192)fail('This video resolution is too large. Use a source no larger than 8K.');
  return media;
}
