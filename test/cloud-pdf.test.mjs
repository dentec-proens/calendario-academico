import test from 'node:test';
import assert from 'node:assert/strict';

test('serverless Chromium renders the institutional PDF without Windows dependencies',{skip:process.platform!=='linux'},async()=>{
 const {cloudPdf}=await import('../src/cloud-pdf.mjs');
 const state={year:2027,campus:'Campus de teste',offer:'integrado',regime:'anual',weekdays:[1,2,3,4,5],weekConfirmed:true,weekEvidence:'Teste',periods:[{id:'p',name:'Ano letivo',start:'2027-02-01',end:'2027-12-17'}],events:[]};
 const pdf=await cloudPdf({state,courses:'Curso de teste',classes:'1º ano',shifts:'Matutino',version:1,currentCatalogueRevision:1},[]);
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert(pdf.length>10000);
});
