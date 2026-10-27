import {mkdir,writeFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
const image=process.argv[2];
if(!/^ghcr\.io\/cvyii\/cvyclip(?:@sha256:[a-f0-9]{64}|:sha-[a-f0-9]{40})$/.test(image||''))throw new Error('Supply the verified CvyClip image digest or commit tag.');
if(!process.env.OPENAI_API_KEY||(process.env.WORKSPACE_PASSWORD||'').length<12)throw new Error('Save the private OpenAI key and a workspace password of at least 12 characters first.');
const directory=resolve('.cvyclip-data');await mkdir(directory,{recursive:true});if((await lstat(directory)).isSymbolicLink())throw new Error('The local configuration directory cannot be a link.');
const output=resolve(directory,'azure-parameters.json');
try{if((await lstat(output)).isSymbolicLink())throw new Error('The deployment settings file cannot be a link.');}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(output,JSON.stringify({$schema:'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',contentVersion:'1.0.0.0',parameters:{image:{value:image},openaiApiKey:{value:process.env.OPENAI_API_KEY},workspacePassword:{value:process.env.WORKSPACE_PASSWORD}}}),{mode:0o600});
console.log('Private deployment parameters saved to .cvyclip-data/azure-parameters.json. Delete this file immediately after deployment.');
