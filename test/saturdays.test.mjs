import test from 'node:test';
import assert from 'node:assert/strict';
import {monthSaturdays,saturdayEvents} from '../src/saturdays.mjs';
import {calendarResult} from '../src/pdf.mjs';
test('month selection adds only chosen Saturdays, survives serialization, and respects conflicts',()=>{
 const s={year:2027,offer:'integrado',regime:'anual',weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Ata',periods:[{id:'year',name:'Ano',start:'2027-02-01',end:'2027-03-31'}],events:[]};
 assert.deepEqual(monthSaturdays(2027,2),['2027-02-06','2027-02-13','2027-02-20','2027-02-27']);
 let id=0;const make=()=>String(++id);
 s.events=saturdayEvents(s,['2027-02-06','2027-02-20','2027-02-20'],'Sábado letivo','Ata 1',make);
 const restored=JSON.parse(JSON.stringify(s));assert.equal(calendarResult(restored,restored.events).byWeekday[6],2);
 assert.equal(saturdayEvents(s,['2027-02-06'],'Sábado','Ata',make).length,0);
 const result=calendarResult(s,[...s.events,{id:'holiday',name:'Feriado',start:'2027-02-20',end:'2027-02-20',kind:'exclude',evidence:'Lei'}]);assert.equal(result.byWeekday[6],1);assert.equal(result.conflicts.length,1);
 assert.throws(()=>saturdayEvents(s,['2027-04-03'],'Sábado','Ata',make),/fora/);
 assert.throws(()=>saturdayEvents(s,['2027-02-05'],'Sábado','Ata',make),/sábados/);
 assert.throws(()=>saturdayEvents(s,['2027-02-27'],'Sábado','',make),/fonte/);
});
