import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedConclusion,updateConclusion,partialConclusion,favorableConclusion} from '../src/review-conclusion.mjs';
const criteria=[{id:'a'},{id:'b'}];
const entries=(a,b,reviewed=true)=>[{id:'a',status:a,reviewed},{id:'b',status:b,reviewed}];
test('favorable conclusion requires complete human confirmation and accepts non-applicable items',()=>{
 assert.equal(suggestedConclusion(criteria,entries('ATENDIDO','ATENDIDO')),favorableConclusion);
 assert.equal(suggestedConclusion(criteria,entries('ATENDIDO','NAO_APLICAVEL')),favorableConclusion);
 assert.equal(suggestedConclusion(criteria,entries('ATENDIDO','ATENDIDO',false)),'');
 assert.equal(suggestedConclusion(criteria,entries('ATENDIDO','PENDENTE')),'');
 assert.equal(suggestedConclusion(criteria,entries('NAO_APLICAVEL','NAO_APLICAVEL')),'');
 assert.equal(suggestedConclusion(criteria,[]),'');
});
test('confirmed unmet item returns the process, including while other items remain pending',()=>{
 assert.equal(suggestedConclusion(criteria,entries('NAO_ATENDIDO','PENDENTE')),partialConclusion);
 assert.equal(suggestedConclusion(criteria,entries('NAO_ATENDIDO','ATENDIDO',false)),'');
});
test('changing findings replaces the standard paragraph and preserves reviewer prose without duplicates',()=>{
 const base='Observações do parecerista.';
 const approved=updateConclusion(base,criteria,entries('ATENDIDO','ATENDIDO'));
 assert.equal(approved,base+'\n\n'+favorableConclusion);
 assert.equal(updateConclusion(approved,criteria,entries('ATENDIDO','ATENDIDO')),approved);
 assert.equal(updateConclusion(approved,criteria,entries('NAO_ATENDIDO','ATENDIDO')),base+'\n\n'+partialConclusion);
 assert.equal(updateConclusion(approved,criteria,entries('PENDENTE','ATENDIDO')),base);
});
