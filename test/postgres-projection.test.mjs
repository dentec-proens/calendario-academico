import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {openPostgresStore} from '../src/postgres-store.mjs';
import {createApp} from '../src/application.mjs';
import {statePatches,selectState} from '../src/postgres-projection.mjs';

test('scoped projections bind only parameters present in the SQL query',()=>{
 for(const fields of [['users'],['sessions'],['catalogue'],['histories'],['reviews'],['calendars']])for(const full of [false,true]){
  const query=selectState({fields,campusId:'campus1',calendarId:'c1',full});
  const used=[...query.text.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));
  assert.equal(Math.max(0,...used),query.values.length,JSON.stringify({fields,full}));
  for(let i=1;i<=query.values.length;i++)assert(used.includes(i),`unused parameter ${i}: ${query.text}`);
 }
});

async function fixture(t){
 const pg=new PGlite();await pg.waitReady;t.after(()=>pg.close());let queue=Promise.resolve();
 const measurements=[];
 const query=async(text,values=[])=>{const result=await pg.query(text,values);measurements.push({text,received:Buffer.byteLength(JSON.stringify(result.rows)),sent:Buffer.byteLength(JSON.stringify(values))});return result;};
 const pool={query,async connect(){let release;const prior=queue;queue=new Promise(r=>release=r);await prior;return {query,release};}};
 const store=await openPostgresStore('postgres://unused',{pool});return {pg,store,measurements};
}

test('SQL projections and delta writes preserve every old snapshot, including unknown fields and PDF data',async t=>{
 const {pg,store,measurements}=await fixture(t);
 const original={users:[{id:'u1',email:'one@ifpr.edu.br',active:true}],sessions:[{id:'hash',userId:'u1',expires:9999999999999}],campuses:[],histories:[{id:'h1',calendarId:'c1',campusId:'campus1',data:'PDF-ORIGINAL'}],audit:[],catalogue:{revision:1,events:[]},calendars:[1,2].map(n=>({id:'c'+n,campusId:'campus'+n,state:{year:2027,offer:'integrado',events:[]},version:41,versions:Array.from({length:40},(_,i)=>({version:i+1,at:'2026-10-19',state:{secret:'snapshot-'+n+'-'+i,description:'x'.repeat(20000)},unknown:{retain:true}}))})),futureData:{retain:true}};
 await pg.query('UPDATE dentec_private.app_state SET payload=$1::jsonb WHERE id=1',[JSON.stringify(original)]);
 const read=await store.read({fields:['calendars','histories'],calendarId:'c1',campusId:'campus1'});
 assert.equal(read.calendars.length,1);assert.equal(read.calendars[0].versions.length,40);assert.equal(read.calendars[0].versions[0].state,undefined);assert.equal(read.histories[0].data,'PDF-ORIGINAL');assert.equal(read.users,undefined);
 assert.deepEqual((await store.read({fields:['sessions'],sessionHash:'hash'})).sessions,original.sessions);
 assert.equal((await store.read({fields:['users'],email:"' OR true --"})).users.length,0);
 assert.equal((await store.read({fields:['calendars'],calendarId:'c2',campusId:'campus1'})).calendars.length,0);
 const snapshot={version:41,state:{description:'preserved new version'},at:'2026-10-19'};
 measurements.length=0;
 await store.change(db=>{db.calendars[0].versions.push(snapshot);db.calendars[0].version=42;db.calendars[0].state.events.push({id:'new-event'});db.audit.push({action:'SAVE'});});
 const transferred=measurements.reduce((sum,m)=>sum+m.received+m.sent,0),fullBytes=Buffer.byteLength(JSON.stringify(original));
 assert(transferred<fullBytes/20,`Expected >95% reduction: ${transferred}/${fullBytes}`);
 t.diagnostic(`Synthetic save: ${transferred} bytes transferred versus ${fullBytes} bytes for one complete read (>95% reduction).`);
 const saved=(await store.read({full:true}));
 assert.deepEqual(saved.calendars[0].versions,[...original.calendars[0].versions,snapshot]);
 assert.deepEqual(saved.calendars[1],original.calendars[1]);assert.deepEqual(saved.histories,original.histories);assert.deepEqual(saved.futureData,original.futureData);
 await store.change(db=>{assert.equal(db.calendars.length,1);assert.equal(db.calendars[0].id,'c2');db.calendars[0].version++;db.calendars[0].versions.push(snapshot);},{fields:['calendars'],calendarId:'c2'});
 const scoped=await store.read({full:true});assert.deepEqual(scoped.calendars[0],saved.calendars[0]);assert.deepEqual(scoped.calendars[1].versions,[...original.calendars[1].versions,snapshot]);
 await assert.rejects(store.change(db=>{db.calendars[0].versions=[];}),/histórico/);
 await assert.rejects(store.change(db=>{db.calendars.pop();}),/preservados/);
 assert.deepEqual((await store.read({full:true})).calendars,scoped.calendars);
 await Promise.all(Array.from({length:6},()=>store.change(db=>{db.counter=(db.counter||0)+1;})));
 assert.equal((await store.read({fields:['counter']})).counter,6);
 await store.change(db=>{db.futureData=undefined;db.calendars[0].state.optional=undefined;});
 const cleared=await store.read({full:true});assert.equal(cleared.futureData,undefined);assert.equal(cleared.calendars[0].versions.length,41);
 await assert.rejects(store.change(db=>{db.counter=999;throw Error('rollback');}));
 assert.equal((await store.read({fields:['counter']})).counter,6);
 assert.throws(()=>statePatches([{versions:[{version:1}]}],[{versions:[]}]),/histórico/);
});

