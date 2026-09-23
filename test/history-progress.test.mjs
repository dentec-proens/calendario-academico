import test from 'node:test';import assert from 'node:assert/strict';
import {historyCandidateKey,includedHistoryCandidate} from '../src/history-progress.mjs';
test('progress follows the source even after renaming and resets when event is removed',()=>{
 const first={page:1,excerpt:'10/05 Feira',name:'Feira'},second={page:1,excerpt:'11/05 Feira',name:'Feira'},list=[first,second];
 const events=[{name:'Nome revisado',historicalSource:{historyId:'pdf',page:1,candidateKey:historyCandidateKey(first)}}];
 assert(includedHistoryCandidate(JSON.parse(JSON.stringify(events)),'pdf',first,list));
 assert(!includedHistoryCandidate(events,'pdf',second,list));assert(!includedHistoryCandidate(events,'other',first,list));assert(!includedHistoryCandidate([],'pdf',first,list));
 assert(!includedHistoryCandidate([{name:'Feira',historicalSource:{historyId:'pdf',page:1}}],'pdf',first,list));
});
