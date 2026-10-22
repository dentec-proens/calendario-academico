import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestDatabase} from './helpers/database.mjs';
import {readLegacyPostgres,mergeImportSources,importVerified,importHistorySql,writeJsonExport,readJsonImport,stateHash} from '../src/database-transfer.mjs';

test('legacy document and archived duplicate revisions migrate without losing credentials, PDFs or unknown fields',async t=>{
 const {store,pool,pg}=await createTestDatabase(t,{seed:false});
 const state={users:[{id:'u',name:'Fixture',email:'fixture@ifpr.edu.br',role:'CAMPUS',active:true,campusId:'campus',salt:'original-salt',hash:'original-password-hash'}],campuses:[{id:'campus',name:'Fixture campus'}],calendars:[{id:'calendar',campusId:'campus',version:3,state:{year:2027,campus:'Fixture campus',offer:'integrado',regime:'anual',weekdays:[1,2,3,4,5],periods:[],events:[],futureSetting:{retain:true}},versions:[]}],histories:[{id:'pdf',calendarId:'calendar',campusId:'campus',filename:'fixture.pdf',data:Buffer.from('%PDF-1.4 original fixture').toString('base64')}],audit:[{at:'2026-10-22',action:'FIXTURE'}],catalogue:{revision:1,events:[]},futureField:JSON.parse('{"__proto__":{"retained":true},"values":[false,0,null,"retained"]}')};
 const snapshots=[{version:1,at:'a',state:{year:2027,events:[]},unknown:{keep:1}},{version:1,at:'a',state:{year:2027,events:[]},unknown:{keep:1}}];
 state.reviews=[{calendarId:'calendar',revision:1,entries:[],conclusion:'Parecer original'}];
 state.calendars[0].versions=snapshots.map(({version,at})=>({version,at}));
 await pg.exec('CREATE SCHEMA dentec_private; CREATE TABLE dentec_private.app_state(id integer PRIMARY KEY,payload jsonb); CREATE TABLE dentec_private.calendar_versions(calendar_id text,ordinal integer,snapshot jsonb,metadata jsonb);');
 await pg.query('INSERT INTO dentec_private.app_state VALUES(1,$1::jsonb)',[JSON.stringify(state)]);
 for(let i=0;i<snapshots.length;i++)await pg.query('INSERT INTO dentec_private.calendar_versions VALUES($1,$2,$3::jsonb,$4::jsonb)',['calendar',i+1,JSON.stringify(snapshots[i]),JSON.stringify(state.calendars[0].versions[i])]);
 const imported=await readLegacyPostgres(pool);assert.deepEqual(imported.calendars[0].versions,snapshots);
 await pg.exec(importHistorySql);
 const directory=await mkdtemp(join(tmpdir(),'dentec-transfer-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const result=await importVerified(store,pool,imported,'synthetic-legacy',directory);
 assert.equal(result.alreadyImported,false);assert.equal((await stat(result.backup)).mode&0o777,0o600);
 assert.deepEqual(await store.exportState(),imported);
 assert.deepEqual((await pg.query('SELECT payload FROM dentec_private.app_state')).rows[0].payload,state);
 assert.equal((await pg.query('SELECT count(*)::integer AS n FROM dentec_private.calendar_versions')).rows[0].n,2);
 const repeated=await importVerified(store,pool,imported,'synthetic-legacy',directory);assert.equal(repeated.alreadyImported,true);
 const exported=join(directory,'export.json');await writeJsonExport(exported,await store.exportState());
 assert.deepEqual(await readJsonImport(exported),imported);assert.equal(stateHash(imported),stateHash(JSON.parse(await readFile(exported,'utf8'))));
 await assert.rejects(writeJsonExport(exported,{}),{code:'EEXIST'});
 await assert.rejects(store.importState({users:[]}),/vazio/);
});

test('conflicting sources stop before import, while disjoint seeded collections and extension fields are retained',()=>{
 const first={campuses:[{id:'one',name:'One'}],users:[],catalogue:{revision:1,events:[]},retained:{left:true}};
 const second={campuses:[{id:'one',name:'One'},{id:'two',name:'Two'}],users:[],catalogue:{revision:1,events:[]},retained:{right:true}};
 const combined=mergeImportSources([{state:first},{state:second}]);assert.equal(combined.campuses.length,2);assert.deepEqual(combined.retained,{left:true,right:true});
 assert.throws(()=>mergeImportSources([{state:first},{state:{...second,campuses:[{id:'one',name:'Changed'}]}}]),/divergentes/);
 const reserved=JSON.parse('{"constructor":{"retain":true},"__proto__":{"retain":true},"nested":{"toString":"original"}}');
 assert.deepEqual(mergeImportSources([{state:reserved},{state:{nested:{other:true}}}]),Object.fromEntries([...Object.entries(reserved).filter(([key])=>key!=='nested'),['nested',{toString:'original',other:true}]]));
 assert.equal({}.retain,undefined);
});

test('review sources merge by calendar identity, retain disjoint and complementary records, and reject conflicts',()=>{
 const first={reviews:[{calendarId:'one',revision:1,conclusion:'Original',id:'shared-extension'}]};
 const second={reviews:[{calendarId:'one',revision:1,processNumber:'SEI fixture'},{calendarId:'two',revision:2,conclusion:'Other',id:'shared-extension'}]};
 const sources=[{state:first},{state:second}],combined=mergeImportSources(sources);
 assert.deepEqual(combined.reviews,[{...first.reviews[0],processNumber:'SEI fixture'},second.reviews[1]]);
 assert.deepEqual(mergeImportSources([...sources,{state:combined}]),combined);
 assert.throws(()=>mergeImportSources([{state:first},{state:{reviews:[{calendarId:'one',revision:2,conclusion:'Changed'}]}}]),/divergentes/);
 assert.throws(()=>mergeImportSources([{state:first},{state:{reviews:[{id:'one',revision:1}]}}]),/sem identificador em reviews/);
});

test('invalid archived content blocks migration rather than replacing any historical version',async t=>{
 const {pool,pg,store}=await createTestDatabase(t,{seed:false});
 await pg.exec('CREATE SCHEMA dentec_private; CREATE TABLE dentec_private.app_state(id integer PRIMARY KEY,payload jsonb); CREATE TABLE dentec_private.calendar_versions(calendar_id text,ordinal integer,snapshot jsonb,metadata jsonb);');
 await pg.query('INSERT INTO dentec_private.app_state VALUES(1,$1::jsonb)',[JSON.stringify({calendars:[{id:'c',versions:[{version:1,state:{different:true}}]}]})]);
 await pg.query('INSERT INTO dentec_private.calendar_versions VALUES($1,1,$2::jsonb,$3::jsonb)',['c',JSON.stringify({version:1,state:{original:true}}),JSON.stringify({version:1})]);
 await assert.rejects(readLegacyPostgres(pool),/divergente/);assert.deepEqual(await store.exportState(),{});
 await pg.query('UPDATE dentec_private.calendar_versions SET snapshot=$1::jsonb',[JSON.stringify({version:1})]);
 await assert.rejects(readLegacyPostgres(pool),/snapshot arquivado incompleto/);
 await pg.query('UPDATE dentec_private.app_state SET payload=$1::jsonb WHERE id=1',[JSON.stringify({calendars:[{id:'c',versions:[{version:1}]}]})]);
 await assert.rejects(readLegacyPostgres(pool),/snapshot arquivado incompleto/);
 assert.deepEqual(await store.exportState(),{});
});

test('missing archived snapshots block metadata-only versions, while complete inline snapshots remain valid',async t=>{
 const {pool,pg,store}=await createTestDatabase(t,{seed:false});
 await pg.exec('CREATE SCHEMA dentec_private; CREATE TABLE dentec_private.app_state(id integer PRIMARY KEY,payload jsonb); CREATE TABLE dentec_private.calendar_versions(calendar_id text,ordinal integer,snapshot jsonb,metadata jsonb);');
 const first={version:1,state:{year:2027,events:[]}},state={calendars:[{id:'c',versions:[{version:1},{version:2}]}]};
 await pg.query('INSERT INTO dentec_private.app_state VALUES(1,$1::jsonb)',[JSON.stringify(state)]);
 await pg.query('INSERT INTO dentec_private.calendar_versions VALUES($1,1,$2::jsonb,$3::jsonb)',['c',JSON.stringify(first),JSON.stringify({version:1})]);
 await assert.rejects(readLegacyPostgres(pool),/sem snapshot arquivado/);
 assert.deepEqual(await store.exportState(),{});
 const inline={version:2,state:{year:2027,events:[{id:'original'}]},unknown:{preserve:true}};
 state.calendars[0].versions[1]=inline;
 await pg.query('UPDATE dentec_private.app_state SET payload=$1::jsonb WHERE id=1',[JSON.stringify(state)]);
 assert.deepEqual((await readLegacyPostgres(pool)).calendars[0].versions,[first,inline]);
 assert.deepEqual((await pg.query('SELECT payload FROM dentec_private.app_state')).rows[0].payload,state);
 await pg.exec('DROP TABLE dentec_private.calendar_versions');
 await assert.rejects(readLegacyPostgres(pool),/sem snapshot arquivado/);
 state.calendars[0].versions[0]=first;
 await pg.query('UPDATE dentec_private.app_state SET payload=$1::jsonb WHERE id=1',[JSON.stringify(state)]);
 assert.deepEqual((await readLegacyPostgres(pool)).calendars[0].versions,[first,inline]);
});