test('HTTP with PostgreSQL projections: login, campus isolation, save, reopen and complete history preservation',async t=>{
 const {store,measurements}=await fixture(t),app=await createApp({store,setupCode:'synthetic'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const call=async(path,method='GET',body,cookie='')=>{const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Dentec-Request':'1',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};};
 await call('/api/setup','POST',{code:'synthetic',name:'Synthetic',email:'admin@ifpr.edu.br',password:'synthetic-test-only-password'});
 const admin=(await call('/api/login','POST',{email:'admin@ifpr.edu.br',password:'synthetic-test-only-password'})).cookie;
 const campuses=(await call('/api/bootstrap','GET',null,admin)).data.campuses;
 for(let i=0;i<2;i++)await call('/api/users','POST',{name:'Campus '+i,email:`campus${i}@ifpr.edu.br`,password:'synthetic-test-only-password',campusId:campuses[i].id},admin);
 const own=(await call('/api/login','POST',{email:'campus0@ifpr.edu.br',password:'synthetic-test-only-password'})).cookie;
 const other=(await call('/api/login','POST',{email:'campus1@ifpr.edu.br',password:'synthetic-test-only-password'})).cookie;
 assert.equal((await call('/api/status','GET',null,own)).status,200);
 assert.equal((await call('/api/status','GET',null,other)).status,200);
 const created=await call('/api/calendars','POST',{campusId:campuses[0].id,year:2027,offer:'integrado',regime:'anual',courses:'Synthetic',purpose:'test'},own);assert.equal(created.status,201);
 const id=created.data.id,path='/api/calendars/'+id;
 assert.equal((await call(path,'GET',null,other)).status,404);
 let opened=await call(path,'GET',null,own);assert.equal(opened.status,200);
 const state={...opened.data.state,weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Synthetic decision'};
 const saved=await call(path,'PUT',{version:opened.data.version,catalogueRevision:opened.data.catalogueRevision,state},own);assert.equal(saved.status,200);
 assert.equal((await call(path,'PUT',{version:opened.data.version,catalogueRevision:opened.data.catalogueRevision,state},own)).status,409);
 opened=await call(path,'GET',null,own);assert.equal(opened.data.state.weekConfirmed,true);assert.equal(opened.data.versions.length,1);
 const full=await store.read({full:true});assert.equal(full.calendars[0].versions[0].state.weekConfirmed,false);
 const listed=await call('/api/bootstrap','GET',null,own);assert.equal(listed.data.calendars[0].year,2027);assert.equal(listed.data.calendars.length,1);
 assert.equal((await call('/api/bootstrap','GET',null,other)).data.calendars.length,0);
 assert(measurements.some(m=>m.text.includes("s->>'id'=")));assert(measurements.some(m=>m.text.includes("c->>'campusId'=")));
 await call('/api/logout','POST',{},own);assert.equal((await call(path,'GET',null,own)).status,401);
});
