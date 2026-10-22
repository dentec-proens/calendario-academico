import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {openPostgresStore} from '../src/postgres-store.mjs';

async function fixture(t,{seed=false}={}){
 const pg=new PGlite();await pg.waitReady;t.after(()=>pg.close());let queue=Promise.resolve();
 const acquire=async()=>{let release;const previous=queue;queue=new Promise(resolve=>{release=resolve;});await previous;return release;};
 const query=(text,values=[])=>pg.query(text,values);
 const pool={async query(text,values=[]){const release=await acquire();try{return await query(text,values);}finally{release();}},async connect(){const release=await acquire();return {query,release};}};
 const store=await openPostgresStore('postgres://isolated',{pool,initialize:true,seed});
 return {pg,pool,store};
}
const state=()=>({schemaVersion:1,year:2027,campus:'Campus',offer:'integrado',regime:'anual',weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Ata',modalities:['integrado','graduacao'],assessmentStagesByModality:{integrado:4,graduacao:2},teacherVacations:{firstStart:'2027-01-02',firstEnd:'2027-01-31',secondStart:undefined,evidence:'Portaria'},periods:[{id:'p',name:'Ano',start:'2027-02-01',end:'2027-12-17',targetDays:200}],events:[{id:'event',name:'Evento',start:'2027-05-01',end:'2027-05-01',kind:'exclude',evidence:'Lei',modalities:['integrado'],historicalSource:{historyId:'h',page:1,candidateKey:'candidate'},hours:3}],ignoredHistory:[],optional:undefined});
function graph(){
 const document={id:'d',year:2027,type:'norma',title:'Resolução',source:'SEI',filename:'norma.pdf',size:9,hash:'hash',status:'vigente',version:1,createdAt:'2026-10-22T12:00:00.000Z',createdBy:'u',objectKey:null};
 const snapshot={version:1,state:state(),at:'2026-10-21T12:00:00.000Z',catalogueRevision:1,institutionalEvents:[{id:'inst:1',name:'Feriado',offers:['integrado'],active:true}],documentSnapshot:[document],future:{retain:['exact',null,false,0]}};
 return {users:[{id:'u',name:'Admin',email:'admin@ifpr.edu.br',role:'ADMIN',campusId:null,active:true,salt:'salt',hash:'password-hash',googleSubject:'google-1'}],campuses:[{id:'campus-1',name:'Campus',archived:false}],calendars:[{id:'c1',campusId:'campus-1',state:state(),version:3,versions:[structuredClone(snapshot),structuredClone(snapshot)],catalogueRevision:1,documentSnapshot:[document],institutionalSnapshot:[],deletedAt:null}],histories:[{id:'h',calendarId:'c1',campusId:'campus-1',year:2026,data:Buffer.from('%PDF-test').toString('base64'),analysis:{version:2,pages:[{page:1,text:'Texto'}],candidates:[{page:1,name:'Nome',dates:{startDay:1,startMonth:5,raw:'1 de maio'},likelyLocal:true}],needsText:false,arbitrary:{confidence:0.5}}}],audit:[{at:'now',actor:'u',action:'IMPORT',id:'c1'},{at:'now',actor:'u',action:'IMPORT',id:'c1'}],catalogue:{revision:1,events:[{id:'holiday',name:'Feriado',start:'2027-05-01',end:'2027-05-01',offers:['integrado'],active:true}]},sessions:[{id:'s',userId:'u',expires:1234567890000}],invitations:[{tokenHash:'invitation',userId:'u',expiresAt:1234567890000,revoked:false}],passwordResets:[{hash:'reset',userId:'u',expires:1234567890000}],recoveryAttempts:[{key:'global',count:2,until:1234567890000}],uploads:[],documents:[{...document,data:Buffer.from('%PDF-test').toString('base64')}],reviews:[{calendarId:'c1',revision:2,entries:[{id:'I',status:'ATENDIDO',notes:'Conferido',reviewed:true}],reviewer:{id:'u',name:'Admin'},history:[{revision:1,entries:[{id:'I',status:'PENDENTE',notes:'',reviewed:false}],reviewer:{id:'u',name:'Admin'},documentSnapshot:[]}],conclusion:'Texto',officialApproval:false,documentSnapshot:[document]}],future:JSON.parse('{"__proto__":{"polluted":true},"constructor":{"retain":true},"nested":[{},[],null,0,false,""]}'),absentValue:undefined};
}

test('exact relational import/export preserves snapshots, bytes, extensions and missing/null shapes',async t=>{
 const {pg,store,pool}=await fixture(t),original=graph();
 assert.deepEqual(await store.exportState(),{});
 await store.importState(original);assert.deepEqual(await store.exportState(),original);
 assert.equal({}.polluted,undefined);
 const reopened=await openPostgresStore('postgres://isolated',{pool});assert.deepEqual(await reopened.exportState(),original);
 await assert.rejects(store.importState(original),/banco vazio/);
 const {rows}=await pg.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='dentec' AND data_type IN ('json','jsonb')");assert.deepEqual(rows,[]);
 assert.equal((await pg.query('SELECT count(*)::integer n FROM dentec.calendar_revisions')).rows[0].n,2);
 assert.equal((await pg.query('SELECT count(*)::integer n FROM dentec.calendar_periods')).rows[0].n,3);
 assert.equal((await pg.query('SELECT count(*)::integer n FROM dentec.review_entries')).rows[0].n,2);
 assert.equal((await pg.query('SELECT count(*)::integer n FROM dentec.history_pages')).rows[0].n,1);
 assert.equal((await pg.query('SELECT value FROM dentec.calendar_modalities ORDER BY _order LIMIT 1')).rows[0].value,'integrado');
 const security=await pg.query("SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='dentec' AND relkind='r'");assert(security.rows.every(r=>r.relrowsecurity));
});

test('scoped reads and delta changes preserve other entities and immutable complete histories',async t=>{
 const {store}=await fixture(t),original=graph();original.campuses.push({id:'campus-2',name:'Other'});original.calendars.push({...structuredClone(original.calendars[0]),id:'c2',campusId:'campus-2'});await store.importState(original);
 const scoped=await store.read({fields:['calendars','histories'],calendarId:'c1',campusId:'campus-1'});
 assert.equal(scoped.calendars.length,1);assert.deepEqual(scoped.calendars[0].versions,[{version:1,at:'2026-10-21T12:00:00.000Z',catalogueRevision:1},{version:1,at:'2026-10-21T12:00:00.000Z',catalogueRevision:1}]);
 assert.equal((await store.read({fields:['users'],email:"' OR true --"})).users.length,0);
 assert.equal((await store.read({fields:['calendars'],calendarId:'c1',campusId:'campus-2'})).calendars.length,0);
 await store.change(db=>{const c=db.calendars[0];c.versions.push({version:c.version,state:structuredClone(c.state),at:'2026-10-22'});c.version++;c.state.events[0].name='Mudou';db.audit.push({action:'SAVE',id:c.id});},{fields:['calendars','audit'],calendarId:'c1'});
 const after=await store.exportState();assert.deepEqual(after.calendars[1],original.calendars[1]);assert.deepEqual(after.calendars[0].versions.slice(0,2),original.calendars[0].versions);
 assert.equal(after.calendars[0].versions[2].state.events[0].name,'Evento');assert.equal(after.calendars[0].state.events[0].name,'Mudou');
 await assert.rejects(store.change(db=>{db.calendars[0].versions=[];},{fields:['calendars'],calendarId:'c1'}),/histórico/);
 await assert.rejects(store.change(db=>{db.calendars=[];},{fields:['calendars']}),/preservados/);
 await assert.rejects(store.change(db=>{delete db.calendars;},{fields:['calendars']}),/preservados/);
 await assert.rejects(store.change(db=>{delete db.audit;},{fields:['audit']}),/auditoria/);
 await assert.rejects(store.change(db=>{delete db.reviews;},{fields:['reviews']}),/pareceres/);
 const summary=(await store.read({fields:['calendars'],summary:true})).calendars[0];assert.deepEqual(summary.state,{year:2027,offer:'integrado',modalities:['integrado','graduacao'],campus:'Campus'});assert.equal(summary.versions,undefined);
 assert.deepEqual(await store.exportState(),after);
});

test('failed imports and mutations roll back, isolated SQL writers retain increments',async t=>{
 const {store}=await fixture(t);
 await assert.rejects(store.importState({users:[{id:'same'},{id:'same'}]}),/duplicado/);assert.deepEqual(await store.exportState(),{});
 await store.importState({counter:0,users:[{id:'user'}],sessions:[],audit:[]});
 await Promise.all(Array.from({length:12},()=>store.change(db=>{db.counter++;},{fields:['counter']})));
 assert.equal((await store.read()).counter,12);
 await assert.rejects(store.change(db=>{db.counter=900;throw Error('fixture rollback');}));assert.equal((await store.read()).counter,12);
 await store.change(db=>{db.sessions.push({id:'hash',userId:'user',expires:999});},{fields:['sessions']});
 await assert.rejects(store.change(db=>{delete db.sessions;},{fields:['sessions'],sessionHash:'missing'}),/coleção selecionada/);
 assert.deepEqual((await store.read({fields:['sessions'],sessionHash:'hash'})).sessions,[{id:'hash',userId:'user',expires:999}]);
});

test('runtime store requires an explicitly initialized PostgreSQL schema',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());const pool={query:(text,values)=>pg.query(text,values)};
 await assert.rejects(openPostgresStore('postgres://unused',{pool}),error=>error.code==='DENTEC_SCHEMA'&&/db:migrate/.test(error.message));
 assert.equal((await pg.query("SELECT to_regnamespace('dentec') schema")).rows[0].schema,null);
});


