import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {AppError} from './domain.mjs';

export function createAuth(config){
  const sessions=new Map(),attempts=new Map(),salt=randomBytes(16);
  const digest=scryptSync(config.workspacePassword||randomBytes(32).toString('hex'),salt,32);
  const cookieName='cvy_session',ttl=(config.sessionHours||12)*3600000;
  const hash=value=>createHash('sha256').update(value).digest('hex');
  function getSession(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!token||token.length>200)return null;const id=hash(token),session=sessions.get(id);if(!session)return null;if(session.expires<Date.now()){sessions.delete(id);return null;}return {...session,id};}
  function origin(req,_res,next){
    const protocol=config.secureCookies?'https':'http';const expected=config.publicOrigin||`${protocol}://${req.get('host')}`;
    if(req.get('origin')!==expected)return next(new AppError('This request did not come from your CvyClip workspace.',403,'invalid_origin'));next();
  }
  function requireSession(req,_res,next){const session=getSession(req);if(!session)return next(new AppError('Sign in to your workspace to continue.',401,'sign_in_required'));req.session=session;next();}
  function csrf(req,_res,next){if(!req.session||req.get('x-csrf-token')!==req.session.csrfToken)return next(new AppError('Your session changed. Reload and try again.',403,'invalid_csrf'));next();}
  function setCookie(res,token,maxAge){res.cookie(cookieName,token,{httpOnly:true,secure:!!config.secureCookies,sameSite:'strict',path:'/',maxAge});}
  function login(req,res,next){
    try{
      if((config.workspacePassword||'').length<12)throw new AppError('Workspace setup is not complete. Configure a password of at least 12 characters.',503,'setup_required');
      const now=Date.now(),client=req.ip||req.socket.remoteAddress||'unknown';
      for(const [key,value]of attempts)if(value.expires<now)attempts.delete(key);
      const state=attempts.get(client)||{count:0,expires:now+15*60000};
      if(state.count>=10)throw new AppError('Too many attempts. Try again in 15 minutes.',429,'rate_limited');
      state.count++;attempts.set(client,state);
      const password=req.body?.password;
      if(typeof password!=='string'||password.length>512||!timingSafeEqual(scryptSync(password,salt,32),digest))throw new AppError('That workspace password is not correct.',401,'invalid_password');
      attempts.delete(client);const token=randomBytes(32).toString('hex'),csrfToken=randomBytes(24).toString('hex');
      for(const [key,value]of sessions)if(value.expires<now)sessions.delete(key);
      sessions.set(hash(token),{csrfToken,expires:now+ttl});setCookie(res,token,ttl);res.json({signedIn:true,csrfToken});
    }catch(e){next(e);}
  }
  return {origin,requireSession,csrf,login,getSession,logout(req,res){sessions.delete(req.session.id);setCookie(res,'',0);res.json({signedIn:false});}};
}
