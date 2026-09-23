import {evaluateCalendar} from '../src/evaluation.mjs';
import {activityChecklist} from '../src/obligations.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {removeMember} from '../src/members.mjs';
import {issueInvitation,findInvitation} from '../src/invitations.mjs';
import {releaseReadiness,requiredActivities} from '../src/release.mjs';
import {reviewCriteria} from '../src/review.mjs';
import {inheritedEvents} from '../src/institution.mjs';
import {proensLayout} from '../web/print.mjs';

test('removal revokes invitations and sessions while retaining historical authorship',()=>{
 const db={users:[{id:'admin',role:'ADMIN',active:true},{id:'member',role:'CAMPUS',active:false,loginMethod:'invite'}],sessions:[{userId:'member'},{userId:'admin'}],audit:[],calendars:[{createdBy:'member'}]};
 const invite=issueInvitation(db,'member','admin');
 removeMember(db,'member','admin');
 assert.throws(()=>findInvitation(db,invite.token));assert.throws(()=>issueInvitation(db,'member','admin'));
 assert.equal(db.sessions.length,1);assert.equal(db.users[1].active,false);assert.equal(db.calendars[0].createdBy,'member');
 assert.throws(()=>removeMember(db,'admin','admin'));
 assert.throws(()=>removeMember(db,'admin','another'));
});

test('definitive release requires every reviewed criterion, current versions and adequate teaching days',()=>{
 const record={id:'c',version:1,catalogueRevision:1,institutionalSnapshot:[],state:{assessmentStages:4,year:2027,offer:'tecnico',regime:'anual',weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Synthetic fixture',periods:[{id:'year',name:'Ano',start:'2027-01-01',end:'2027-12-31'}],events:[]}};
 record.state.events=[...reviewCriteria.map(c=>c.title),...requiredActivities.map(c=>c[1])].map((name,i)=>({id:'e'+i,name,start:'2027-02-01',end:'2027-02-01',kind:'note',category:'institucional',evidence:'Synthetic fixture'}));
 record.state.events.push(...activityChecklist(record.state).map(r=>({id:r.id,requirementId:r.id,name:r.name,start:'2027-02-01',end:'2027-02-01',kind:'note',evidence:'Synthetic fixture'})));
 const db={catalogue:{revision:1},reviews:[]};
 assert.equal(releaseReadiness(record,db).ready,false);
 const review={calendarId:'c',calendarVersion:1,catalogueRevision:1,applicableNorm:'Synthetic normative reference',entries:reviewCriteria.map(c=>({id:c.id,reviewed:true,status:'ATENDIDO',notes:'Synthetic documentary evidence'}))};db.reviews=[review];
 assert.deepEqual(releaseReadiness(record,db).issues,[]);
 const extraordinary=record.state.events.find(e=>e.requirementId==='extraordinary-council');record.state.events=record.state.events.filter(e=>e!==extraordinary);assert(releaseReadiness(record,db).issues.some(i=>i.includes('extraordinário')));record.state.events.push(extraordinary);
 for(const id of ['IX','X','XI','XII']){const entry=review.entries.find(e=>e.id===id);entry.status='PENDENTE';assert.equal(releaseReadiness(record,db).ready,false);entry.status='ATENDIDO';}
 review.calendarVersion=0;assert.equal(releaseReadiness(record,db).ready,false);review.calendarVersion=1;
 record.state.periods[0].end='2027-02-01';assert.equal(releaseReadiness(record,db).ready,false);
});

test('technical offer inherits old technical events and test PDF identifies its purpose',()=>{
 const event={id:'e',active:true,start:'2027-01-01',end:'2027-01-01',offers:['subsequente']};
 assert.equal(inheritedEvents({events:[event]},2027,'tecnico').length,1);
 assert.equal(inheritedEvents({events:[event]},2027,'graduacao').length,0);
 const html=proensLayout({year:2027,campus:'Test',periods:[]},[],null,{purpose:'test'});
 assert.match(html,/CALENDÁRIO DE TESTE — SEM VALIDADE PARA ENVIO/);
});

test('combined calendars scope exclusions by modality and do not presume a postgraduate minimum',()=>{
 const state={year:2027,offer:'subsequente',modalities:['subsequente','graduacao','posgraduacao'],regime:'anual',weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Fixture',periods:[{id:'p',name:'Semana',start:'2027-02-01',end:'2027-02-05'}],events:[]};
 const result=evaluateCalendar(state,[{id:'e',start:'2027-02-02',end:'2027-02-02',kind:'exclude',modalities:['graduacao'],evidence:'Fixture'}]);
 assert.equal(result.byModality.subsequente.total,5);assert.equal(result.byModality.graduacao.total,4);assert.equal(result.byModality.posgraduacao.checks[0].expected,null);
 const catalogue={events:[{id:'same',active:true,start:'2027-01-01',end:'2027-01-01',offers:['subsequente','graduacao']}]};
 assert.equal(inheritedEvents(catalogue,2027,['subsequente','graduacao']).length,1);
});

test('a single linked deadline cannot satisfy every assessment stage or semester',()=>{
 const state={assessmentStages:4,regime:'semestral'};
 const activities=activityChecklist(state);
 assert.equal(activities.filter(a=>a.id.startsWith('results-')).length,4);
 assert.equal(activities.filter(a=>a.id.startsWith('diary-')).length,2);
 assert.equal(activities.filter(a=>a.id.startsWith('teaching-plan-')).length,2);
 assert.equal(new Set(activities.map(a=>a.id)).size,activities.length);
});
