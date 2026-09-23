import test from 'node:test';import assert from 'node:assert/strict';
import {historyCandidateKey,includedHistoryCandidate} from '../src/history-progress.mjs';
test('progress follows the source even after renaming and resets when event is removed',()=>{
 const first={page:1,excerpt:'10/05 Feira',name:'Feira'},second={page:1,excerpt:'11/05 Feira',name:'Feira'},list=[first,second];
 const events=[{name:'Nome revisado',historicalSource:{historyId:'pdf',page:1,candidateKey:historyCandidateKey(first)}}];
 assert(includedHistoryCandidate(JSON.parse(JSON.stringify(events)),'pdf',first,list));
 assert(!includedHistoryCandidate(events,'pdf',second,list));assert(!includedHistoryCandidate(events,'other',first,list));assert(!includedHistoryCandidate([],'pdf',first,list));
 assert(!includedHistoryCandidate([{name:'Feira',historicalSource:{historyId:'pdf',page:1}}],'pdf',first,list));
});

import {existingHistoryEvent} from '../src/history-progress.mjs';
const setup={year:2027,assessmentStages:4,modalities:['integrado','graduacao']};
test('history suppresses existing obligations across changed dates, but preserves different stages and scopes',()=>{
 const candidate={name:'Início do Período Letivo/1º Semestre/1º Bimestre'};
 const event={name:'1ª etapa',requirementId:'stage-1',start:'2027-02-09',end:'2027-04-20'};
 assert.equal(existingHistoryEvent([event],candidate,setup),event);
 assert.equal(existingHistoryEvent([{...event,modalities:['integrado']}],candidate,setup),null);
 assert.equal(existingHistoryEvent([event],{name:'Início do 2º bimestre'},setup),null);
 assert.equal(existingHistoryEvent([] ,candidate,setup),null);
 assert.equal(existingHistoryEvent([{...event,requirementId:'pit-1'}],{name:'Prazo final de entrega do PIT do 1º semestre'},setup)?.requirementId,'pit-1');
});
test('same names require matching dates and keep distinct recurring events',()=>{
 const candidate={name:'FEIRA LOCAL',dates:{startMonth:5,startDay:10,endMonth:5,endDay:10}};
 const event={name:'Feira local',start:'2027-05-10',end:'2027-05-10'};
 assert.equal(existingHistoryEvent([event],candidate,setup),event);
 assert.equal(existingHistoryEvent([{...event,start:'2027-05-11'}],candidate,setup),null);
 assert.equal(existingHistoryEvent([event],{name:'Feira local'},setup),null);
});
