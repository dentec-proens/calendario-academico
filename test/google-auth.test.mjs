import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {googleConfiguration,createGoogleAuth,verifyGoogleToken} from '../src/google-auth.mjs';
import {createApp} from '../src/application.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
const config={clientId:'test-client',clientSecret:'test-secret',origin:'http://127.0.0.1:4173',redirectUri:'http://127.0.0.1:4173/api/google/callback'};
const now=Date.now();const claims={iss:'https://accounts.google.com',aud:config.clientId,iat:now/1000-10,exp:now/1000+3600,nonce:'nonce',sub:'subject',email:'invited@ifpr.edu.br',email_verified:true,hd:'ifpr.edu.br'};
function token(values){const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url'),b=Buffer.from(JSON.stringify(values)).toString('base64url'),s=sign('RSA-SHA256',Buffer.from(h+'.'+b),privateKey).toString('base64url');return h+'.'+b+'.'+s;}
test('Google tokens require signed institutional identity and correct audience, issuer, expiry and nonce',()=>{
 assert.equal(googleConfiguration({}),null);
 assert.throws(()=>googleConfiguration({GOOGLE_CLIENT_ID:'a',GOOGLE_CLIENT_SECRET:'b',DENTEC_PUBLIC_URL:'http://external.example'}));
 assert.equal(verifyGoogleToken(token(claims),[jwk],config,'nonce',now).email,'invited@ifpr.edu.br');
 for(const patch of [{email:'someone@gmail.com'},{email:'bad@ifpr.edu.br.evil'},{email_verified:false},{hd:undefined},{hd:'other.edu.br'},{aud:'attacker'},{iss:'https://evil.example'},{exp:now/1000-1},{nonce:'other'},{sub:''}])assert.throws(()=>verifyGoogleToken(token({...claims,...patch}),[jwk],config,'nonce',now));
 assert.throws(()=>verifyGoogleToken(token(claims).slice(0,-5)+'bogus',[jwk],config,'nonce',now));
});
test('Google flow binds the browser, uses PKCE, consumes state and preserves invited campus permissions',async t=>{
 let requestUrl,exchangeCount=0;
 const googleAuth=createGoogleAuth(config,{fetcher:async(url,options)=>{
  if(url.endsWith('/token')){exchangeCount++;const params=options.body;assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'),requestUrl.searchParams.get('code_challenge'));return {ok:true,json:async()=>({id_token:token({...claims,nonce:requestUrl.searchParams.get('nonce')})})};}
  return {ok:true,json:async()=>({keys:[jwk]})};
 }});
 const directory=await mkdtemp(join(tmpdir(),'dentec-google-test-')),app=await createApp({directory,setupCode:'test-code',googleAuth});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.server.close(resolve)));const base='http://127.0.0.1:'+app.server.address().port;
 async function call(path,method='GET',body,cookie=''){return fetch(base+path,{method,redirect:'manual',headers:{'Content-Type':'application/json','X-Dentec-Request':'1',Cookie:cookie},body:body?JSON.stringify(body):undefined});}
 await call('/api/setup','POST',{code:'test-code',name:'Test Admin',email:'admin@ifpr.edu.br',password:'Synthetic-google-test-password'});
 const login=await call('/api/login','POST',{email:'admin@ifpr.edu.br',password:'Synthetic-google-test-password'}),adminCookie=login.headers.get('set-cookie').split(';')[0];
 const start=await call('/api/google/start','POST',{});requestUrl=new URL((await start.json()).url);assert.equal(requestUrl.searchParams.get('scope'),'openid email');const binding=start.headers.get('set-cookie').split(';')[0];const callback='/api/google/callback?state='+requestUrl.searchParams.get('state')+'&code=test';
 const wrong=await call(callback,'GET',null,'dentec_google=wrong');assert.equal(wrong.headers.get('location'),'/?google_error=1');assert.equal(exchangeCount,0);
 const notInvited=await call(callback,'GET',null,binding);assert.equal(notInvited.headers.get('location'),'/?google_error=1');assert.equal(app.store.read().users.length,1);
 const campusId=app.store.read().campuses[0].id;
 const created=await call('/api/users','POST',{name:'Invited colleague',email:'invited@ifpr.edu.br',role:'CAMPUS',campusId,loginMethod:'google'},adminCookie);assert.equal(created.status,201);assert.equal((await created.json()).loginMethod,'google');
 assert.equal((await call('/api/login','POST',{email:'invited@ifpr.edu.br',password:'Synthetic-google-test-password'})).status,401);
 const retry=await call('/api/google/start','POST',{});requestUrl=new URL((await retry.json()).url);const callback2='/api/google/callback?state='+requestUrl.searchParams.get('state')+'&code=test2',binding2=retry.headers.get('set-cookie').split(';')[0];
 const success=await call(callback2,'GET',null,binding2);assert.equal(success.headers.get('location'),'/');const userCookie=success.headers.getSetCookie().find(s=>s.startsWith('dentec_session=')).split(';')[0];
 const panel=await(await call('/api/bootstrap','GET',null,userCookie)).json();assert.equal(panel.user.role,'CAMPUS');assert.equal(panel.campuses.length,1);assert.equal(panel.user.campusId,campusId);
 assert.equal((await call('/api/users','POST',{name:'Denied'},userCookie)).status,403);
 assert.equal((await call(callback2,'GET',null,binding2)).headers.get('location'),'/?google_error=1');
 await app.store.change(db=>{db.users.find(u=>u.email==='invited@ifpr.edu.br').googleSubject='different-subject';});
 const another=await call('/api/google/start','POST',{});requestUrl=new URL((await another.json()).url);assert.equal((await call('/api/google/callback?state='+requestUrl.searchParams.get('state')+'&code=test3','GET',null,another.headers.get('set-cookie').split(';')[0])).headers.get('location'),'/?google_error=1');
});
