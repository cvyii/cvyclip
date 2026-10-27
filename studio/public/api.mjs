let csrfToken='';
export function setSession(session){csrfToken=session?.csrfToken||'';}
export class ApiError extends Error{constructor(message,status,code){super(message);this.status=status;this.code=code;}}
async function decode(response){let body;try{body=await response.json();}catch{throw new ApiError('The server did not return a valid response. Reload and try again.',response.status);}if(!response.ok)throw new ApiError(body.error?.message||'The request could not finish.',response.status,body.error?.code);return body;}
export async function request(path,{method='GET',body}={}){
  let response;try{response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(csrfToken?{'X-CSRF-Token':csrfToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new ApiError('Connection lost. Your saved work is still on the server. Try again.',0,'connection_lost');}return decode(response);
}
export function upload(file,onProgress){return new Promise((done,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST','/api/projects');xhr.setRequestHeader('X-CSRF-Token',csrfToken);xhr.responseType='json';xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total);};
  xhr.onerror=()=>reject(new ApiError('The upload was interrupted. Please try again.',0));xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)done(xhr.response);else reject(new ApiError(xhr.response?.error?.message||'The upload could not finish.',xhr.status,xhr.response?.error?.code));};
  const form=new FormData();form.append('video',file,file.name);xhr.send(form);
});}
