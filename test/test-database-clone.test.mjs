import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createTestDatabase} from './helpers/database.mjs';
import {importHistorySql,stateHash} from '../src/database-transfer.mjs';
import {prepareTestClone,cloneTestDatabase} from '../scripts/lib/test-database-clone.mjs';

const sourceState=()=>({
 campuses:[{id:'second',name:'Second'},{id:'first',name:'First'}],
 users:[{id:'u',campusId:'first',email:'fixture@ifpr.edu.br',salt:'preserved',hash:'preserved-hash'}],
 calendars:[{id:'calendar',campusId:'first',version:3,state:{year:2027,weekdays:[1,3],events:[{id:'original',name:'Original'}]},versions:[{version:1,at:'same',state:{year:2027,events:[]}},{version:1,at:'same',state:{year:2027,events:[]}}]}],
 histories:[{id:'pdf',calendarId:'calendar',campusId:'first',objectKey:'uploads/original.pdf',data:Buffer.from('%PDF original bytes\0').toString('base64')}],
 documents:[{id:'doc',filename:'document.pdf',data:Buffer.from('%PDF document\0bytes').toString('base64')}],
 reviews:[{calendarId:'calendar',revision:2,history:[{revision:1,conclusion:'Original'}],entries:[]}],
 sessions:[{id:'session',userId:'u',expires:1234}],
 audit:[{action:'DUPLICATE',id:'same'},{action:'DUPLICATE',id:'same'},{action:'LAST',id:'last'}],
 catalogue:{revision:2,events:[]},
 extension:JSON.parse('{"__proto__":{"safe":true},"values":[null,false,0,{},[]]}'),
 absent:undefined,
});

async function destination(t){
 const database=await createTestDatabase(t);
 await database.pg.exec(importHistorySql);
 await database.pg.exec("CREATE SCHEMA dentec_private; CREATE TABLE dentec_private.sentinel(value text); INSERT INTO dentec_private.sentinel VALUES('archive preserved');");
 const backupDirectory=await mkdtemp(join(tmpdir(),'dentec-clone-'));t.after(()=>rm(backupDirectory,{recursive:true,force:true}));
 const before=await database.store.exportState();
 return {...database,before,options:{pool:database.pool,connectionString:'postgres://isolated-test-database',targetProjectRef:'isolated-test-fixture',sourceProjectRef:'production-fixture',expectedTargetHash:stateHash(before),backupDirectory,fixture:true}};
}

test('typed batched clone replaces only destination entities and preserves exact order, duplicate revisions, PDFs and backups',async t=>{
 const {store,pg,before,options}=await destination(t),source=sourceState(),original=structuredClone(source),prepared=await prepareTestClone(source);
 const result=await cloneTestDatabase({...options,prepared});
 assert.deepEqual(await store.exportState(),source);assert.deepEqual(source,original);
 assert.deepEqual(JSON.parse(await readFile(result.backup,'utf8')),before);
 assert.equal((await stat(result.backup)).mode&0o777,0o600);
 assert.equal((await pg.query('SELECT value FROM dentec_private.sentinel')).rows[0].value,'archive preserved');
 assert.equal((await pg.query('SELECT count(*)::int n FROM dentec.schema_migrations')).rows[0].n,1);
 assert.equal((await pg.query('SELECT count(*)::int n FROM dentec.calendar_revisions')).rows[0].n,2);
 assert.equal((await pg.query('SELECT source_hash FROM dentec.import_history')).rows[0].source_hash,prepared.hash);
 assert.deepEqual((await store.exportState()).audit,source.audit);
});

test('changed destination hash and invalid project or privileged role stop before replacement',async t=>{
 const {store,options}=await destination(t),prepared=await prepareTestClone(sourceState());
 await assert.rejects(cloneTestDatabase({...options,prepared,expectedTargetHash:'0'.repeat(64)}),/destino mudou/);
 const before=await store.exportState();
 await assert.rejects(cloneTestDatabase({...options,prepared,sourceProjectRef:options.targetProjectRef}),/projetos distintos/);
 await assert.rejects(cloneTestDatabase({...options,prepared,fixture:false,connectionString:'postgres://dentec_test_app.abcdefghijklmnopqrst:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',sourceProjectRef:'heqytxslokehuyrlxsza',targetProjectRef:'uzhrjqjlhfhacbcmzguq'}),/não identifica/);
 await assert.rejects(cloneTestDatabase({...options,prepared,fixture:false,connectionString:'postgres://dentec_test_app.uzhrjqjlhfhacbcmzguq:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',sourceProjectRef:'heqytxslokehuyrlxsza',targetProjectRef:'uzhrjqjlhfhacbcmzguq'}),/role restrita/);
 assert.deepEqual(await store.exportState(),before);
});

test('verification failure after batched inserts atomically restores original destination and ledger',async t=>{
 const {store,pg,before,options}=await destination(t),prepared=await prepareTestClone(sourceState());
 prepared.tables.find(table=>table.name==='campuses').rows[0].name='Unexpected transport change';
 await assert.rejects(cloneTestDatabase({...options,prepared}),/conferência integral/);
 assert.deepEqual(await store.exportState(),before);
 assert.equal((await pg.query('SELECT count(*)::int n FROM dentec.import_history')).rows[0].n,0);
});

test('destination write between backup and locked snapshot prevents a stale clone',async t=>{
 const {store,options}=await destination(t),prepared=await prepareTestClone(sourceState());
 await assert.rejects(cloneTestDatabase({...options,prepared,onProgress:async event=>{
  if(event.phase==='target-backed-up')await store.change(state=>state.campuses[0].name='Changed after backup');
 }}),/destino mudou após o backup/);
 assert.equal((await store.exportState()).campuses[0].name,'Changed after backup');
});
