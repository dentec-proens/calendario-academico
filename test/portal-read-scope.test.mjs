import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTestDatabase,createTestApp} from './helpers/database.mjs';

test('portal trash and document lists keep their visibility contracts without loading unrelated relational graphs',async t=>{
 const database=await createTestDatabase(t),adminToken='a'.repeat(64),campusToken='b'.repeat(64);
 const digest=value=>createHash('sha256').update(value).digest('hex');
 await database.store.change(db=>{
  db.users.push({id:'admin',role:'ADMIN',active:true},{id:'campus',role:'CAMPUS',campusId:'campus-1',active:true});
  db.sessions=[{id:digest(adminToken),userId:'admin',expires:Date.now()+60000},{id:digest(campusToken),userId:'campus',expires:Date.now()+60000}];
  for(const [id,campusId,deletedAt] of [['active','campus-1',undefined],['own-trash','campus-1','2026-10-20T10:00:00Z'],['other-trash','campus-2','2026-10-21T10:00:00Z']]){
   db.calendars.push({id,campusId,version:7,...(deletedAt?{deletedAt}:{}),state:{year:2027,campus:campusId,offer:'integrado',modalities:['integrado'],events:[{id:'event',name:'Do not load for a list'}]},versions:[{version:6,state:{year:2027,events:[{id:'old-event'}]}}],institutionalSnapshot:[{id:'old-institutional-event'}]});
  }
  db.histories.push({id:'history',calendarId:'active',campusId:'campus-1',analysis:{pages:[{page:1,text:'Unrelated extracted PDF text'}]}});
  db.audit.push({actor:'admin',id:'active',action:'SAVE_CALENDAR'});
  db.documents=[
   {id:'draft',title:'Draft',status:'rascunho',data:Buffer.from('%PDF draft').toString('base64')},
   {id:'published',title:'Published',status:'vigente',publishedAt:'2026-10-20',data:Buffer.from('%PDF published').toString('base64')},
   {id:'archived',title:'Archived',status:'arquivado',publishedAt:'2026-10-19',archivedAt:'2026-10-20',data:Buffer.from('%PDF archived').toString('base64')},
  ];
 });
 const app=await createTestApp(t,{store:database.store});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.server.close(resolve)));
 const base='http://127.0.0.1:'+app.server.address().port;
 const originalQuery=database.pg.query.bind(database.pg),queries=[];
 database.pg.query=(sql,params)=>{queries.push(sql);return originalQuery(sql,params);};
 const read=async(path,token)=>{
  queries.length=0;
  const response=await fetch(base+path,{headers:token?{cookie:'dentec_session='+token}:{}}),data=await response.json();
  const tables=new Set(queries.flatMap(sql=>[...sql.matchAll(/(?:FROM|JOIN)\s+dentec\."?(\w+)"?/gi)].map(match=>match[1])));
  return {status:response.status,data,tables};
 };
 const adminTrash=await read('/api/calendar-trash',adminToken);
 assert.equal(adminTrash.status,200);
 assert.deepEqual(adminTrash.data.calendars.map(calendar=>calendar.id),['own-trash','other-trash']);
 assert.deepEqual(Object.keys(adminTrash.data.calendars[0]).sort(),['id','name','campusId','deletedAt','version'].sort());
 assert.equal(adminTrash.data.calendars[0].name,'Calendário 2027 - Campus campus-1');
 assert.equal(adminTrash.data.calendars[0].version,7);
 assert.ok(adminTrash.tables.has('calendar_states'));
 for(const table of adminTrash.tables)assert.ok(['root_fields','sessions','users','record_properties','calendars','calendar_states','calendar_modalities'].includes(table),'trash loaded '+table);
 const campusTrash=await read('/api/calendar-trash',campusToken);
 assert.deepEqual(campusTrash.data.calendars.map(calendar=>calendar.id),['own-trash']);
 const adminDocuments=await read('/api/documents',adminToken);
 assert.equal(adminDocuments.status,200);assert.equal(adminDocuments.data.revision,1);
 assert.deepEqual(adminDocuments.data.documents.map(document=>document.id),['draft','published','archived']);
 assert.ok(adminDocuments.data.documents.every(document=>!Object.hasOwn(document,'data')));
 for(const table of adminDocuments.tables)assert.ok(['root_fields','sessions','users','record_properties','catalogue','catalogue_events','documents'].includes(table),'documents loaded '+table);
 const campusDocuments=await read('/api/documents',campusToken);
 assert.deepEqual(campusDocuments.data.documents.map(document=>document.id),['published','archived']);
 assert.equal((await read('/api/calendar-trash')).status,401);
 assert.equal((await read('/api/documents')).status,401);
});
