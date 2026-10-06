import test from 'node:test';import assert from 'node:assert/strict';import {teacherVacations} from '../src/teacher-vacations.mjs';
test('campus vacation intervals are flexible, counted inclusively, and reject overlap',()=>{const v=teacherVacations(2027,{firstStart:'2027-03-01',firstEnd:'2027-03-20',secondStart:'2027-08-01',secondEnd:'2027-08-25'},'Decisão do campus');assert.equal(v.total,45);assert.equal(v.events[0].start,'2027-03-01');assert.throws(()=>teacherVacations(2027,{firstStart:'2027-03-01',firstEnd:'2027-03-20',secondStart:'2027-03-20',secondEnd:'2027-03-25'},'Ata'));assert.throws(()=>teacherVacations(2027,{firstStart:'2027-03-01'},'Ata'));});

test('three campus intervals total 45 days and retain stable legacy IDs',()=>{
 const input={firstStart:'2027-01-02',firstEnd:'2027-01-16',secondStart:'2027-07-01',secondEnd:'2027-07-15',thirdStart:'2027-12-01',thirdEnd:'2027-12-15'};
 const v=teacherVacations(2027,input,'Ata');assert.equal(v.total,45);assert.equal(v.events.length,3);
 assert.deepEqual(v.events.map(e=>e.id),['teacher-vacation-january','teacher-vacation-july','teacher-vacation-third']);
 assert.throws(()=>teacherVacations(2027,{...input,thirdStart:'2027-07-15'},'Ata'),/sobrepor/);
 assert.throws(()=>teacherVacations(2027,{...input,thirdEnd:''},'Ata'),/início e término/);
 assert.throws(()=>teacherVacations(2027,{...input,thirdEnd:'2028-01-01'},'Ata'),/ano/);
 const two=teacherVacations(2027,{...input,thirdStart:'',thirdEnd:''},'Ata');assert.equal(two.events.length,2);assert.equal(two.total,30);
});
