import {proposedDates} from '/history-dates.mjs';
import {historyCandidateKey,includedHistoryCandidate} from '/history-progress.mjs';
import {suggestStages,isFirstStageStart} from '/stage-suggestions.mjs';
import {teacherVacations} from '/teacher-vacations.mjs';
import {regimeLabels} from '/calendar-label.mjs';
import {evaluateCalendar} from '/evaluation.mjs';
import {calendarModalities,modalityLabels} from '/modalities.mjs';
import {activityChecklist} from '/obligations.mjs';
import {filePayload} from './upload.js';
import {categories,eventCategory,categoryLabel} from '/categories.mjs';
import {countCalendar, datesBetween, parseDate} from '/calendar.mjs';
import {monthSaturdays,saturdayEvents} from '/saturdays.mjs';
import {proensLayout} from '/print.mjs';
const $=id=>document.getElementById(id);
const eventFormHome=document.createComment('event-form-home');$('event-form').before(eventFormHome);
let inlineHistoryIndex=null;
let state={schemaVersion:1,campus:'',year:2027,offer:'',regime:'anual',weekdays:[],weekEvidence:'',weekConfirmed:false,periods:[],events:[]};
let dirty=false, result=null;
let historicalSource=null,historyAnalysis=null,analyzedHistory=null;
let record=null,institutional=[];
const calendarId=new URLSearchParams(location.search).get('id');
const allEvents=()=>[...institutional,...state.events];
async function api(path,method='GET',body){const r=await fetch(path,{method,headers:body?{'Content-Type':'application/json','X-Dentec-Request':'1'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(r.status===401){location.href='/';throw Error('Entre com sua conta.');}if(!r.ok)throw Error(data.error);return data;}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const offers={posgraduacao:'Pós-graduação',tecnico:'Cursos técnicos',integrado:'Técnico integrado',subsequente:'Técnico subsequente',graduacao:'Graduação'};
const dateLabel=s=>s.split('-').reverse().join('/');
const message=(text,error=false)=>{$('message').textContent=new Date().toLocaleTimeString('pt-BR')+' — '+text;$('message').className=error?'error':'';};
function act(fn){try{fn();}catch(e){message(e.message,true);}}
function identified(){if(!state.campus || !state.offer)throw Error('Abra um calendário com campus e forma de oferta/nível cadastrados antes de continuar.');}
function interval(start,end){datesBetween(start,end);if(Number(start.slice(0,4))!==state.year || Number(end.slice(0,4))!==state.year)throw Error('As datas devem pertencer ao ano selecionado.');}
function engineInput(){return {year:state.year,offerId:state.offer,periods:state.periods,weekPattern:{weekdays:state.weekdays,confirmed:state.weekConfirmed,evidenceId:state.weekEvidence},inclusions:allEvents().filter(e=>e.kind==='include').map(e=>({...e,offerIds:[state.offer],confirmed:true,evidenceId:e.evidence})),exclusions:allEvents().filter(e=>e.kind==='exclude').map(e=>({...e,offerIds:[state.offer],confirmed:true,evidenceId:e.evidence})),thresholds:{annual:state.year===2027?200:null,byPeriod:Object.fromEntries(state.periods.map(p=>[p.id,state.year===2027&&state.regime!=='anual'?100:null]))}};}
function render(){
 $('regime-summary').textContent='Organização: '+regimeLabels[state.regime];

 if(dirty)message('Alteração aplicada ao rascunho. Use Salvar no sistema para registrar a versão.');
 $('selected-modalities').textContent='Forma de oferta/nível: '+calendarModalities(state).filter(Boolean).map(m=>modalityLabels[m]).join(' + ');
 const requirements=activityChecklist(state);
 $('assessment-stages').value=state.assessmentStages||'';
 $('event-modalities').innerHTML=calendarModalities(state).filter(Boolean).map(m=>`<label class="check"><input type="checkbox" name="event-modality" value="${m}" checked>${escape(modalityLabels[m])}</label>`).join('');
 const selected=$('event-requirement').value;
 $('event-requirement').innerHTML='<option value="">Outro evento / sem vínculo</option>'+requirements.map(r=>`<option value="${r.id}">${escape(r.name)}</option>`).join('');
 $('event-requirement').value=selected;
 $('activity-checklist').innerHTML=requirements.map(r=>`<li><div><strong>${escape(r.name)}</strong><small>${state.events.some(e=>e.requirementId===r.id)?'Evento vinculado — sujeito à conferência':'Pendente de data e fonte'}</small></div><button type="button" data-prepare-activity="${r.id}">Preencher atividade</button></li>`).join('');

  result=null;const issues=[];
  if(!state.campus||!state.offer)issues.push(['Pendente','Identificação','Informe campus e oferta.']);
  if(!state.weekConfirmed)issues.push(['Pendente','Semana letiva','Registre e confirme os dias regulares e a referência da decisão.']);
  if(!state.periods.length)issues.push(['Pendente','Períodos letivos','Cadastre pelo menos um período com início e término.']);
  if(state.regime!=='anual'&&state.periods.length!==2)issues.push(['Pendente','Organização semestral','Cadastre exatamente dois semestres para a conferência anual.']);
  if(state.campus&&state.offer&&state.weekConfirmed&&state.periods.length){try{result=evaluateCalendar(state,allEvents());}catch(e){issues.push(['Corrigir','Dados do calendário',e.message]);}}
  if(result){
    for(const [modality,detail] of Object.entries(result.byModality))for(const c of detail.checks){if(c.scope!=='annual'&&state.regime==='anual')continue;const name=c.scope==='annual'?'Total anual':state.periods.find(p=>p.id===c.scope).name;issues.push([c.status==='MET'?'Atendido':c.status==='NOT_MET'?'Corrigir':'Pendente',modalityLabels[modality]+' — '+name,c.expected===null?'Não há mínimo normativo configurado para este escopo.':`${c.observed} de ${c.expected} dias mínimos. ${state.year===2027?'Resolução 2027, art. 4º.':''}`]);}
    for(const c of result.conflicts)issues.push(['Conflito',dateLabel(c.date),'Há inclusão e exclusão na mesma data. O dia foi excluído da contagem até a resolução do conflito.']);
  }
  issues.push(['Pendente','Feriados municipais e decisões locais','Confira a legislação municipal. Os itens nacionais e institucionais vêm da base ADMIN; os locais precisam ser registrados com fonte.'],['Pendente','Parecer e demais requisitos','As datas centrais e metas de dias estão incorporadas. O checklist completo, a sequência de atividades e as verificações humanas ainda não estão automatizados.'],['Pendente','Carga horária e apreciação institucional','Horas, atividades pedagógicas, atas e demais requisitos precisam de análise documental. Não há aprovação oficial.']);
  if(record&&record.catalogueRevision!==record.currentCatalogueRevision)issues.unshift(['Atualizado','Base institucional',`Esta tela incorpora a revisão ${record.currentCatalogueRevision}. O último salvamento usava a revisão ${record.catalogueRevision}. Confira o impacto e salve nova versão.`]);
  $('total').textContent=result?result.total:'—';$('goal').textContent=result?('Marcação dos dias: '+modalityLabels[calendarModalities(state)[0]]+'. ')+(state.year===2027?'Referência: mínimo anual de 200 dias.':'Sem meta normativa cadastrada para este ano.'):'Configure identificação, semana e períodos.';
  $('period-count').textContent=state.periods.length;
  $('period-summary').textContent=result?Object.entries(result.byModality).map(([m,r])=>modalityLabels[m]+': '+r.total+' dias — '+state.periods.map(p=>`${p.name}: ${r.byPeriod[p.id]}`).join(' · ')).join(' | '):'Aguardando dados para contagem';
  $('period-list').innerHTML=state.periods.length?state.periods.map(p=>`<li><div><strong>${escape(p.name)}</strong><small>${dateLabel(p.start)} a ${dateLabel(p.end)}</small></div><button data-remove-period="${escape(p.id)}" aria-label="Remover ${escape(p.name)}">Remover</button></li>`).join(''):'<li class="help">Nenhum período cadastrado.</li>';
  $('event-list').innerHTML=allEvents().length?allEvents().sort((a,b)=>a.start.localeCompare(b.start)).map(e=>`<li><div><strong>${escape(e.name)}</strong><small>${dateLabel(e.start)} a ${dateLabel(e.end)} · ${{include:'Inclusão letiva',exclude:'Exclusão',note:'Sem efeito na contagem'}[e.kind]}</small><small>Fonte: ${escape(e.evidence)}</small>${e.historicalSource?`<small>Origem histórica: página ${e.historicalSource.page} do <a href="/api/history/${escape(e.historicalSource.historyId)}">calendário anterior</a></small>`:""}<small>${escape(categoryLabel(e))}</small></div>${e.institutional?'<span class="institution-label">Base PROENS</span>':`<label>Categoria e cor<select data-category-event="${escape(e.id)}">${categories.map(([key,label])=>`<option value="${key}" ${eventCategory(e)===key?'selected':''}>${label}</option>`).join('')}</select></label><label>Atividade do roteiro<select data-link-activity="${escape(e.id)}"><option value="">Sem vínculo</option>${activityChecklist(state).map(r=>`<option value="${r.id}" ${e.requirementId===r.id?'selected':''}>${escape(r.name)}</option>`).join('')}</select></label><button data-remove-event="${escape(e.id)}" aria-label="Remover ${escape(e.name)}">Remover</button>`}</li>`).join(''):'<li class="help">Nenhum evento registrado. Confira a base para este ano.</li>';
  if(record?.purpose!=='test'){issues.push([!dirty&&record?.readiness?.ready?'Atendido':'Pendente','Geração definitiva',dirty?'Salve as alterações para atualizar a conferência.':record?.readiness?.ready?'Conferência registrada. Não representa aprovação oficial.':'A geração exige revisão completa.']);if(!dirty)for(const issue of record?.readiness?.issues||[])issues.push(['Pendente','Exigência obrigatória',issue]);}
  $('issue-count').textContent=issues.filter(i=>i[0]!=='Atendido').length;
  $('issue-list').innerHTML=issues.map(([mark,title,detail])=>`<li class="issue-item"><span class="issue-mark">${mark}</span><div><strong>${escape(title)}</strong><small>${escape(detail)}</small></div></li>`).join('');
  $('calendar-title').textContent=`${state.year} · ${state.campus || 'Campus não informado'}${state.offer?' · '+calendarModalities(state).map(m=>modalityLabels[m]).join(' + '):''}`;
  $('months').innerHTML=proensLayout(state,allEvents(),result,record);
  renderSaturdays();updateStageSuggestion();renderHistorySuggestions();
}
function sync(){for(const [field,id] of [['firstStart','vacation-first-start'],['firstEnd','vacation-first-end'],['secondStart','vacation-second-start'],['secondEnd','vacation-second-end']])$(id).value=state.teacherVacations?.[field]||'';$('vacation-evidence').value=state.teacherVacations?.evidence||'';vacationPreview();if(['integrado','subsequente','posgraduacao'].includes(state.offer)&&!Array.from($('offer').options).some(o=>o.value===state.offer))$('offer').add(new Option(modalityLabels[state.offer],state.offer));for(const key of ['campus','year','offer','regime'])$(key).value=state[key];document.querySelectorAll('#weekdays input').forEach(el=>el.checked=state.weekdays.includes(Number(el.value)));$('week-evidence').value=state.weekEvidence;$('week-confirmed').checked=state.weekConfirmed;}
$('identity').onsubmit=e=>e.preventDefault();
$('week-form').addEventListener('submit',e=>{e.preventDefault();act(()=>{
  identified();const weekdays=[...document.querySelectorAll('#weekdays input:checked')].map(el=>Number(el.value));
  if(!weekdays.length)throw Error('Selecione pelo menos um dia regular.');
  if(!$('week-evidence').value.trim())throw Error('Informe a referência da semana letiva.');
  Object.assign(state,{weekdays,weekEvidence:$('week-evidence').value.trim(),weekConfirmed:$('week-confirmed').checked});dirty=true;render();message('Semana letiva confirmada. Contagem atualizada.');
});});
$('period-form').addEventListener('submit',e=>{e.preventDefault();act(()=>{
  if(isStageRequest()){applyStageSuggestion();return;}
  identified();const start=$('period-start').value,end=$('period-end').value,name=$('period-name').value.trim();interval(start,end);
  if(!name)throw Error('Informe o nome do período.');
  if(state.periods.some(p=>p.start<=end&&p.end>=start))throw Error('Este período se sobrepõe a outro. Ajuste as datas.');
  state.periods.push({id:crypto.randomUUID(),name,start,end});dirty=true;e.target.reset();render();message('Período adicionado.');
});});
$('event-form').addEventListener('submit',e=>{e.preventDefault();act(()=>{
  identified();const start=$('event-start').value,end=$('event-end').value,kind=$('event-kind').value,name=$('event-name').value.trim(),evidence=$('event-evidence').value.trim();interval(start,end);
  if(!name||!evidence)throw Error('Informe descrição e fonte.');
  if(kind==='include'&&datesBetween(start,end).some(date=>!state.periods.some(p=>p.start<=date&&p.end>=date)))throw Error('Inclusões letivas devem estar dentro dos períodos cadastrados.');
  const modalities=[...document.querySelectorAll('input[name=event-modality]:checked')].map(el=>el.value);if(!modalities.length)throw Error('Selecione ao menos uma forma de oferta/nível para o evento.');
  if(state.events.some(ev=>ev.name.toLocaleLowerCase()===name.toLocaleLowerCase()&&ev.start===start&&ev.end===end))throw Error('Este evento já foi incluído com as mesmas datas.');
  const completedHistoryIndex=inlineHistoryIndex;state.events.push({historicalSource,modalities,requirementId:$('event-requirement').value||undefined,id:crypto.randomUUID(),name,start,end,kind,evidence,category:$('event-category').value});historicalSource=null;$('historical-event-source').hidden=true;dirty=true;e.target.reset();$('event-category').value='recesso';render();if(completedHistoryIndex!==null){const row=document.querySelector('[data-history-item="'+completedHistoryIndex+'"]');row?.scrollIntoView({block:'nearest'});}message('Evento registrado. Contagem atualizada. Salve no sistema para guardar.');
});});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.view){document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view);document.querySelectorAll('.tab').forEach(t=>{t.classList.toggle('active',t===b);if(t===b)t.setAttribute('aria-current','page');else t.removeAttribute('aria-current');});}
  if(b.dataset.removePeriod){state.periods=state.periods.filter(p=>p.id!==b.dataset.removePeriod);dirty=true;render();message('Período removido. Confira os eventos que dependiam dele.');}
  if(b.dataset.removeEvent){if(['teacher-vacation-january','teacher-vacation-july'].includes(b.dataset.removeEvent)){delete state.teacherVacations;state.events=state.events.filter(ev=>!['teacher-vacation-january','teacher-vacation-july'].includes(ev.id));sync();}state.events=state.events.filter(ev=>ev.id!==b.dataset.removeEvent);dirty=true;render();message('Evento removido.');}
});
$('save').onclick=()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`rascunho-calendario-${state.year}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Download solicitado. Guarde o arquivo para continuar depois. Somente dados aplicados aos formulários foram incluídos.');
};
$('load').onclick=()=>{if(!dirty||confirm('Abrir outro rascunho substituirá os dados desta sessão. Você já baixou o atual?'))$('file').click();};
function validateImport(s){
  if(!s||s.schemaVersion!==1||!Number.isInteger(s.year)||s.year<1900||s.year>9999||!['','posgraduacao','tecnico','integrado','subsequente','graduacao'].includes(s.offer)||!['anual','semestral','misto'].includes(s.regime))throw Error('Formato de rascunho incompatível.');
  const str=(v,max)=>typeof v==='string'&&v.length<=max;
  if(!str(s.campus,120)||!str(s.weekEvidence,240)||typeof s.weekConfirmed!=='boolean'||!Array.isArray(s.weekdays)||s.weekdays.length>5||new Set(s.weekdays).size!==s.weekdays.length||s.weekdays.some(d=>!Number.isInteger(d)||d<1||d>5))throw Error('Identificação ou semana inválida.');
  if(s.weekConfirmed&&(!s.weekEvidence.trim()||!s.weekdays.length))throw Error('Semana confirmada sem referência ou dias.');
  if(!Array.isArray(s.periods)||s.periods.length>50||!Array.isArray(s.events)||s.events.length>1000)throw Error('Quantidade ou formato de registros inválido.');
  const ids=new Set();
  for(const [arr,event] of [[s.periods,false],[s.events,true]])for(const x of arr){
    if(!x||!str(x.id,100)||!x.id||ids.has(x.id)||!str(x.name,160)||!x.name.trim())throw Error('Registro inválido ou duplicado.');ids.add(x.id);
    datesBetween(x.start,x.end);if(Number(x.start.slice(0,4))!==s.year||Number(x.end.slice(0,4))!==s.year)throw Error('Data fora do ano do rascunho.');
    if(event&&x.category!==undefined&&!categories.some(([key])=>key===x.category))throw Error('Categoria PROENS inválida.');
    if(event&&(!['include','exclude','note'].includes(x.kind)||!str(x.evidence,240)||!x.evidence.trim()))throw Error('Evento sem tipo ou referência válida.');
  }
  for(let i=0;i<s.periods.length;i++)for(let j=i+1;j<s.periods.length;j++)if(s.periods[i].start<=s.periods[j].end&&s.periods[i].end>=s.periods[j].start)throw Error('Rascunho com períodos sobrepostos.');
  return {schemaVersion:1,modalities:s.modalities,assessmentStages:s.assessmentStages,teacherVacations:s.teacherVacations,campus:s.campus,year:s.year,offer:s.offer,regime:s.regime,weekdays:s.weekdays,weekEvidence:s.weekEvidence,weekConfirmed:s.weekConfirmed,periods:s.periods.map(({id,name,start,end})=>({id,name,start,end})),events:s.events.map(e=>({...e,category:eventCategory(e)}))};
}
$('file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2_000_000)throw Error('O rascunho excede o limite de 2 MB.');const next=validateImport(JSON.parse(await f.text()));if(record&&(next.year!==record.state.year||next.offer!==record.state.offer||next.campus!==record.state.campus))throw Error('O rascunho deve corresponder ao campus, ano e oferta deste registro.');state=next;dirty=true;sync();render();message('Rascunho importado. Clique em Salvar no sistema para registrar uma versão.');}catch(err){message('Não foi possível abrir: '+err.message,true);}finally{e.target.value='';}};
$('print').onclick=async()=>{try{if(dirty)throw Error('Salve no sistema antes de imprimir, para identificar corretamente a versão.');const fresh=await api('/api/calendars/'+calendarId);if(fresh.version!==record.version||fresh.currentCatalogueRevision!==record.currentCatalogueRevision)throw Error('O calendário ou a base institucional mudou. Reabra e confira antes de imprimir.');if(fresh.purpose!=='test'&&!fresh.readiness?.ready)throw Error('Impressão definitiva bloqueada. '+(fresh.readiness?.issues||[]).join('\n'));window.print();}catch(e){message(e.message,true);}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
// Structured read tool only: no mutation or automatic confirmation by agents.
if(navigator.modelContext?.registerTool)navigator.modelContext.registerTool({name:'read_calendar_summary',description:'Read the local calendar totals and pending checks; never certifies institutional approval.',inputSchema:{type:'object',properties:{}},execute:async()=>({content:[{type:'text',text:JSON.stringify({campus:state.campus,year:state.year,offer:state.offer,total:result?.total??null,officialApproval:false,institutionalValidation:'INCOMPLETE'})}]})});
async function openRecord(){if(!calendarId){location.href='/';return;}try{record=await api('/api/calendars/'+calendarId);state=record.state;institutional=record.institutionalEvents;sync();for(const key of ['campus','year','offer'])$(key).disabled=true;$('record-heading').textContent=`${record.purpose==='test'?'[TESTE]':'[DEFINITIVO]'} ${record.name} · ${record.courses}${record.classes?' · '+record.classes:''}${record.shifts?' · '+record.shifts:''}`;showHistory();render();if(location.hash==='#history-area')openHistory();}catch(e){message(e.message,true);}}
function openHistory(){document.querySelector('[data-view="edit"]').click();$('history-area').scrollIntoView({behavior:'smooth'});$('history-file').focus({preventScroll:true});}
$('open-history').onclick=openHistory;
function showHistory(){$('history-list').innerHTML=record.histories.length?record.histories.map(h=>`<li><div><strong>${h.year} · ${escape(h.filename)}</strong><small>Referência histórica deste campus</small><small>${escape(h.notes||'Sem observações registradas.')}</small><a href="/api/history/${escape(h.id)}">Consultar PDF original</a></div><button type="button" data-analyze-history="${escape(h.id)}">Identificar datas e atividades</button></li>`).join(''):'<li>Envie o calendário anterior para consultar seus feriados e eventos locais.</li>';}
async function analyzeUploadedHistory(id){
 $('history-status').textContent='PDF guardado. Lendo o texto para identificar possíveis feriados e eventos…';
 $('history-analysis').hidden=true;historyAnalysis=null;analyzedHistory=null;
 try{
  const analysis=await api('/api/history/'+id+'/analysis','POST',{});historyAnalysis=analysis;analyzedHistory=record.histories.find(h=>h.id===id);
  $('history-analysis').hidden=false;
  $('history-analysis-help').textContent=analysis.needsText?'Este PDF parece ser uma imagem digitalizada. Ainda não há leitura de imagens (OCR). Envie uma versão com texto selecionável ou consulte o original e preencha os eventos manualmente.':`Foram encontrados ${analysis.candidates.length} possíveis itens${analysis.truncated?' (limite de 150)':''}. A leitura pode omitir ou juntar trechos. Nem todo feriado é municipal: compare com a base PROENS. Escolha um item, corrija a descrição e confirme as datas e a fonte vigente para ${state.year}.`;
  renderHistorySuggestions();
  $('history-text').textContent=analysis.pages.map(p=>`Página ${p.page}\n${p.text}`).join('\n\n');
  $('history-status').textContent='Leitura concluída. Use Revisar e incluir para conferir cada atividade e suas datas sugeridas.';
 }catch(err){$('history-status').textContent=err.message;message(err.message,true);}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-analyze-history]');if(b){b.disabled=true;await analyzeUploadedHistory(b.dataset.analyzeHistory);b.disabled=false;}
 const discard=e.target.closest('[data-history-discard]');if(discard&&historyAnalysis){const c=historyAnalysis.candidates[Number(discard.dataset.historyDiscard)],key=analyzedHistory.id+':'+historyCandidateKey(c);state.ignoredHistory??=[];if(state.ignoredHistory.includes(key))state.ignoredHistory=state.ignoredHistory.filter(k=>k!==key);else state.ignoredHistory.push(key);historicalSource=null;restoreEventForm();$('event-form').reset();$('historical-event-source').hidden=true;dirty=true;render();message('Decisão sobre o evento atualizada. Salve no sistema.');return;}
 const candidateButton=e.target.closest('[data-history-candidate]');if(!candidateButton||!historyAnalysis)return;
 const c=historyAnalysis.candidates[Number(candidateButton.dataset.historyCandidate)];if(!c)return;
 if(includedHistoryCandidate(state.events,analyzedHistory.id,c,historyAnalysis.candidates))return;
 historicalSource={historyId:analyzedHistory.id,page:c.page,candidateKey:historyCandidateKey(c)};
 $('historical-event-source').hidden=false;$('historical-event-source').textContent=`Origem histórica: ${analyzedHistory.filename}, página ${c.page}. Confira a descrição, informe as datas de ${state.year} e a fonte vigente. O PDF anterior não comprova a vigência do feriado.`;
 $('event-requirement').value='';$('event-name').value=c.name;$('event-category').value=c.category;$('event-kind').value='note';
 const proposed=proposedDates(c,state.year);$('event-start').value=proposed.start;$('event-end').value=proposed.end;$('event-evidence').value='';$('event-confirmed').checked=false;
 updateStageSuggestion();openInlineHistory(Number(candidateButton.dataset.historyCandidate));$('event-name').focus({preventScroll:true});
 message('Sugestão aberta para revisão. Confira também o efeito na contagem e a forma de oferta/nível.');
});
$('server-save').onclick=async()=>{try{if(!record)throw Error('Abra um calendário registrado.');const saved=await api('/api/calendars/'+calendarId,'PUT',{version:record.version,catalogueRevision:record.currentCatalogueRevision,state});record.version=saved.version;record.catalogueRevision=record.currentCatalogueRevision;dirty=false;record=await api('/api/calendars/'+calendarId);state=record.state;sync();render();message(`Versão ${saved.version} salva no sistema em ${new Date(record.updatedAt).toLocaleString('pt-BR')}.`);}catch(e){message(e.message,true);}};
$('history-form').onsubmit=async e=>{e.preventDefault();$('history-submit').disabled=true;try{const file=$('history-file').files[0];if(!file||file.size>8_000_000)throw Error('Envie um PDF de até 8 MB.');$('history-status').textContent='Enviando calendário anterior…';const payload=await filePayload(file,'history',calendarId);const uploaded=await api('/api/calendars/'+calendarId+'/history','POST',{filename:file.name,year:state.year-1,...payload,notes:$('history-notes').value});const fresh=await api('/api/calendars/'+calendarId);record.histories=fresh.histories;showHistory();e.target.reset();message('Calendário anterior guardado neste campus.');await analyzeUploadedHistory(uploaded.id);}catch(err){$('history-status').textContent=err.message;message(err.message,true);}finally{$('history-submit').disabled=false;}};
const extra=document.createElement('link');extra.rel='stylesheet';extra.href='/portal.css';document.head.append(extra);const printStyle=document.createElement('link');printStyle.rel='stylesheet';printStyle.href='/proens.css';document.head.append(printStyle);
const monthNames=Array.from({length:12},(_,m)=>new Date(Date.UTC(2027,m,1)).toLocaleDateString('pt-BR',{month:'long',timeZone:'UTC'}));
const selectedSaturdays=new Set();
$('saturday-month').innerHTML=monthNames.map((name,m)=>`<option value="${m+1}">${name}</option>`).join('');
function renderSaturdays(){
 const dates=monthSaturdays(state.year,Number($('saturday-month').value));
 $('saturday-dates').innerHTML='<legend>Sábados de '+monthNames[Number($('saturday-month').value)-1]+'</legend>'+dates.map(date=>{
  const inside=state.periods.some(p=>p.start<=date&&date<=p.end),included=allEvents().some(e=>e.kind==='include'&&e.start<=date&&date<=e.end),blocked=allEvents().some(e=>e.kind==='exclude'&&e.start<=date&&date<=e.end);
  if(included)selectedSaturdays.delete(date);
  return `<label class="check"><input type="checkbox" value="${date}" ${included?'disabled':''} ${included||selectedSaturdays.has(date)?'checked':''}>${dateLabel(date)}${included?' · já registrado':!inside?' · ajuste o período letivo antes de adicionar':''}${blocked?' · feriado/recesso: conflito se incluído':''}</label>`;
 }).join('');
 const count=dates.filter(date=>allEvents().some(e=>e.kind==='include'&&e.start<=date&&date<=e.end)).length;
 $('saturday-summary').textContent=(state.periods.length?'':'Primeiro, cadastre o início e o término na seção 3. Períodos letivos. Você já pode selecionar os sábados, mas só poderá adicioná-los dentro de um período. ')+`${count} sábado(s) registrado(s) neste mês. Caixas marcadas e desativadas indicam datas já registradas; para removê-las, use a lista de eventos abaixo.`;
}
$('saturday-dates').addEventListener('change',e=>{const input=e.target;if(input.matches('input[type="checkbox"]')&&!input.disabled){if(input.checked)selectedSaturdays.add(input.value);else selectedSaturdays.delete(input.value);}});
$('saturday-month').onchange=renderSaturdays;
$('saturday-form').onsubmit=e=>{e.preventDefault();act(()=>{
 identified();const dates=[...document.querySelectorAll('#saturday-dates input:checked:not(:disabled)')].map(el=>el.value);
 const additions=saturdayEvents(state,dates,$('saturday-name').value,$('saturday-evidence').value,()=>crypto.randomUUID());state.events.push(...additions);for(const date of dates)selectedSaturdays.delete(date);dirty=true;render();message(`${additions.length} sábado(s) adicionado(s). Confira a contagem e salve no sistema.`);
});};
$('download-pdf').onclick=async()=>{const button=$('download-pdf');try{
 if(dirty)throw Error('Salve no sistema antes de baixar o PDF.');
 button.disabled=true;$('download-pdf-top').disabled=true;button.textContent='Gerando PDF…';$('download-pdf-top').textContent='Gerando PDF…';message('Gerando o calendário em PDF. Aguarde o download.');
 const response=await fetch('/api/calendars/'+calendarId+'/pdf',{method:'POST',headers:{'Content-Type':'application/json','X-Dentec-Request':'1'},body:JSON.stringify({version:record.version,catalogueRevision:record.currentCatalogueRevision})});
 if(!response.ok){const data=await response.json();throw Error(data.error);}
 const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`${record.purpose==='test'?'teste-':''}calendario-${state.year}-v${record.version}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message('PDF gerado. Confira o arquivo antes do encaminhamento institucional.');
 }catch(e){message(e.message,true);}finally{button.disabled=false;$('download-pdf-top').disabled=false;button.textContent='Baixar PDF';$('download-pdf-top').textContent='Baixar calendário em PDF';}
};
$('event-category').innerHTML=categories.map(([key,label])=>`<option value="${key}">${label}</option>`).join('');$('event-category').value='recesso';
document.addEventListener('change',e=>{if(!e.target.dataset.categoryEvent)return;const event=state.events.find(x=>x.id===e.target.dataset.categoryEvent);if(!event)return;event.category=e.target.value;dirty=true;render();message('Categoria e cor atualizadas. O efeito na contagem foi preservado. Salve no sistema.');});
$('event-category').onchange=()=>{const category=$('event-category').value;$('event-kind').value=['feriado','recesso','ferias'].includes(category)?'exclude':category==='sabado'?'include':'note';};
$('proens-color-guide').innerHTML=categories.filter(c=>c[2]).map(([key,label])=>`<span class="cat-${key}">${label}</span>`).join('');
$('download-pdf-top').onclick=()=>$('download-pdf').click();
openRecord();

