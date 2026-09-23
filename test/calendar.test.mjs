import test from 'node:test';
import assert from 'node:assert/strict';
import {countCalendar, datesBetween, daysBefore, firstTeachingDateAfter} from '../src/calendar.mjs';

// All evidence IDs and scenarios are synthetic, not institutional seed data.
const fixture = () => ({year:2027, offerId:'test-offer', periods:[{id:'p1', start:'2027-02-01', end:'2027-02-07'}], weekPattern:{weekdays:[1,2,3,4,5],confirmed:true,evidenceId:'synthetic-week'}, inclusions:[], exclusions:[], thresholds:{annual:5,byPeriod:{p1:5}}});
const event = (id,start,end=start,offerIds=['test-offer'])=>({id,start,end,offerIds,confirmed:true,evidenceId:'synthetic-'+id});

test('ordinary week counts five unique dates with evidence',()=>{
  const r=countCalendar(fixture()); assert.equal(r.total,5); assert.equal(r.ledger.length,7); assert.equal(r.byWeekday[1],1); assert.deepEqual(r.ledger[0].evidenceIds,['synthetic-week']); assert.equal(r.officialApproval,false); assert.equal(r.institutionalValidation,'INCOMPLETE');
});
test('inclusive leap interval and civil date rejection',()=>{
  assert.deepEqual(datesBetween('2028-02-28','2028-03-01'),['2028-02-28','2028-02-29','2028-03-01']);
  assert.throws(()=>datesBetween('2027-02-29','2027-03-01'));
  assert.throws(()=>datesBetween('2027-04-31','2027-05-01'));
  assert.throws(()=>datesBetween('01/02/2027','2027-02-02'));
  assert.throws(()=>datesBetween('2027-02-02','2027-02-01'));
});
test('Saturday needs explicit confirmed inclusion; duplicate activities count once',()=>{
  const x=fixture(); x.inclusions=[event('a','2027-02-06'),event('b','2027-02-06')];
  assert.equal(countCalendar(x).total,6);
  x.inclusions[0].confirmed=false; assert.throws(()=>countCalendar(x));
});
test('holiday excludes Saturday and exposes conflict',()=>{
  const x=fixture(); x.inclusions=[event('a','2027-02-06')]; x.exclusions=[event('h','2027-02-06')];
  const r=countCalendar(x); assert.equal(r.total,5); assert.equal(r.conflicts[0].date,'2027-02-06');
});
test('overlapping holiday and recess excluded only once',()=>{
  const x=fixture(); x.exclusions=[event('h','2027-02-02'),event('r','2027-02-02','2027-02-03')];
  assert.equal(countCalendar(x).total,3);
});
test('other offer exclusion does not affect target offer',()=>{
  const x=fixture(); x.exclusions=[event('h','2027-02-02','2027-02-02',['another-offer'])]; assert.equal(countCalendar(x).total,5);
});
test('null minimum is not verifiable, zero is an explicit minimum',()=>{
  const x=fixture(); x.thresholds.annual=null; x.thresholds.byPeriod.p1=0;
  assert.deepEqual(countCalendar(x).checks.map(c=>c.status),['NOT_VERIFIABLE','MET']);
});
test('annual total cannot hide a period deficit',()=>{
  const x=fixture(); x.periods.push({id:'p2',start:'2027-02-08',end:'2027-02-12'}); x.thresholds={annual:10,byPeriod:{p1:6,p2:4}};
  assert.deepEqual(countCalendar(x).checks.map(c=>c.status),['MET','NOT_MET','MET']);
});
test('overlapping periods, foreign year and out-of-period inclusions rejected',()=>{
  const x=fixture(); x.periods.push({id:'p2',start:'2027-02-07',end:'2027-02-09'}); x.thresholds.byPeriod.p2=1; assert.throws(()=>countCalendar(x));
  const y=fixture(); y.periods[0].start='2026-12-31'; assert.throws(()=>countCalendar(y));
  const z=fixture(); z.inclusions=[event('a','2027-02-08')]; assert.throws(()=>countCalendar(z));
});
test('missing evidence, scope and thresholds cannot silently pass',()=>{
  const x=fixture(); x.weekPattern.evidenceId=''; assert.throws(()=>countCalendar(x));
  const y=fixture(); y.exclusions=[event('a','2027-02-02')]; y.exclusions[0].offerIds=[]; assert.throws(()=>countCalendar(y));
  const z=fixture(); delete z.thresholds.byPeriod.p1; assert.throws(()=>countCalendar(z));
});
test('next teaching day is not presumed to be next weekday',()=>{
  assert.equal(firstTeachingDateAfter('2027-02-05',['2027-02-09','2027-02-05','2027-02-06']),'2027-02-06');
  assert.equal(firstTeachingDateAfter('2027-02-09',['2027-02-09']),null);
});
test('60-day administrative deadline crosses civil year',()=>{
  assert.equal(daysBefore('2027-02-01',60),'2026-12-03');
});
test('input remains unchanged and repeated calculation is identical',()=>{
  const x=fixture(), before=JSON.stringify(x); const first=countCalendar(x);
  assert.deepEqual(first,countCalendar(x)); assert.equal(JSON.stringify(x),before);
});
