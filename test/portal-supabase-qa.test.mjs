import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTestDatabase} from './helpers/database.mjs';
import {assertQaConnection,cleanupQaFixtures,preservationReport,guardedQaStore,assertQaMutation} from '../scripts/lib/portal-supabase-qa.mjs';

const manifest={userIds:['qa-admin','qa-campus'],campusIds:['qa-campus-id'],emails:['qa.admin@ifpr.edu.br','qa.campus@ifpr.edu.br','qa.invited@ifpr.edu.br']};
const digest=value=>createHash('sha256').update(value).digest('hex');

test('QA connection rejects production and administrative credentials before connecting',()=>{
 assert.doesNotThrow(()=>assertQaConnection('postgres://dentec_test_app.uzhrjqjlhfhacbcmzguq:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'));
 assert.throws(()=>assertQaConnection('postgres://dentec_test_app.heqytxslokehuyrlxsza:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'),/bloqueado/);
 assert.throws(()=>assertQaConnection('postgres://postgres.uzhrjqjlhfhacbcmzguq:secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'),/bloqueado/);
 assert.throws(()=>assertQaConnection('postgres://dentec_test_app.uzhrjqjlhfhacbcmzguq:secret@example.com/postgres'),/bloqueado/);
});

async function fixtureDatabase(t){
 const {store,pool}=await createTestDatabase(t);
 await store.change(db=>{
  db.users.push({id:'original-user',name:'Original',email:'original@ifpr.edu.br',campusId:'campus-1',active:true,role:'CAMPUS'});
  db.calendars.push({id:'original-calendar',campusId:'campus-1',version:1,state:{year:2027,events:[]},versions:[]});
  db.audit.push({actor:'original-user',id:'original-calendar',action:'SAVE_CALENDAR'});
  db.originalExtension={nested:['preserve']};
 });
 const baseline=await store.exportState();
 await store.change(db=>{
  db.campuses.push({id:'qa-campus-id',name:'Synthetic'});
  db.users.push({id:'qa-admin',email:manifest.emails[0],role:'ADMIN'}, {id:'qa-campus',email:manifest.emails[1],campusId:'qa-campus-id',role:'CAMPUS'}, {id:'invited-generated-id',email:manifest.emails[2],removedAt:'now',campusId:'qa-campus-id'});
  db.calendars.push({id:'qa-calendar',campusId:'qa-campus-id',version:2,state:{year:2027,events:[{id:'event',name:'QA',historicalSource:{historyId:'qa-history',page:1}}]},versions:[{version:1,state:{year:2027,events:[]}}]});
  db.histories.push({id:'qa-history',calendarId:'qa-calendar',campusId:'qa-campus-id',analysis:{pages:[{page:1,text:'Synthetic'}]}});
  db.reviews=[{calendarId:'qa-calendar',revision:1,entries:[{id:'criterion',notes:'Synthetic'}],reviewer:{id:'qa-admin'},history:[{revision:0,entries:[]}]}];
  db.documents=[{id:'qa-document',createdBy:'qa-admin',title:'Synthetic'}];
  db.sessions=[{id:'qa-session',userId:'qa-admin',expires:Date.now()+60000}];
  db.invitations=[{tokenHash:'qa-token',userId:'invited-generated-id',createdBy:'qa-admin'}];
  db.passwordResets=[{hash:'qa-reset',userId:'qa-campus',expires:Date.now()+60000}];
  db.loginAttempts=[{id:digest(manifest.emails[0]),count:1,until:Date.now()+60000}];
  db.uploads=[{id:'qa-upload',calendarId:'qa-calendar',owner:'qa-campus'}];
  db.audit.push({actor:'qa-admin',action:'SAVE_HUMAN_REVIEW',id:'qa-calendar'});
 });
 return {store,pool,baseline};
}

test('QA cleanup deletes owned entities, descendants and extensions, restoring the exact original state',async t=>{
 const {store,pool,baseline}=await fixtureDatabase(t);
 const result=await cleanupQaFixtures(pool,manifest,baseline);
 assert.equal(result.exactMatch,true);
 assert.equal(result.businessDataMatch,true);
 assert.deepEqual(await store.exportState(),baseline);
 for(const table of ['calendar_events','calendar_revisions','history_pages','review_entries','review_history','reviewers']){
  const result=await pool.query(`SELECT count(*)::int AS n FROM dentec.${table}`);
  assert.equal(result.rows[0].n,0,table);
 }
 const extension=await pool.query("SELECT count(*)::int AS n FROM dentec.record_properties WHERE record_key LIKE 'calendars/qa-calendar%'");
 assert.equal(extension.rows[0].n,0);
});

