import test from 'node:test';import assert from 'node:assert/strict';import {durationEnd} from '../src/duration.mjs';
const state={year:2027,modalities:['integrado'],weekConfirmed:true,weekdays:[1,2,3,4,5]};
test('inclusive vacation duration crosses months and leap day',()=>{assert.equal(durationEnd('2027-01-02',30),'2027-01-31');assert.equal(durationEnd('2028-02-20',15),'2028-03-05');assert.throws(()=>durationEnd('2027-01-02',0));assert.throws(()=>durationEnd('2027-02-30',30));});
test('teaching duration excludes holidays and includes explicit Saturdays',()=>{assert.equal(durationEnd('2027-03-01',5,state),'2027-03-05');const events=[{start:'2027-03-05',end:'2027-03-05',kind:'exclude'},{start:'2027-03-06',end:'2027-03-06',kind:'include'}];assert.equal(durationEnd('2027-03-01',5,state,events),'2027-03-06');assert.throws(()=>durationEnd('2027-03-01',5,{...state,weekConfirmed:false}));assert.throws(()=>durationEnd('2027-12-31',3,state));});

import {recalculatePeriods} from '../src/duration.mjs';
test('preserves 100 days per semester as exclusions change and never overlaps periods silently',()=>{
 const s={...state,periods:[{id:'one',name:'1º semestre',start:'2027-02-09',end:'2027-06-01',targetDays:100},{id:'two',name:'2º semestre',start:'2027-08-02',end:'2027-12-01',targetDays:100}]};
 const before=JSON.stringify(s),base=recalculatePeriods(s,[]),changed=recalculatePeriods(s,[{kind:'exclude',start:'2027-03-01',end:'2027-03-05'}]);assert(changed[0].end>base[0].end);assert.equal(changed[1].end,base[1].end);assert.equal(JSON.stringify(s),before);assert.deepEqual(recalculatePeriods({...s,periods:changed},[]),base);
 assert.throws(()=>recalculatePeriods({...s,periods:[s.periods[0],{...s.periods[1],start:'2027-03-01'}]},[]),/alcança/);
});
