import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHistory,suggestionsFromPages} from '../src/history-analysis.mjs';
import {createApp} from '../src/application.mjs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function fixture(text='24 FERIADO MUNICIPAL - Padroeiro'){
 const stream=`BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(pdf);
}
test('PDF text extraction preserves page evidence and never assigns dates or confirms events',async()=>{
 const result=await analyzeHistory(fixture());assert.equal(result.needsText,false);assert.equal(result.candidates[0].name,'FERIADO MUNICIPAL - Padroeiro');assert.equal(result.candidates[0].page,1);assert.equal(result.candidates[0].likelyLocal,true);assert.equal(result.candidates[0].start,undefined);
 assert.equal((await analyzeHistory(fixture(''))).needsText,true);
 await assert.rejects(analyzeHistory(Buffer.from('%PDF-broken')));
 const multi=suggestionsFromPages([{page:1,text:'10 11 12 13 Feira de cursos\n24 Feriado municipal\n24 Feriado municipal'}]);assert.equal(multi.candidates.length,2);assert.equal(multi.candidates[0].name,'Feriado municipal');assert.equal(multi.candidates[1].name,'Feira de cursos');
});
test('Campus uploads, analyzes and confirms its historical event, while foreign campus cannot read or analyze it',async t=>{
 const app=await createApp({directory:await mkdtemp(join(tmpdir(),'dentec-history-')),setupCode:'fixture'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const base='http://127.0.0.1:'+app.server.address().port;
 async function call(path,method='GET',body,cookie=''){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Dentec-Request':'1',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 await call('/api/setup','POST',{code:'fixture',name:'Admin ficticio',email:'fixture@ifpr.edu.br',password:'synthetic-test-only-password'});
 const admin=(await call('/api/login','POST',{email:'fixture@ifpr.edu.br',password:'synthetic-test-only-password'})).cookie;
 const panel=(await call('/api/bootstrap','GET',null,admin)).data;
 for(let i=0;i<2;i++)await call('/api/users','POST',{name:'Campus teste '+i,email:`fixture${i}@ifpr.edu.br`,password:'synthetic-test-only-password',campusId:panel.campuses[i].id},admin);
 const campus=(await call('/api/login','POST',{email:'fixture0@ifpr.edu.br',password:'synthetic-test-only-password'})).cookie;
 const other=(await call('/api/login','POST',{email:'fixture1@ifpr.edu.br',password:'synthetic-test-only-password'})).cookie;
 const record=(await call('/api/calendars','POST',{campusId:panel.campuses[0].id,year:2027,offer:'integrado',regime:'anual',purpose:'test',courses:'Curso ficticio'},campus)).data;
 const uploaded=await call('/api/calendars/'+record.id+'/history','POST',{filename:'anterior.pdf',year:2026,data:fixture().toString('base64')},campus);assert.equal(uploaded.status,201);
 const path='/api/history/'+uploaded.data.id+'/analysis';
 assert.equal((await call(path,'POST',{})).status,401);assert.equal((await call(path,'POST',{},other)).status,404);
 const parsed=await call(path,'POST',{},campus);assert.equal(parsed.status,200);assert.equal(parsed.data.candidates[0].category,'feriado');assert.deepEqual((await call(path,'POST',{},campus)).data,parsed.data);
 const fresh=(await call('/api/calendars/'+record.id,'GET',null,campus)).data;assert.equal(fresh.state.events.length,0);assert.equal(fresh.histories[0].analyzed,true);assert(!('analysis' in fresh.histories[0]));assert(!('data' in fresh.histories[0]));
 const state={...fresh.state,events:[{id:'confirmed-local',name:'Feriado municipal confirmado',start:'2027-06-24',end:'2027-06-24',kind:'exclude',category:'feriado',evidence:'Lei municipal conferida pelo diretor',historicalSource:{historyId:uploaded.data.id,page:1}}]};
 assert.equal((await call('/api/calendars/'+record.id,'PUT',{state,version:1,catalogueRevision:fresh.currentCatalogueRevision},campus)).status,200);
 const saved=(await call('/api/calendars/'+record.id,'GET',null,campus)).data;assert.deepEqual(saved.state.events[0].historicalSource,state.events[0].historicalSource);
 state.events[0].historicalSource.historyId='foreign-history';assert.equal((await call('/api/calendars/'+record.id,'PUT',{state,version:2,catalogueRevision:fresh.currentCatalogueRevision},campus)).status,400);
 assert((await call('/api/logs','GET',null,campus)).data.entries.some(e=>e.action==='Calendário anterior analisado'));
});