$('assessment-stages').onchange=()=>{const value=Number($('assessment-stages').value);if(![2,3,4].includes(value))return;state.assessmentStages=value;const ids=new Set(activityChecklist(state).map(r=>r.id));for(const event of state.events)if(!ids.has(event.requirementId))delete event.requirementId;dirty=true;render();};
function prepareActivity(id){restoreEventForm();historicalSource=null;$('historical-event-source').hidden=true;const item=activityChecklist(state).find(r=>r.id===id);if(!item){updateStageSuggestion();return;}$('event-requirement').value=id;$('event-name').value=item.name;$('event-category').value=id.includes('council')?'conselho':id.startsWith('stage-')?'limite':'prazo';$('event-kind').value='note';$('event-start').value='';$('event-end').value='';$('event-evidence').value='';$('event-confirmed').checked=false;updateStageSuggestion();$('event-form').scrollIntoView({behavior:'smooth'});$('event-start').focus();}
$('event-requirement').onchange=()=>prepareActivity($('event-requirement').value);
document.addEventListener('click',e=>{const b=e.target.closest('[data-prepare-activity]');if(b)prepareActivity(b.dataset.prepareActivity);});
document.addEventListener('change',e=>{if(!e.target.dataset.linkActivity)return;const event=state.events.find(x=>x.id===e.target.dataset.linkActivity);if(event){event.requirementId=e.target.value||undefined;dirty=true;render();}});