test('QA cleanup preserves concurrent original changes and reports the mismatch instead of restoring a snapshot',async t=>{
 const {store,pool,baseline}=await fixtureDatabase(t);
 await store.change(db=>{
  db.users.find(row=>row.id==='original-user').name='Edited concurrently';
  db.audit.push({actor:'original-user',id:'original-calendar',action:'CONCURRENT_SAVE'});
  db.originalExtension.nested.push('new value');
  db.sessions.push({id:'real-new-session',userId:'original-user',expires:Date.now()+60000});
 });
 const result=await cleanupQaFixtures(pool,manifest,baseline),after=await store.exportState();
 assert.equal(result.exactMatch,false);assert.equal(result.businessDataMatch,false);
 assert.equal(after.users[0].name,'Edited concurrently');
 assert.equal(after.audit.at(-1).action,'CONCURRENT_SAVE');
 assert.deepEqual(after.originalExtension.nested,['preserve','new value']);
 assert.equal(after.sessions[0].id,'real-new-session');
 assert.ok(result.changedFields.includes('users'));
});

test('normal pruning of expired authentication rows is distinguished from business data changes',()=>{
 const baseline={users:[{id:'original'}],sessions:[{id:'expired',expires:10}],loginAttempts:[{id:'expired',until:10}]};
 const after={users:[{id:'original'}],sessions:[],loginAttempts:[]};
 const result=preservationReport(baseline,after,{now:20});
 assert.equal(result.exactMatch,false);assert.equal(result.businessDataMatch,true);
 assert.equal(result.expiredOperationalRowsAreNotRestored,true);
});

test('QA transaction guard rolls back original autosaves and permits scoped fixture calendar writes',async t=>{
 const {store}=await fixtureDatabase(t),guarded=guardedQaStore(store,manifest),before=await store.exportState();
 await assert.rejects(()=>guarded.change(db=>{
  db.calendars[0].state.events.push({id:'unwanted-autosave',name:'Automatic editor recomputation'});
  db.audit.push({actor:'qa-admin',action:'SAVE_CALENDAR',id:'original-calendar'});
 },{fields:['calendars','audit'],calendarId:'original-calendar',appendOnlyAudit:true}),error=>error.status===403&&error.code==='DENTEC_QA_ORIGINAL_DATA_PROTECTED');
 assert.deepEqual(await store.exportState(),before);
 await guarded.change(db=>{
  db.calendars[0].state.events.push({id:'fixture-edit',name:'Allowed'});
  db.audit.push({actor:'qa-admin',action:'SAVE_CALENDAR',id:'qa-calendar'});
 },{fields:['calendars','audit'],calendarId:'qa-calendar',appendOnlyAudit:true});
 assert.equal((await store.exportState()).calendars.find(calendar=>calendar.id==='qa-calendar').state.events.at(-1).id,'fixture-edit');
});

test('QA guard blocks original entities, catalogue, nonfixture actors and calendar creation outside fixture campi',()=>{
 const original={users:[{id:'original-user',email:'original@ifpr.edu.br',campusId:'original-campus'}],campuses:[{id:'original-campus',name:'Original'}],calendars:[{id:'original-calendar',campusId:'original-campus',state:{events:[]}}],histories:[{id:'original-history',calendarId:'original-calendar'}],reviews:[{calendarId:'original-calendar',revision:1}],catalogue:{revision:1},audit:[]};
 const cases=[
  state=>state.users[0].hash='changed',
  state=>state.campuses[0].name='changed',
  state=>state.histories[0].notes='changed',
  state=>state.reviews[0].revision++,
  state=>state.catalogue.revision++,
  state=>state.calendars.push({id:'new-calendar',campusId:'original-campus',state:{}}),
  state=>state.audit.push({actor:'original-user',action:'SAVE_CALENDAR',id:'qa-calendar'}),
  state=>state.calendars[0].campusId='qa-campus-id',
 ];
 for(const change of cases){const after=structuredClone(original);change(after);assert.throws(()=>assertQaMutation(original,after,manifest),error=>error.status===403);}
 const fixture=structuredClone(original);fixture.calendars.push({id:'new-calendar',campusId:'qa-campus-id',state:{events:[]}});fixture.audit.push({actor:'qa-admin',action:'CREATE_CALENDAR',id:'new-calendar'});
 assert.doesNotThrow(()=>assertQaMutation(original,fixture,manifest));
 const expired={sessions:[{id:'old',userId:'original-user',expires:1}],loginAttempts:[{id:'old',until:1}]};
 assert.doesNotThrow(()=>assertQaMutation(expired,{sessions:[],loginAttempts:[]},manifest,{now:2}));
 assert.throws(()=>assertQaMutation({sessions:[{id:'valid',userId:'original-user',expires:100}]},{sessions:[]},manifest,{now:2}),error=>error.status===403);
});
