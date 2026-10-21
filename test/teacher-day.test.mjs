import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCatalogue,inheritedEvents} from '../src/institution.mjs';
import {campusInstitutionalEvents,teacherDayId,validateTeacherDay,teacherDayWeek} from '../src/teacher-day.mjs';
import {durationEnd} from '../src/duration.mjs';
import {createApp} from '../src/application.mjs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('campus may choose every day of the Monday-to-Sunday week containing October 15',()=>{
 assert.deepEqual(teacherDayWeek(2027),{start:'2027-10-11',end:'2027-10-17'});
 for(let day=11;day<=17;day++)assert.equal(validateTeacherDay(`2027-10-${day}`,2027),`2027-10-${day}`);
 for(const date of ['2027-10-10','2027-10-18','2027-09-15'])assert.throws(()=>validateTeacherDay(date,2027),/semana de 15 de outubro/);
 assert.deepEqual(teacherDayWeek(2028),{start:'2028-10-09',end:'2028-10-15'});
 assert.equal(validateTeacherDay(undefined,2027),undefined);
});

test('only teacher day moves; original date is restored and other calendars stay unchanged',()=>{
 const catalogue=initialCatalogue(),base=inheritedEvents(catalogue,2027,'integrado');
 const moved=campusInstitutionalEvents(base,{year:2027,teacherDayDate:'2027-10-13'});
 assert.equal(moved.find(e=>e.id===teacherDayId).start,'2027-10-13');
 assert.equal(moved.filter(e=>e.id===teacherDayId).length,1);
 assert.deepEqual(moved.filter(e=>e.id!==teacherDayId),base.filter(e=>e.id!==teacherDayId));
 assert.equal(base.find(e=>e.id===teacherDayId).start,'2027-10-15');
 assert.deepEqual(campusInstitutionalEvents(moved,{year:2027}),base);
 const state={year:2027,offer:'integrado',weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Ata',periods:[],events:[]};
 assert.equal(durationEnd('2027-10-13',1,state,base),'2027-10-13');
 assert.equal(durationEnd('2027-10-13',1,state,moved),'2027-10-14');
 assert.equal(durationEnd('2027-10-15',1,state,moved),'2027-10-15');
 assert.throws(()=>validateTeacherDay('2028-10-13',2027));
 assert.throws(()=>validateTeacherDay('2027-02-30',2027));
 assert.throws(()=>inheritedEvents(catalogue,2028,'integrado',{year:2028,teacherDayDate:'2028-10-13'}));
});

test('server saves teacher day, snapshots it for PDF, restores it and rejects protected event tampering',async t=>{
 let printed;
 const app=await createApp({directory:await mkdtemp(join(tmpdir(),'teacher-day-')),setupCode:'fixture',pdfRenderer:async(record,events)=>{printed=events;return Buffer.from('%PDF-fixture');}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 const call=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Dentec-Request':'1',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};};
 const credentials={email:'teacher-day@ifpr.edu.br',password:'synthetic-password-only'};
 await call('/api/setup','POST',{...credentials,code:'fixture',name:'Fixture'});await call('/api/login','POST',credentials);
 const bootstrap=(await call('/api/bootstrap')).data;
 const record=(await call('/api/calendars','POST',{campusId:bootstrap.campuses[0].id,purpose:'test',courses:'Fixture',year:2027,modalities:['integrado'],regime:'anual'})).data;
 const path='/api/calendars/'+record.id;
 const save=(state,version)=>call(path,'PUT',{version,catalogueRevision:bootstrap.catalogue.revision,state});
 let saved=await save({...record.state,teacherDayDate:'2027-10-13'},record.version);assert.equal(saved.status,200,JSON.stringify(saved));
 let loaded=(await call(path)).data;
 assert.equal(loaded.state.teacherDayDate,'2027-10-13');
 assert.equal(loaded.institutionalSnapshot.find(e=>e.id===teacherDayId).start,'2027-10-13');
 assert.equal(loaded.institutionalEvents.find(e=>e.id===teacherDayId).start,'2027-10-13');
 assert.equal((await call(path+'/pdf','POST',{version:loaded.version,catalogueRevision:bootstrap.catalogue.revision})).status,200);
 assert.equal(printed.find(e=>e.id===teacherDayId).start,'2027-10-13');
 assert.equal((await save({...loaded.state,teacherDayDate:'2028-10-13'},loaded.version)).status,400);
 for(const date of ['2027-10-10','2027-10-18'])assert.equal((await save({...loaded.state,teacherDayDate:date},loaded.version)).status,400);
 assert.equal((await save({...loaded.state,events:[{id:'inst:national-0',name:'Tamper',start:'2027-01-02',end:'2027-01-02',kind:'exclude',evidence:'Fixture'}]},loaded.version)).status,400);
 saved=await save({...loaded.state,teacherDayDate:null},loaded.version);assert.equal(saved.status,200);
 loaded=(await call(path)).data;assert.equal(loaded.institutionalEvents.find(e=>e.id===teacherDayId).start,'2027-10-15');
 assert.equal((await app.store.read()).catalogue.events.find(e=>'inst:'+e.id===teacherDayId).start,'2027-10-15');
});
