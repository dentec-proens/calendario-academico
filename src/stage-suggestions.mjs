import {assessmentCount,scopedRequirement,stageRequirement} from './obligations.mjs';
import {evaluateCalendar} from './evaluation.mjs';
import {parseDate} from './calendar.mjs';
import {calendarModalities,appliesTo} from './modalities.mjs';
export function isFirstStageStart(name){
 const text=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!/\binicio\b/.test(text))return false;
 if(/(?:[2-4]\s*[ºªo°]?|segund[oa]|terceir[oa]|quart[oa])\s*(?:bimestre|trimestre|semestre|etapa)/.test(text))return false;
 return /(?:1\s*[ºªo°]?|primeir[oa])\s*(?:bimestre|trimestre|semestre|etapa)/.test(text)||/inicio\s+(?:do\s+)?(?:periodo|ano)\s+letivo/.test(text);
}
export function suggestStages(state,events,start){
 const modalities=calendarModalities(state),count=assessmentCount(state,modalities[0]);
 if((state.assessmentStagesByModality&&modalities.length!==1)||modalities.some(m=>assessmentCount(state,m)!==count))throw Error('Selecione uma oferta para calcular suas etapas separadamente.');
 events=events.filter(e=>modalities.some(m=>appliesTo(e,m)));
 if(![2,3,4].includes(count))throw Error('Informe o número de etapas de avaliação.');
 if(!state.periods.length)throw Error('Cadastre o início e o término dos períodos letivos para calcular as etapas.');
 if(!state.weekConfirmed||!state.weekdays.length)throw Error('Confirme a semana letiva antes de calcular as etapas.');
 parseDate(start);
 if(events.some(e=>/^stage-(?:[1-4]|start-[1-4]|end-[1-4])(?::[a-z]+)?$/.test(e.requirementId||'')))throw Error('Já existem etapas registradas. Revise-as antes de gerar uma nova distribuição; nenhuma data existente será substituída.');
 const result=evaluateCalendar(state,events);
 const lists=modalities.map(m=>result.byModality[m].ledger.filter(d=>d.counted&&d.date>=start).map(d=>d.date));
 const days=lists[0];
 if(!days?.includes(start))throw Error('O início da primeira etapa precisa ser um dia letivo conforme a semana, os períodos e os eventos cadastrados.');
 if(lists.some(list=>JSON.stringify(list)!==JSON.stringify(days)))throw Error('As formas de oferta possuem dias letivos diferentes. Defina as etapas por oferta; uma distribuição única não seria adequada.');
 if(days.length<count)throw Error('Não há dias letivos suficientes para todas as etapas.');
 // Preserve semester boundaries when the number of stages divides evenly across periods.
 const groups=state.periods.slice().sort((a,b)=>a.start.localeCompare(b.start)).map(p=>days.filter(d=>d>=p.start&&d<=p.end)).filter(g=>g.length);
 const byPeriod=groups.length>1&&count%groups.length===0;
 const chunks=byPeriod?groups:[days],perChunk=byPeriod?count/groups.length:count;
 if(chunks.some(g=>g.length<perChunk))throw Error('Um dos períodos não possui dias suficientes para distribuir as etapas.');
 const stages=[];
 for(const chunk of chunks){let offset=0;for(let i=0;i<perChunk;i++){const size=Math.floor(chunk.length/perChunk)+(i<chunk.length%perChunk?1:0),part=chunk.slice(offset,offset+size);offset+=size;stages.push({requirementId:scopedRequirement(state,`stage-${stages.length+1}`,modalities[0]),name:`${stages.length+1}ª etapa de avaliação — início e término`,start:part[0],end:part.at(-1),days:size});}}
 return {stages,total:days.length,byPeriod};
}