function vacationValues(){return Object.fromEntries([['firstStart','vacation-first-start'],['firstEnd','vacation-first-end'],['secondStart','vacation-second-start'],['secondEnd','vacation-second-end']].map(([key,id])=>[key,$(id).value]));}
function vacationPreview(){try{const v=teacherVacations(state.year,vacationValues(),$('vacation-evidence').value||'Prévia');$('vacation-preview').textContent='Total informado: '+v.total+' dias. Confira o quantitativo e a decisão do campus.';}catch(e){$('vacation-preview').textContent=e.message;}}
$('vacation-form').addEventListener('change',vacationPreview);
$('vacation-form').onsubmit=e=>{e.preventDefault();act(()=>{const values=vacationValues(),evidence=$('vacation-evidence').value.trim(),vacation=teacherVacations(state.year,values,evidence);state.teacherVacations={...values,evidence};state.events=state.events.filter(e=>!['teacher-vacation-january','teacher-vacation-july'].includes(e.id)).concat(vacation.events);dirty=true;render();vacationPreview();message('Férias docentes registradas nas datas informadas pelo campus. Salve no sistema.');});};
document.addEventListener('input',e=>{if(e.target.closest('form'))message('Formulário alterado. Aplique a alteração no botão correspondente e depois salve no sistema.');});

