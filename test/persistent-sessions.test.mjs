import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase,createTestApp} from './helpers/database.mjs';

test('login survives application recreation and logout revokes the persisted session',async t=>{
 const database=await createTestDatabase(t);let app;
 const start=async()=>{app=await createTestApp(t,{store:await database.reopen(),setupCode:'synthetic'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${app.server.address().port}`;};
 const stop=()=>new Promise(r=>app.server.close(r));t.after(stop);let base=await start();
 const request=(path,body,cookie)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Dentec-Request':'1',Cookie:cookie||''},body:body?JSON.stringify(body):undefined});
 await request('/api/setup',{code:'synthetic',name:'Synthetic admin',email:'session@ifpr.edu.br',password:'synthetic-password-only'});
 const response=await request('/api/login',{email:'session@ifpr.edu.br',password:'synthetic-password-only'}),cookie=response.headers.get('set-cookie').split(';')[0];
 const db=(await (await database.reopen()).read({full:true}));assert.equal(db.sessions.length,1);assert(!JSON.stringify(db).includes(cookie.split('=')[1]));
 await stop();base=await start();assert.equal((await request('/api/bootstrap',null,cookie)).status,200);
 assert.equal((await request('/api/logout',{},cookie)).status,200);assert.equal((await request('/api/bootstrap',null,cookie)).status,401);
});