/** Suggest one stage without replacing any registered stage. */
export function suggestStageEnd(state,events,start,number){
 if(!Number.isInteger(number)||number<1||number>assessmentCount(state,calendarModalities(state)[0]))throw Error('Etapa inválida para o número de etapas cadastrado.');
 const modalities=calendarModalities(state);
 const scoped=events.filter(e=>modalities.some(m=>appliesTo(e,m)));
 const existing=scoped.filter(e=>/^stage-(?:[1-4]|start-[1-4]|end-[1-4])(?::[a-z]+)?$/.test(e.requirementId||''));
 if(existing.some(e=>e.requirementId===scopedRequirement(state,`stage-${number}`,modalities[0])))throw Error('Esta etapa já está registrada. Revise o registro existente.');
 const result=evaluateCalendar(state,scoped);
 const lists=modalities.map(m=>result.byModality[m].ledger.filter(d=>d.counted).map(d=>d.date));
 if(lists.some(list=>JSON.stringify(list)!==JSON.stringify(lists[0])))throw Error('As ofertas possuem dias letivos diferentes. Selecione uma oferta para calcular a etapa.');
 const days=lists[0];
 if(!days.includes(start))throw Error('O início da etapa precisa ser um dia letivo cadastrado.');
 const baseline=suggestStages(state,scoped.filter(e=>!existing.includes(e)),days[0]);
 const target=baseline.stages[number-1];
 const period=state.periods.find(p=>target.start>=p.start&&target.start<=p.end);
 const available=days.filter(d=>d>=start&&(!baseline.byPeriod||(d>=period.start&&d<=period.end)));
 if(available[0]!==start||available.length<target.days)throw Error('Não há dias letivos suficientes neste período para manter a distribuição. Revise o início ou os períodos letivos.');
 const end=available[target.days-1];
 if(existing.some(e=>e.start<=end&&e.end>=start))throw Error('A sugestão sobrepõe uma etapa já registrada. Revise as datas.');
 return {...target,start,end};
}

// Only explicitly automatic, complete groups may have their dates moved.
export function recalculateAssessmentStages(state,events){
 const replacements=new Map();
 const groups=state.assessmentStagesByModality?calendarModalities(state).map(m=>[m]):[calendarModalities(state)];
 for(const modalities of groups){
  const stages=state.events.filter(e=>stageRequirement(e.requirementId)&&modalities.some(m=>appliesTo(e,m)));
  if(!stages.some(e=>e.assessmentAutoStart))continue;
  const count=assessmentCount(state,modalities[0]);
  if(stages.length!==count||stages.some(e=>!e.assessmentAutoStart)||new Set(stages.map(e=>e.requirementId)).size!==count)continue;
  const anchors=new Set(stages.map(e=>e.assessmentAutoStart));
  if(anchors.size!==1)throw Error('Confira o início da distribuição automática das etapas.');
  const scopedState={...state,modalities,offer:modalities[0]};
  const withoutStages=events.filter(e=>!stageRequirement(e.requirementId));
  const result=evaluateCalendar(scopedState,withoutStages);
  const start=result.byModality[modalities[0]].ledger.find(d=>d.counted&&d.date>=[...anchors][0])?.date;
  if(!start)throw Error('Não há dias letivos para recalcular as etapas.');
  const suggested=suggestStages(scopedState,withoutStages,start);
  for(const stage of stages){const next=suggested.stages.find(s=>s.requirementId===stage.requirementId);if(next)replacements.set(stage.id,{...stage,start:next.start,end:next.end});}
 }
 return state.events.map(e=>replacements.get(e.id)||e);
}

export function assessmentDayCounts(state,events){
 const result=evaluateCalendar(state,events);
 return Object.fromEntries(state.events.filter(e=>stageRequirement(e.requirementId)).map(e=>[e.id,calendarModalities(state).filter(m=>appliesTo(e,m)).map(m=>{
  const ledger=result.byModality[m].ledger.filter(d=>d.date>=e.start&&d.date<=e.end);
  return {modality:m,days:ledger.filter(d=>d.counted).length,saturdays:ledger.filter(d=>d.counted&&d.weekday===6).length,excluded:ledger.filter(d=>d.reason==='EXCLUDED').length};
 })]));
}
