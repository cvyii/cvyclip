import {mkdir,readFile,writeFile,rename,stat,readdir,copyFile,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,join,dirname,sep,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AppError} from './domain.mjs';

const locks=new Map();
const contentType=key=>({'.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.json':'application/json','.srt':'application/x-subrip'}[extname(key)]||'application/octet-stream');
export function safeKey(key){
  if(typeof key!=='string'||!key||key.startsWith('/')||key.includes('\\')||key.split('/').some(p=>p==='..'||p==='.')||!/^[A-Za-z0-9_./-]+$/.test(key))throw new AppError('Invalid storage path.');
  return key;
}
async function serialized(key,fn){const previous=locks.get(key)||Promise.resolve();let release;const pending=new Promise(r=>{release=r;});locks.set(key,pending);await previous;try{return await fn();}finally{release();if(locks.get(key)===pending)locks.delete(key);}}

export async function createStore(config){
  if(config.azureStorageConnectionString||config.azureStorageUrl)return azureStore(config);
  const root=resolve(config.dataDir);await mkdir(root,{recursive:true});
  const file=key=>{safeKey(key);const path=resolve(root,key);if(!path.startsWith(root+sep))throw new AppError('Invalid storage path.');return path;};
  async function readJson(key){try{return JSON.parse(await readFile(file(key),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async function writeJson(key,value){const path=file(key);await mkdir(dirname(path),{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(value));await rename(temp,path);}finally{await rm(temp,{force:true});}return value;}
  async function list(prefix){safeKey(prefix);const result=[];async function walk(path,key){let entries;try{entries=await readdir(path,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}for(const entry of entries){const childKey=key+entry.name;if(entry.isDirectory())await walk(join(path,entry.name),childKey+'/');else if(entry.isFile()&&!entry.name.endsWith('.tmp')&&childKey.startsWith(prefix))result.push(childKey);}}await walk(root,'');return result;}
  return {
    kind:'local',readJson,writeJson,
    updateJson:(key,updater)=>serialized(root+'|'+safeKey(key),async()=>writeJson(key,await updater(await readJson(key)))),
    async putFile(key,source){const path=file(key);await mkdir(dirname(path),{recursive:true});await copyFile(source,path);},
    async getFile(key,destination){await mkdir(dirname(destination),{recursive:true});await copyFile(file(key),destination);return destination;},
    async stat(key){try{const s=await stat(file(key));return {size:s.size,contentType:contentType(key)};}catch(e){if(e.code==='ENOENT')return null;throw e;}},
    async openRead(key,range={}){return createReadStream(file(key),range);},list,
    async remove(key){const path=file(key);await rm(path,{recursive:key.endsWith('/'),force:true});}
  };
}
async function azureStore(config){
  const {BlobServiceClient}=await import('@azure/storage-blob');
  let service;
  if(config.azureStorageConnectionString)service=BlobServiceClient.fromConnectionString(config.azureStorageConnectionString);
  else {const {DefaultAzureCredential}=await import('@azure/identity');service=new BlobServiceClient(config.azureStorageUrl,new DefaultAzureCredential());}
  const container=service.getContainerClient(config.azureStorageContainer||'cvyclip-private');await container.createIfNotExists();
  const blob=key=>container.getBlockBlobClient(safeKey(key));
  async function readVersion(key){try{const response=await blob(key).download();let size=0;const chunks=[];for await(const chunk of response.readableStreamBody){size+=chunk.length;if(size>4*1024*1024)throw new AppError('Project metadata is too large.');chunks.push(chunk);}return {value:JSON.parse(Buffer.concat(chunks).toString('utf8')),etag:response.etag};}catch(e){if(e.statusCode===404)return {value:null,etag:null};throw e;}}
  async function writeJson(key,value,conditions){const body=Buffer.from(JSON.stringify(value));await blob(key).uploadData(body,{blobHTTPHeaders:{blobContentType:'application/json'},conditions});return value;}
  return {
    kind:'azure',readJson:async key=>(await readVersion(key)).value,writeJson,
    async updateJson(key,updater){for(let attempt=0;attempt<12;attempt++){const {value,etag}=await readVersion(key);const next=await updater(value);try{return await writeJson(key,next,etag?{ifMatch:etag}:{ifNoneMatch:'*'});}catch(e){if(e.statusCode!==412&&e.statusCode!==409)throw e;await new Promise(r=>setTimeout(r,20+Math.random()*50));}}throw new AppError('Storage is busy. Try again.',503,'storage_busy');},
    async putFile(key,source,type){await blob(key).uploadFile(source,{blobHTTPHeaders:{blobContentType:type||contentType(key)}});},
    async getFile(key,destination){await mkdir(dirname(destination),{recursive:true});await blob(key).downloadToFile(destination);return destination;},
    async stat(key){try{const p=await blob(key).getProperties();return {size:p.contentLength,contentType:p.contentType};}catch(e){if(e.statusCode===404)return null;throw e;}},
    async openRead(key,{start=0,end}={}){const response=await blob(key).download(start,end===undefined?undefined:end-start+1);return response.readableStreamBody;},
    async list(prefix){safeKey(prefix);const keys=[];for await(const b of container.listBlobsFlat({prefix}))keys.push(b.name);return keys;},
    async remove(key){if(key.endsWith('/')){for await(const b of container.listBlobsFlat({prefix:safeKey(key)}))await container.deleteBlob(b.name);}else await blob(key).deleteIfExists();}
  };
}
