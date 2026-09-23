import test from 'node:test';
import assert from 'node:assert/strict';
import {requestRecovery,completeRecovery,checkRecovery} from '../src/password-recovery.mjs';
import {recoveryMailer} from '../src/recovery-mail.mjs';
import {createApp} from '../src/application.mjs';
function fixture(){const db={users:[{id:'admin',email:'admin@ifpr.edu.br',active:true,role:'ADMIN',hash:'old',salt:'old'},{id:'disabled',email:'disabled@ifpr.edu.br',active:false,hash:'old'}],sessions:[{userId:'admin'},{userId:'other'}],invitations:[{userId:'admin',revoked:false}],audit:[],campuses:[{name:'Reitoria'}],calendars:[{id:'keep'}]};return {db,store:{read:async()=>structuredClone(db),change:async fn=>fn(db)}};}
test('recovery expires, is single-use, revokes sessions and preserves account scope and calendars',async()=>{
 const {db,store}=fixture();let message;await requestRecovery(store,'ADMIN@ifpr.edu.br','https://calendar.example',async m=>message=m,1000);
 const token=new URL(message.url).hash.split('=')[1];assert(!JSON.stringify(db).includes(token));
 assert.throws(()=>checkRecovery(db,token,1801000));checkRecovery(db,token,1001);
 completeRecovery(db,token,{hash:'new',salt:'new'},1002);assert.throws(()=>completeRecovery(db,token,{},1003));
 assert.equal(db.users[0].role,'ADMIN');assert.equal(db.users[0].hash,'new');assert.equal(db.users[1].active,false);
 assert.deepEqual(db.sessions,[{userId:'other'}]);assert.equal(db.invitations[0].revoked,true);assert.deepEqual(db.calendars,[{id:'keep'}]);
});
test('disabled and unknown accounts receive no token; rate limits persist; failed mail revokes token',async()=>{
 const {db,store}=fixture();let sent=0;const mail=async()=>sent++;
 await requestRecovery(store,'disabled@ifpr.edu.br','https://calendar.example',mail,1000);
 await requestRecovery(store,'unknown@ifpr.edu.br','https://calendar.example',mail,1000);assert.equal(sent,0);
 for(let i=0;i<4;i++)await requestRecovery(store,'admin@ifpr.edu.br','https://calendar.example',mail,1000);assert.equal(sent,3);
 await assert.rejects(requestRecovery(store,'admin@ifpr.edu.br','https://calendar.example',null),{status:503});
 const other=fixture();await requestRecovery(other.store,'admin@ifpr.edu.br','https://calendar.example',async()=>{throw Error('private provider detail');},1000);assert.equal(other.db.passwordResets.length,0);
});
test('disabled account cannot redeem an already issued link',async()=>{const {db,store}=fixture();let token;await requestRecovery(store,'admin@ifpr.edu.br','https://calendar.example',async m=>token=new URL(m.url).hash.split('=')[1]);db.users[0].active=false;assert.throws(()=>completeRecovery(db,token,{}));});
test('mail adapter requires configuration and fails closed on provider rejection',async()=>{
 assert.equal(recoveryMailer({}),null);let body;
 const mail=recoveryMailer({RESEND_API_KEY:'synthetic',DENTEC_MAIL_FROM:'test@example.org'},async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');body=JSON.parse(options.body);return {ok:false};});
 await assert.rejects(mail({to:'test@ifpr.edu.br',url:'https://calendar.example/recuperar-senha#token=synthetic'}));assert.deepEqual(body.to,['test@ifpr.edu.br']);
});
test('HTTP recovery rejects replay, invalid passwords and cross-origin calls; old login stops working',async t=>{
 const {store}=fixture();await store.change(db=>{db.users=[];});let sent;
 const app=await createApp({store,setupCode:'synthetic',recoveryMail:async m=>sent=m});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const base='http://127.0.0.1:'+app.server.address().port;
 const call=async(path,body,headers={})=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Dentec-Request':'1',...headers},body:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};};
 const email='admin@ifpr.edu.br',password='synthetic-password-old';await call('/api/setup',{code:'synthetic',name:'Admin test',email,password});
 const login=await call('/api/login',{email,password});assert.equal(login.status,200);
 assert.equal((await call('/api/password/request',{email},{Origin:'https://evil.example'})).status,403);
 const known=await call('/api/password/request',{email}),unknown=await call('/api/password/request',{email:'unknown@ifpr.edu.br'});assert.deepEqual(known.data,unknown.data);
 const token=new URL(sent.url).hash.split('=')[1];assert.equal((await call('/api/password/reset',{token,password:'short'})).status,400);
 assert.equal((await call('/api/password/reset',{token,password:'synthetic-password-new'})).status,200);
 assert.equal((await call('/api/password/reset',{token,password:'synthetic-password-new'})).status,400);
 assert.equal((await call('/api/login',{email,password})).status,401);assert.equal((await call('/api/login',{email,password:'synthetic-password-new'})).status,200);
 const status=await fetch(base+'/api/status',{headers:{Cookie:login.cookie.split(';')[0]}});assert.equal((await status.json()).user,null);
 assert.match(await (await fetch(base+'/')).text(),/Recuperar senha/);
});