function isStageRequest(){return $('event-requirement').value==='stage-1'||(!$('event-requirement').value&&isFirstStageStart($('event-name').value));}
function applyStageSuggestion(){
 identified();const evidence=$('event-evidence').value.trim();if(!evidence||!$('event-confirmed').checked)throw Error('Informe a fonte e confirme as datas antes de aplicar as etapas.');
 const modalities=[...document.querySelectorAll('input[name=event-modality]:checked')].map(el=>el.value);if(!modalities.length)throw Error('Selecione uma forma de oferta/nível.');
 const fresh=suggestStages({...state,modalities,offer:modalities[0]},allEvents(),$('event-start').value),completed=inlineHistoryIndex;
 state.events.push(...fresh.stages.map((s,i)=>({id:crypto.randomUUID(),name:s.name,requirementId:s.requirementId,start:s.start,end:s.end,kind:'note',category:'limite',evidence,modalities,historicalSource:i===0?historicalSource:undefined})));
 dirty=true;historicalSource=null;$('event-form').reset();$('historical-event-source').hidden=true;render();
 if(completed!==null)document.querySelector('[data-history-item="'+completed+'"]')?.scrollIntoView({block:'nearest'});
 message(fresh.stages.length+' etapas incluídas. Confira e clique em Salvar no sistema.');
}
function updateStageSuggestion(){
 let panel=$('stage-suggestion');if(!panel){panel=document.createElement('section');panel.id='stage-suggestion';panel.className='notice';panel.setAttribute('aria-live','polite');$('event-form').append(panel);}
 panel.hidden=!isStageRequest();if(panel.hidden)return;
 panel.replaceChildren();
 if(!$('event-start').value){panel.textContent='Informe o início da primeira etapa. O sistema usará o número de etapas já cadastrado e os dias letivos até o final dos períodos para sugerir todos os intervalos.';return;}
 try{const modalities=[...document.querySelectorAll('input[name=event-modality]:checked')].map(el=>el.value);const suggestion=suggestStages({...state,modalities,offer:modalities[0]},allEvents(),$('event-start').value);$('event-end').value=suggestion.stages[0].end;
  panel.innerHTML='<strong>Sugestão de distribuição das etapas</strong><p>Distribuição equilibrada dos dias letivos cadastrados'+(suggestion.byPeriod?', respeitando os limites de cada período':'')+'. Confira as datas e a norma vigente antes de aplicar. Não representa aprovação institucional.</p><ul>'+suggestion.stages.map(s=>`<li>${escape(s.name)}: ${dateLabel(s.start)} a ${dateLabel(s.end)} — ${s.days} dias letivos</li>`).join('')+'</ul><p>Preencha a fonte da decisão e marque a confirmação do formulário. Este botão inclui todas as etapas para as formas de oferta/níveis selecionadas.</p><button type="button" id="apply-stage-suggestion">Aplicar todas as etapas sugeridas</button>';
  $('apply-stage-suggestion').onclick=()=>act(applyStageSuggestion);
 }catch(error){panel.textContent=error.message;}
}
$('event-name').addEventListener('input',updateStageSuggestion);
document.querySelector('#event-modalities').addEventListener('change',updateStageSuggestion);
$('event-start').addEventListener('input',updateStageSuggestion);
$('event-start').addEventListener('change',updateStageSuggestion);

