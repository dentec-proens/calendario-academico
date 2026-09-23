import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewSupport,reviewCriteria} from '../src/review.mjs';
import {reviewDocument} from '../src/review-export.mjs';
test('review extracts all 30 criteria, flags other years and treats name matches only as clues',()=>{
 const record={id:'test',name:'Teste',version:1,state:{year:2027,campus:'Foz',offer:'graduacao',regime:'anual',weekdays:[],weekConfirmed:false,periods:[],events:[]}};
 const result=reviewSupport(record,[{id:'f',name:'Formação pedagógica',category:'formacao',start:'2027-02-01',end:'2027-02-01',evidence:'Ata'}]);
 assert.equal(reviewCriteria.length,30);assert.equal(result.sameYear,false);assert.equal(result.officialApproval,false);
 assert(result.criteria.find(c=>c.id==='window').signal.includes('não aplicadas'));
 assert.equal(result.criteria.find(c=>c.id==='XXII').candidates.length,1);
 assert(result.criteria.find(c=>c.id==='XXII').signal.includes('não comprova'));
 assert(result.criteria.find(c=>c.id==='XXV').signal.includes('facultativo'));
 assert(!result.criteria.some(c=>'status' in c));
});
test('initial analysis identifies a measurable deficit without assuming documentary compliance',()=>{
 const record={id:'test',name:'Teste',version:1,courses:'Curso',state:{year:2026,campus:'Foz',offer:'integrado',regime:'anual',weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Ata',periods:[{id:'a',name:'Ano',start:'2026-02-04',end:'2026-12-18'}],events:[]}};
 let result=reviewSupport(record,[]);assert.equal(result.criteria.find(c=>c.id==='annual').initial.status,'PENDENTE');assert.equal(result.criteria.find(c=>c.id==='window').initial.status,'ATENDIDO');
 record.state.periods[0].end='2026-02-10';result=reviewSupport(record,[]);assert.equal(result.criteria.find(c=>c.id==='annual').initial.status,'NAO_ATENDIDO');assert.equal(result.criteria.find(c=>c.id==='annual').initial.reviewed,false);assert.equal(result.criteria.find(c=>c.id==='minutes').initial.status,'PENDENTE');
 const doc=reviewDocument(record,{entries:result.criteria.map(c=>c.initial),reviewer:{name:'Revisor <teste>'},revision:1,calendarVersion:1,catalogueRevision:1,conclusion:'Texto humano <script>alert(1)</script>',processNumber:'23411.000001/2026-00',applicableNorm:'Norma confirmada pelo revisor'});
 assert.equal((doc.html.match(/<tr>/g)||[]).length,31);assert(doc.html.includes('proposta automática, não confirmada'));assert(doc.html.includes('23411.000001/2026-00'));assert(doc.html.includes('2. PARECER'));assert(doc.html.includes('&lt;script&gt;'));assert(!doc.html.includes('<script>'));assert(doc.text.includes('Texto humano <script>'));assert(!doc.html.includes('Documento assinado eletronicamente'));assert(doc.html.includes('Não é documento assinado'));
});
