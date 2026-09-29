import test from 'node:test';
import assert from 'node:assert/strict';
import {updateCampuses,selectableCampuses} from '../src/campuses.mjs';
import {activityChecklist} from '../src/obligations.mjs';
test('campus migration is idempotent and preserves historical Reitoria references',()=>{
 const db={campuses:[{id:'r',name:'Reitoria'},{id:'ass',name:'Assis Chateaubriand'},{id:'ara',name:'Arapongas'},{id:'ast',name:'Astorga'}],calendars:[{campusId:'r'}]};
 updateCampuses(db);const first=structuredClone(db);updateCampuses(db);assert.deepEqual(db,first);
 assert.equal(db.calendars[0].campusId,'r');assert(db.campuses.find(c=>c.id==='r').archived);
 assert.deepEqual(selectableCampuses(db.campuses).map(c=>c.name),['Arapongas','Assis Chateaubriand','Astorga','Ponta Grossa','Toledo']);
});
test('mandatory checklist includes annual and semester notices, stage results, hours and year-specific deadlines',()=>{
 for(const [regime,count] of [['anual',1],['semestral',2],['misto',3]]){
  const rows=activityChecklist({year:2026,regime,assessmentStages:4});
  assert.equal(rows.filter(r=>r.id.startsWith('admission-notice-')).length,count);
  assert.equal(rows.filter(r=>r.id.startsWith('registration-')).length,count);
  assert.equal(rows.filter(r=>r.id.startsWith('results-')).length,4);
  assert.equal(rows.filter(r=>r.id.startsWith('pedagogical-meeting-')).length,4);
  for(const id of ['family-meeting','campus-events','alumni-meeting','internship-event','women-week','cultural-week'])assert(rows.some(r=>r.id===id));
  assert.equal(rows.find(r=>r.id==='robotics').deadline,'2026-08-31');
  assert.equal(rows.find(r=>r.id==='course-showcase').deadline,'2026-09-30');
  assert.equal(rows.find(r=>r.id==='pedagogical-training').minHours,40);
  assert.equal(rows.find(r=>r.id==='collective-planning').minHours,20);
 }
 assert.equal(activityChecklist({year:2027,regime:'anual'}).find(r=>r.id==='robotics').deadline,undefined);
});
