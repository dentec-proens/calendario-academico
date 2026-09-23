import test from 'node:test';
import assert from 'node:assert/strict';
import {teacherVacations} from '../src/teacher-vacations.mjs';
import {activityChecklist,mergeLegacyStages} from '../src/obligations.mjs';
import {auditLog} from '../src/audit-log.mjs';
import {evaluateCalendar} from '../src/evaluation.mjs';

test('teacher vacations count inclusive days, including leap years, and reject July overflow',()=>{
 for(const year of [2027,2028]){const v=teacherVacations(year,`${year}-07-17`,'Decisão de teste');assert.equal(v.januaryStart,`${year}-01-02`);assert.equal(v.januaryEnd,`${year}-01-31`);assert.equal(v.julyEnd,`${year}-07-31`);assert.equal(v.total,45);assert(v.events.every(e=>e.kind==='note'));}
 assert.throws(()=>teacherVacations(2027,'2027-07-18','Fonte'));assert.throws(()=>teacherVacations(2027,'2026-07-01','Fonte'));assert.throws(()=>teacherVacations(2027,'2027-07-01',''));
});
test('mixed calendar includes annual and semester obligations plus extraordinary council',()=>{
 const rows=activityChecklist({regime:'misto',assessmentStages:4});
 for(const id of ['final-0','final-1','final-2','diary-0','diary-1','diary-2','extraordinary-council','stage-1'])assert(rows.some(r=>r.id===id));
 assert(!rows.some(r=>r.id.startsWith('stage-start')||r.id.startsWith('stage-end')));
 const state={year:2027,offer:'subsequente',regime:'misto',weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Fonte',periods:[{id:'s1',name:'S1',start:'2027-02-01',end:'2027-02-05'},{id:'s2',name:'S2',start:'2027-08-02',end:'2027-08-06'}]};
 assert.deepEqual(evaluateCalendar(state,[]).checks.map(c=>c.expected),[200,100,100]);
});
test('legacy start/end stages combine without changing the original snapshot',()=>{
 const events=[{id:'a',requirementId:'stage-start-1',start:'2027-02-01',end:'2027-02-01',evidence:'Ata 1'},{id:'b',requirementId:'stage-end-1',start:'2027-04-20',end:'2027-04-20',evidence:'Ata 2'}];
 const merged=mergeLegacyStages(events);assert.equal(merged.length,1);assert.equal(merged[0].requirementId,'stage-1');assert.equal(merged[0].end,'2027-04-20');assert.equal(events.length,2);assert.equal(events[0].requirementId,'stage-start-1');assert.deepEqual(mergeLegacyStages(merged),merged);
});
test('audit log isolates campi and contains canonical names and saved versions without credentials',()=>{
 const db={users:[{id:'u',name:'Revisor',hash:'must-not-appear'}],calendars:[{id:'a',campusId:'A',state:{year:2027,campus:'Reitoria'}},{id:'b',campusId:'B',state:{year:2027,campus:'Foz'}}],audit:[{actor:'u',id:'a',action:'SAVE_CALENDAR',at:'2026-09-21T10:00:00Z',version:2},{actor:'u',id:'b',action:'SAVE_CALENDAR',at:'2026-09-21T11:00:00Z',version:3}]};
 const campus=auditLog(db,{role:'CAMPUS',campusId:'A'});assert.equal(campus.entries.length,1);assert.equal(campus.entries[0].calendar,'Calendário 2027 - Campus Reitoria');assert.equal(campus.entries[0].version,2);assert.equal(auditLog(db,{role:'ADMIN'}).entries.length,2);assert(!JSON.stringify(campus).includes('must-not-appear'));
});


test('assessment range colors only endpoints and preserves intervening holiday colors',async()=>{
 const {proensLayout}=await import('../web/print.mjs');
 const html=proensLayout({year:2027,campus:'Reitoria',modalities:['integrado'],periods:[]},[{start:'2027-02-01',end:'2027-04-30',category:'limite',name:'Etapa'},{start:'2027-03-26',end:'2027-03-26',category:'feriado',name:'Feriado'}]);
 assert.equal((html.match(/<td class="cat-limite" title=/g)||[]).length,2);
 assert.match(html,/<td class="cat-feriado" title="Etapa; Feriado">26<\/td>/);
});
