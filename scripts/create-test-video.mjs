import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const require=createRequire(import.meta.url),output=resolve(process.argv[2]||'.test-tmp/sample-video.mp4');await mkdir(dirname(output),{recursive:true});
const args=['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','10','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-y',output];
const child=spawn(process.env.FFMPEG_PATH||require('ffmpeg-static'),args,{stdio:'inherit',windowsHide:true});child.on('exit',code=>{process.exitCode=code??1;if(code===0)console.log(`Created synthetic video: ${output}`);});
