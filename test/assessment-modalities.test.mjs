import test from 'node:test';
import assert from 'node:assert/strict';
import {activityChecklist,migrateAssessmentEvents} from '../src/obligations.mjs';
import {suggestStages,suggestStageEnd} from '../src/stage-suggestions.mjs';
import {evaluateCalendar} from '../src/evaluation.mjs';
import {proensLayout} from '../web/print.mjs';
import {createApp} from '../src/application.mjs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const state={year:2027,offer:'integrado',modalities:['integrado','graduacao'],regime:'semestral',assessmentStagesByModality:{integrado:4,graduacao:2},weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Ata',periods:[{id:'p',name:'1º semestre',start:'2027-03-01',end:'2027-03-12'},{id:'q',name:'2º semestre',start:'2027-04-01',end:'2027-04-14'}],events:[]};
const scoped=m=>({...state,offer:m,modalities:[m]});
test('three trimesters coexist with undergraduate semesters',()=>{
 const configuration={integrado:3,graduacao:2};
 const stages=suggestStages({...scoped('integrado'),assessmentStagesByModality:configuration},[],'2027-03-01').stages;
 assert.equal(stages.length,3);assert.equal(stages.reduce((sum,s)=>sum+s.days,0),20);
 assert.deepEqual(stages.map(s=>s.days),[7,7,6]);
 assert.equal(stages[0].start,'2027-03-01');assert.equal(stages[2].end,'2027-04-14');
 assert.equal(activityChecklist({...state,assessmentStagesByModality:configuration}).filter(r=>r.id.startsWith('stage-')).length,5);
 const events=stages.map((s,i)=>({...s,id:'t'+i,kind:'note',modalities:['integrado']}));
 assert.equal(suggestStages({...scoped('graduacao'),assessmentStagesByModality:configuration},events,'2027-03-01').stages.length,2);
});
test('four integrated stages and two undergraduate stages coexist without double counting',()=>{
 const technical=suggestStages(scoped('integrado'),[],'2027-03-01');
 const events=technical.stages.map((s,i)=>({...s,id:'t'+i,kind:'note',category:'limite',evidence:'Ata',modalities:['integrado']}));
 const undergraduate=suggestStages(scoped('graduacao'),events,'2027-03-01');
 assert.equal(technical.stages.length,4);assert.equal(undergraduate.stages.length,2);
 assert.equal(technical.stages[0].end,'2027-03-05');assert.equal(undergraduate.stages[0].end,'2027-03-12');
 const rows=activityChecklist(state);
 events.push(...undergraduate.stages.map((s,i)=>({...s,id:'g'+i,kind:'note',category:'limite',evidence:'Ata',modalities:['graduacao']})));
 for(const event of events){const row=rows.find(r=>r.id===event.requirementId);assert.equal(row.modality,event.modalities[0]);event.name=row.name;}
 assert.equal(new Set(events.map(e=>e.requirementId)).size,6);
 const result=evaluateCalendar(state,events);assert.equal(result.byModality.integrado.total,20);assert.equal(result.byModality.graduacao.total,20);
 const html=proensLayout(state,events,result,{name:'Teste',courses:'Teste',purpose:'test',version:1});assert.match(html,/bimestral/);assert.match(html,/semestral/);
 assert.throws(()=>suggestStages(state,[],'2027-03-01'),/separadamente/);
});
test('stage end and holidays are scoped to the selected offer',()=>{
 const events=[{id:'holiday',kind:'exclude',start:'2027-03-05',end:'2027-03-05',modalities:['integrado'],evidence:'Lei'}];
 assert.equal(suggestStageEnd(scoped('integrado'),events,'2027-03-01',1).end,'2027-03-08');
 assert.equal(suggestStageEnd(scoped('graduacao'),events,'2027-03-01',1).end,'2027-03-12');
});
test('legacy shared stages retain dates and split into scoped records once',()=>{
 const original={...state,events:[{id:'old',name:'Etapa',requirementId:'stage-1',start:'2027-03-01',end:'2027-03-05',evidence:'Ata',kind:'note'}]};
 const events=migrateAssessmentEvents(original);assert.equal(events.length,2);assert.equal(events[0].id,'old');assert.equal(events[1].end,'2027-03-05');
 assert.deepEqual(migrateAssessmentEvents({...state,events}),events);assert.equal(original.events.length,1);
});
test('server persists per-offer stages and rejects mismatched event scope',async t=>{
 const app=await createApp({directory:await mkdtemp(join(tmpdir(),'assessment-test-')),setupCode:'fixture'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const base=`http://127.0.0.1:${app.server.address().port}`;let cookie='';
 const call=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Dentec-Request':'1',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
 const credentials={email:'assessment-test@ifpr.edu.br',password:'synthetic-password-only'};
 await call('/api/setup','POST',{...credentials,code:'fixture',name:'Fixture'});await call('/api/login','POST',credentials);
 const bootstrap=(await call('/api/bootstrap')).data;
 const record=(await call('/api/calendars','POST',{campusId:bootstrap.campuses[0].id,purpose:'test',courses:'Fixture',year:2027,modalities:state.modalities,regime:'semestral'})).data;
 const payload={...record.state,...state,campus:record.state.campus,events:[{id:'event',name:'Graduação',requirementId:'stage-1:graduacao',modalities:['graduacao'],start:'2027-03-01',end:'2027-03-12',kind:'note',category:'limite',evidence:'Ata'}]};
 const saved=await call('/api/calendars/'+record.id,'PUT',{version:record.version,catalogueRevision:bootstrap.catalogue.revision,state:payload});assert.equal(saved.status,200,JSON.stringify(saved.data));
 const loaded=(await call('/api/calendars/'+record.id)).data;assert.deepEqual(loaded.state.assessmentStagesByModality,state.assessmentStagesByModality);assert.equal(loaded.state.events[0].requirementId,'stage-1:graduacao');
 payload.events[0].modalities=['integrado'];assert.equal((await call('/api/calendars/'+record.id,'PUT',{version:loaded.version,catalogueRevision:bootstrap.catalogue.revision,state:payload})).status,400);
});