function renderHistorySuggestions(){
 if(!historyAnalysis||!analyzedHistory)return;
 const reopenIndex=inlineHistoryIndex;restoreEventForm();
 let count=0;
 $('history-suggestions').innerHTML=historyAnalysis.candidates.map((c,i)=>{const done=includedHistoryCandidate(state.events,analyzedHistory.id,c,historyAnalysis.candidates),ignored=state.ignoredHistory?.includes(analyzedHistory.id+':'+historyCandidateKey(c));if(done)count++;return `<li data-history-item="${i}" class="${done?'history-included':''}"><div><strong>${i+1}. ${escape(c.name)}</strong><small>Página ${c.page} · texto do ano anterior: ${escape(c.excerpt)}</small>${done?'<span class="history-check">✓ Revisado e incluído</span>':ignored?'<span class="history-check">Não será utilizado</span>':''}</div><div class="history-actions"><button type="button" data-history-candidate="${i}" ${done||ignored?'disabled':''}>${done?'✓ Incluído':'Revisar e incluir'}</button>${!done?`<button type="button" data-history-discard="${i}">${ignored?'Desfazer descarte':'Não utilizar este evento'}</button>`:''}</div></li>`;}).join('');
 if(reopenIndex!==null&&historicalSource){const candidate=historyAnalysis.candidates[reopenIndex];if(candidate&&!includedHistoryCandidate(state.events,analyzedHistory.id,candidate,historyAnalysis.candidates))openInlineHistory(reopenIndex,false);}
 let progress=$('history-progress');if(!progress){progress=document.createElement('p');progress.id='history-progress';progress.setAttribute('role','status');$('history-suggestions').before(progress);}progress.textContent=`${count} de ${historyAnalysis.candidates.length} itens incluídos. A ordem da lista é mantida. Salve o calendário para guardar as novas inclusões.`;
}

function restoreEventForm(){eventFormHome.after($('event-form'));$('event-form').classList.remove('inline-history-review');$('cancel-inline-history')?.remove();inlineHistoryIndex=null;}
function openInlineHistory(index,scroll=true){
 const row=document.querySelector('[data-history-item="'+index+'"]');if(!row)return;
 restoreEventForm();inlineHistoryIndex=index;row.append($('event-form'));$('event-form').classList.add('inline-history-review');
 const close=document.createElement('button');close.id='cancel-inline-history';close.type='button';close.className='secondary';close.textContent='Fechar revisão';close.onclick=()=>{historicalSource=null;$('historical-event-source').hidden=true;$('event-form').reset();restoreEventForm();row.scrollIntoView({block:'nearest'});};$('event-form').append(close);
 if(scroll)row.scrollIntoView({behavior:'smooth',block:'start'});
}

$('new-event').onclick=()=>{restoreEventForm();historicalSource=null;$('event-form').reset();$('historical-event-source').hidden=true;updateStageSuggestion();$('event-form').scrollIntoView({block:'center',behavior:'smooth'});$('event-name').focus({preventScroll:true});};
