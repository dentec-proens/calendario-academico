import test from 'node:test';import assert from 'node:assert/strict';import {suggestStages} from '../src/stage-suggestions.mjs';
const state={year:2027,offer:'integrado',modalities:['integrado'],regime:'anual',assessmentStages:2,weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Ata',periods:[{id:'p',start:'2027-03-01',end:'2027-03-12'}],events:[]};
test('non-teaching stage start is retained but never counted; outside dates are rejected',()=>{
 const events=[{id:'h',kind:'exclude',start:'2027-03-01',end:'2027-03-01',evidence:'Ata'}];
 const result=suggestStages(state,events,'2027-03-01');
 assert.equal(result.stages[0].start,'2027-03-01');assert.equal(result.stages[0].end,'2027-03-08');assert.equal(result.total,9);
 assert.equal(suggestStageEnd(state,events,'2027-03-01',1).end,'2027-03-08');
 assert.throws(()=>suggestStages(state,events,'2027-02-12'),/fora dos períodos/);
});
test('balances teaching days, starts next stage on next teaching date and preserves input',()=>{const before=JSON.stringify(state);const r=suggestStages(state,[],'2027-03-01');assert.deepEqual(r.stages.map(s=>[s.start,s.end,s.days]),[['2027-03-01','2027-03-05',5],['2027-03-08','2027-03-12',5]]);assert.equal(JSON.stringify(state),before);});
test('holidays and included Saturdays change boundaries',()=>{const events=[{id:'holiday',start:'2027-03-05',end:'2027-03-05',kind:'exclude',evidence:'Lei'},{id:'sat',start:'2027-03-06',end:'2027-03-06',kind:'include',evidence:'Ata'}];assert.equal(suggestStages(state,events,'2027-03-01').stages[0].end,'2027-03-06');});
test('respects semester boundaries for four stages and rejects unknown or conflicting bases',()=>{const s={...state,assessmentStages:4,periods:[...state.periods,{id:'q',start:'2027-04-01',end:'2027-04-16'}]};const r=suggestStages(s,[],'2027-03-01');assert.equal(r.stages[1].end,'2027-03-12');assert.equal(r.stages[2].start,'2027-04-01');assert.throws(()=>suggestStages({...state,weekConfirmed:false},[],'2027-03-01'));assert.equal(suggestStages(state,[],'2027-03-07').stages[0].start,'2027-03-07');assert.throws(()=>suggestStages(state,[{requirementId:'stage-1'}],'2027-03-01'));assert.throws(()=>suggestStages({...state,modalities:['integrado','graduacao']},[{id:'a',kind:'exclude',start:'2027-03-02',end:'2027-03-02',modalities:['graduacao'],evidence:'Ata'}],'2027-03-01'));});

import {isFirstStageStart} from '../src/stage-suggestions.mjs';
test('recognizes imported first stage without guessing later stages',()=>{for(const name of ['Início do Período Letivo/1º Semestre/1º Bimestre','Início do 1º trimestre','Início da primeira etapa'])assert.equal(isFirstStageStart(name),true);for(const name of ['Término do 1º bimestre','Início do 2º semestre','Início do terceiro trimestre'])assert.equal(isFirstStageStart(name),false);});
import {suggestStageEnd} from '../src/stage-suggestions.mjs';
test('later stages receive an end date without replacing earlier stages',()=>{
 const events=[{id:'first',kind:'note',requirementId:'stage-1',start:'2027-03-01',end:'2027-03-05'}];
 const before=JSON.stringify(events);
 assert.equal(suggestStageEnd(state,events,'2027-03-08',2).end,'2027-03-12');
 assert.equal(JSON.stringify(events),before);
 assert.throws(()=>suggestStageEnd(state,events,'2027-03-05',2),/sobrepõe/);
 assert.throws(()=>suggestStageEnd(state,events,'2027-03-09',2),/suficientes/);
 assert.throws(()=>suggestStageEnd(state,events,'2027-03-01',1),/registrada/);
});
test('single stage suggestion counts holidays and explicit Saturdays',()=>{
 const events=[{id:'h',kind:'exclude',start:'2027-03-05',end:'2027-03-05',evidence:'Lei'},{id:'s',kind:'include',start:'2027-03-06',end:'2027-03-06',evidence:'Ata'}];
 assert.equal(suggestStageEnd(state,events,'2027-03-01',1).end,'2027-03-06');
});
