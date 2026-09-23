import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/application.mjs';

test('direct uploads bind to owner and purpose, consume once, keep files private and check download authorization',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'dentec-cloud-files-')),bytes=Buffer.from('%PDF-1.4 synthetic'),objects=new Map();
 const files={uploadUrl:async path=>{objects.set(path,bytes);return 'https://example.invalid/upload';},read:async path=>objects.get(path),signed:async()=> 'https://example.invalid/download'};
 const app=await createApp({directory,files,setupCode:'fixture',setupEmail:'admin@ifpr.edu.br'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const base=`http://127.0.0.1:${app.server.address().port}`;
 async function call(path,body,cookie){const r=await fetch(base+path,{method:body?'POST':'GET',redirect:'manual',headers:{'Content-Type':'application/json','X-Dentec-Request':'1',Cookie:cookie||''},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.status===302?null:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],location:r.headers.get('location')};}
 assert.equal((await call('/api/setup',{code:'fixture',name:'Wrong',email:'wrong@ifpr.edu.br',password:'synthetic-only-password'})).status,403);
 await call('/api/setup',{code:'fixture',name:'Admin',email:'admin@ifpr.edu.br',password:'synthetic-only-password'});
 const admin=(await call('/api/login',{email:'admin@ifpr.edu.br',password:'synthetic-only-password'})).cookie;
 const campusId=(await call('/api/bootstrap',null,admin)).data.campuses[0].id;
 await call('/api/users',{name:'Campus',email:'campus@ifpr.edu.br',password:'synthetic-only-password',campusId},admin);
 const campus=(await call('/api/login',{email:'campus@ifpr.edu.br',password:'synthetic-only-password'})).cookie;
 const ticketBody={filename:'fixture.pdf',size:bytes.length,purpose:'document'};
 assert.equal((await call('/api/upload-ticket',ticketBody)).status,401);assert.equal((await call('/api/upload-ticket',ticketBody,campus)).status,403);
 const ticket=(await call('/api/upload-ticket',ticketBody,admin)).data;
 const body={filename:'fixture.pdf',year:2028,type:'norma',title:'Fixture',source:'Synthetic',uploadId:ticket.id};
 assert.equal((await call('/api/documents',body,campus)).status,403);
 assert.equal((await call('/api/documents',{...body,filename:'different.pdf'},admin)).status,400);
 const created=await call('/api/documents',body,admin);assert.equal(created.status,201);
 assert.equal((await call('/api/documents',body,admin)).status,400);
 const saved=app.store.read().documents[0];assert(!saved.data);assert(saved.objectKey);assert.equal(app.store.read().uploads.length,0);
 assert.equal((await call('/api/documents/'+saved.id,null,campus)).status,404);
 const download=await call('/api/documents/'+saved.id,null,admin);assert.equal(download.status,302);assert.equal(download.location,'https://example.invalid/download');
 await call('/api/documents/'+saved.id+'/status',{revision:1,status:'vigente',confirmed:true},admin);
 assert.equal((await call('/api/documents/'+saved.id,null,campus)).status,302);
 const bad=(await call('/api/upload-ticket',ticketBody,admin)).data;const raw=app.store.read().uploads.find(x=>x.id===bad.id);objects.set(raw.path,Buffer.from('invalid'));
 assert.equal((await call('/api/documents',{...body,uploadId:bad.id},admin)).status,400);
});
