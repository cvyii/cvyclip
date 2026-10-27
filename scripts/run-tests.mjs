import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const root=resolve('.test-tmp');await mkdir(root,{recursive:true});
const processUnderTest=spawn(process.execPath,['--test','tests/*.test.mjs'],{stdio:'inherit',env:{...process.env,TEMP:root,TMP:root,TMPDIR:root}});
processUnderTest.on('exit',code=>{process.exitCode=code??1;});
