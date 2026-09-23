import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/application.mjs';
test('trash enforces campus boundaries, stale version checks, hides records and restores all content',async t=>{
 const app=await createApp({directory:await mkdtemp(join(tmpdir(),'dentec-trash-')),setupCode:'test'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const base='http://127.0.0.1:'+app.server.address().port;
 async function call(path,method='GET',body,cookie=''){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Dentec-Request':'1',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const password='synthetic-password-123';await call('/api/setup','POST',{code:'test',name:'Admin',email:'admin@ifpr.edu.br',password});const admin=(await call('/api/login','POST',{email:'admin@ifpr.edu.br',password})).cookie;
 const info=(await call('/api/bootstrap','GET',null,admin)).data;let cookies=[];
 for(let i=0;i<2;i++){await call('/api/users','POST',{name:'Campus',email:`campus${i}@ifpr.edu.br`,password,campusId:info.campuses[i].id},admin);cookies.push((await call('/api/login','POST',{email:`campus${i}@ifpr.edu.br`,password})).cookie);}
 const c=(await call('/api/calendars','POST',{campusId:info.campuses[0].id,courses:'Test',year:2027,offer:'integrado',regime:'anual',purpose:'test'},cookies[0])).data;
 await app.store.change(db=>{db.histories.push({id:'history-test',calendarId:c.id,campusId:c.campusId,filename:'test.pdf',data:'JVBERi0='});db.reviews=[{calendarId:c.id,revision:1}];});
 const before=await app.store.read();
 assert.equal((await call('/api/calendars/'+c.id,'DELETE',{version:1})).status,401);
 assert.equal((await call('/api/calendars/'+c.id,'DELETE',{version:1},cookies[1])).status,404);
 assert.equal((await call('/api/calendars/'+c.id,'DELETE',{version:0},cookies[0])).status,409);
 assert.equal((await call('/api/calendars/'+c.id,'DELETE',{version:1},cookies[0])).status,200);
 for(const path of ['/api/calendars/'+c.id,'/api/reviews/'+c.id,'/api/history/history-test'])assert.equal((await call(path,'GET',null,admin)).status,404);
 assert.equal((await call('/api/bootstrap','GET',null,admin)).data.calendars.length,0);
 assert.equal((await call('/api/calendar-trash','GET',null,cookies[1])).data.calendars.length,0);
 assert.equal((await call('/api/calendar-trash','GET',null,cookies[0])).data.calendars.length,1);
 assert.equal((await call('/api/calendars/'+c.id+'/restore','POST',{},cookies[1])).status,404);
 assert.equal((await call('/api/calendars/'+c.id+'/restore','POST',{},admin)).status,200);
 const after=await app.store.read();assert.deepEqual(after.calendars,before.calendars);assert.deepEqual(after.histories,before.histories);assert.deepEqual(after.reviews,before.reviews);
 assert.equal((await call('/api/bootstrap','GET',null,cookies[0])).data.calendars.length,1);
 assert.equal((await call('/api/calendars/'+c.id,'DELETE',{version:1},admin)).status,200);
 assert.equal((await call('/api/calendars/'+c.id+'/restore','POST',{},cookies[0])).status,200);
});