test('root array reorder persists and scoped writes preserve global ordering',async t=>{
 const {store}=await fixture(t);await store.importState({campuses:[{id:'a',name:'A'},{id:'b',name:'B'}],calendars:[{id:'first',campusId:'a',version:1,versions:[]},{id:'second',campusId:'b',version:1,versions:[]}],audit:[]});
 await store.change(db=>{db.campuses.reverse();},{fields:['campuses']});assert.deepEqual((await store.exportState()).campuses.map(c=>c.id),['b','a']);
 await store.change(db=>{db.calendars[0].version++;},{fields:['calendars'],calendarId:'second'});assert.deepEqual((await store.exportState()).calendars.map(c=>c.id),['first','second']);
 await assert.rejects(store.change(db=>{db.calendars.push({id:'third'});},{fields:['calendars'],calendarId:'second'}),/fora do calendário/);
 const preserved=await store.exportState();
 await assert.rejects(store.change(db=>{delete db.calendars;},{fields:['calendars'],calendarId:'missing'}),/preservados/);
 await assert.rejects(store.change(db=>{delete db.audit;},{fields:['audit']}),/auditoria/);
 assert.deepEqual(await store.exportState(),preserved);
});


test('scoped append-only audit buffers preserve earlier records without reading the audit relation',async t=>{
 const {store,pool}=await fixture(t);await store.importState({campuses:[{id:'campus'}],calendars:[{id:'one',campusId:'campus',version:1,versions:[]},{id:'two',campusId:'campus',version:1,versions:[]}],audit:[{action:'IMPORTED'}]});
 const statements=[],connect=pool.connect;pool.connect=async()=>{const client=await connect();return {...client,query:(sql,values)=>{statements.push(sql);return client.query(sql,values);}};};
 await Promise.all(['one','two'].map(calendarId=>store.change(db=>{assert.deepEqual(db.audit,[]);db.calendars[0].version++;db.audit.push({action:'SAVE',id:calendarId});},{fields:['calendars','audit'],calendarId,appendOnlyAudit:true})));
 assert.equal(statements.some(sql=>/SELECT.*FROM dentec\.audit/.test(sql)),false);
 assert.deepEqual((await store.exportState()).audit,[{action:'IMPORTED'},{action:'SAVE',id:'one'},{action:'SAVE',id:'two'}]);
 await store.change(db=>db.audit.push({action:'ORDINARY_APPEND'}),{fields:['audit']});assert.equal((await store.exportState()).audit.at(-1).action,'ORDINARY_APPEND');
 await assert.rejects(store.change(db=>{delete db.audit;},{fields:['audit'],appendOnlyAudit:true}),/auditoria/);
});
