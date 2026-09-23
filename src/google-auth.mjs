import {randomBytes,createHash,createPublicKey,verify} from 'node:crypto';
const DOMAIN='ifpr.edu.br';
const reject=()=>{throw Object.assign(Error('Não foi possível validar o acesso Google institucional.'),{status:403});};
export function googleConfiguration(env=process.env){
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return null;
 const origin=new URL(env.DENTEC_PUBLIC_URL||'http://127.0.0.1:4173');
 if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname))))throw Error('DENTEC_PUBLIC_URL deve ser uma origem HTTPS ou localhost para testes.');
 return {clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,origin:origin.origin,redirectUri:origin.origin+'/api/google/callback'};
}
export function verifyGoogleToken(token,keys,config,nonce,now=Date.now()){
 try{
  if(typeof token!=='string'||token.length>20000)reject();const parts=token.split('.');if(parts.length!==3)reject();
  const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  if(header.alg!=='RS256'||typeof header.kid!=='string')reject();
  const jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));if(!jwk)reject();
  if(!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))reject();
  if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.aud!==config.clientId||(claims.azp&&claims.azp!==config.clientId))reject();
  if(!Number.isFinite(claims.exp)||claims.exp<=now/1000||!Number.isFinite(claims.iat)||claims.iat>now/1000+60||claims.nonce!==nonce)reject();
  if(claims.email_verified!==true||claims.hd!==DOMAIN||typeof claims.email!=='string'||!new RegExp('^[^\\s@]+@ifpr\\.edu\\.br$','i').test(claims.email)||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255)reject();
  return {email:claims.email.toLowerCase(),subject:claims.sub};
 }catch{reject();}
}
export function createGoogleAuth(config,{fetcher=fetch,now=()=>Date.now()}={}){
 const pending=new Map();const random=()=>randomBytes(32).toString('base64url');
 return {enabled:!!config,config,
  begin(){
   if(!config)throw Object.assign(Error('Login Google aguardando configuração institucional.'),{status:503});
   for(const [key,value]of pending)if(value.expires<now())pending.delete(key);if(pending.size>=1000)throw Object.assign(Error('Muitas solicitações de acesso. Tente novamente.'),{status:429});
   const state=random(),binding=random(),nonce=random(),verifier=random();pending.set(state,{binding,nonce,verifier,expires:now()+600000});
   const params=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:'openid email',hd:DOMAIN,prompt:'select_account',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
   return {binding,url:'https://accounts.google.com/o/oauth2/v2/auth?'+params};
  },
  async finish({state,code,binding}){
   const transaction=pending.get(state);if(!config||!transaction||transaction.expires<now()||transaction.binding!==binding||typeof code!=='string'||!code||code.length>4000)reject();pending.delete(state);
   const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,grant_type:'authorization_code',code_verifier:transaction.verifier}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)reject();const tokens=await response.json();
   const keyResponse=await fetcher('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(10000)});if(!keyResponse.ok)reject();const {keys}=await keyResponse.json();if(!Array.isArray(keys))reject();
   return verifyGoogleToken(tokens.id_token,keys,config,transaction.nonce,now());
  }
 };
}
export async function authorizeGoogleUser(store,identity){
 return store.change(db=>{
  const user=db.users.find(u=>u.active&&u.email===identity.email);
  if(!user||!['ADMIN','CAMPUS'].includes(user.role)||(user.googleSubject&&user.googleSubject!==identity.subject)||(user.role==='CAMPUS'&&!db.campuses.some(c=>c.id===user.campusId)))reject();
  if(db.users.some(u=>u.id!==user.id&&u.googleSubject===identity.subject))reject();
  user.googleSubject=identity.subject;user.googleLastLoginAt=new Date().toISOString();
  db.audit.push({at:user.googleLastLoginAt,actor:user.id,action:'GOOGLE_LOGIN',id:user.id});
  return {id:user.id,name:user.name,email:user.email,role:user.role,campusId:user.campusId};
 });
}
