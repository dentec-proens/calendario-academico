import {calendarModalities,modalityLabels,appliesTo} from './modalities.mjs';
export const assessmentCount=(state,modality)=>Number(state.assessmentStagesByModality?.[modality]??state.assessmentStages);
export const stageRequirement=id=>/^stage-[1-4](?::[a-z]+)?$/.test(id||'');
export const scopedRequirement=(state,id,modality)=>state.assessmentStagesByModality?`${id}:${modality}`:id;
export function migrateAssessmentEvents(state){
 if(!state.assessmentStagesByModality)return state.events;
 return state.events.flatMap(e=>{
  if(!/^(stage|results|council|pedagogical-meeting)-[1-4]$/.test(e.requirementId||''))return [e];
  const number=Number(e.requirementId.split('-').at(-1));
  return calendarModalities(state).filter(m=>appliesTo(e,m)).map((m,i)=>({...e,id:i?`${e.id.slice(0,70)}:${m}`:e.id,modalities:[m],name:`${e.name.slice(0,110)} — ${modalityLabels[m]}`,requirementId:number<=assessmentCount(state,m)?`${e.requirementId}:${m}`:undefined}));
 });
}
// Undated PROENS operational checklist. Campus histories are separate references.
// Historical dates are deliberately excluded. Applicability is reviewed separately.
export function activityChecklist(state){
 if(state.assessmentStagesByModality){
  const common=activityChecklist({...state,assessmentStagesByModality:undefined,assessmentStages:undefined});
  const stages=calendarModalities(state).flatMap(m=>activityChecklist({...state,assessmentStagesByModality:undefined,assessmentStages:assessmentCount(state,m)}).filter(r=>/^(stage|results|council|pedagogical-meeting)-[1-4]$/.test(r.id)).map(r=>({...r,id:`${r.id}:${m}`,modality:m,name:`${r.name} — ${modalityLabels[m]} (${assessmentCount(state,m)===4?'bimestral':assessmentCount(state,m)===3?'trimestral':'semestral'})`})));
  return [...stages,...common];
 }
 const rows=[];
 const add=(id,name,extra={})=>rows.push({id,name,...extra});
 const stages=Number(state.assessmentStages);
 if([2,3,4].includes(stages))for(let n=1;n<=stages;n++){
  add(`stage-${n}`,`${n}ª etapa de avaliação — início e término`);
  add(`results-${n}`,`Prazo de lançamento dos resultados (rendimento e frequência) da ${n}ª etapa`);
  add(`council-${n}`,`Conselho de classe/coletivo pedagógico da ${n}ª etapa`);
  add(`pedagogical-meeting-${n}`,`Reunião pedagógica após os resultados parciais da ${n}ª etapa`);
 }
 const terms=state.regime==='misto'?[0,1,2]:state.regime==='semestral'?[1,2]:[0];
 for(const n of terms){
  const label=n?`${n}º semestre`:'ano letivo';
  add(`final-${n}`,`Prazo de lançamento do resultado final (rendimento e frequência) do ${label}`);
  add(`diary-${n}`,`Prazo de fechamento e entrega dos diários de classe do ${label}`);
  add(`teaching-plan-${n}`,`Prazo de entrega do Plano de Ensino do ${label}`);
  add(`recognition-${n}`,`Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio — ${label}`);
  add(`registration-${n}`,`Período destinado à matrícula — ${label}`);
  add(`admission-notice-${n}`,`Publicação dos editais de transferência interna e externa, reingresso e portadores de diploma — antes do início do ${label}`);
  add(`final-appeal-${n}`,`Prazo para estudantes solicitarem revisão de resultados finais — ${label}`);
 }
 for(const n of [1,2]){
  add(`pit-${n}`,`Prazo de entrega do PIT — ${n}º semestre`);
  add(`enrolment-${n}`,`Rematrícula dos estudantes — ${n}º semestre`);
  add(`adjustment-${n}`,`Ajuste de matrículas dos veteranos — ${n}º semestre`);
  add(`withdrawal-${n}`,`Prazo de trancamento de curso e cancelamento de matrícula em componente — ${n}º semestre`);
 }
 add('extraordinary-council','Conselho de classe/coletivo pedagógico extraordinário para revisão dos resultados finais');
 add('family-meeting','Reunião com familiares, responsáveis e comunidade');
 add('campus-events','Eventos de ensino, pesquisa, extensão e inovação do campus');
 add('alumni-meeting','Encontro dos egressos');
 add('internship-event','Evento sobre a temática de estágios');
 add('robotics','Fase local da Olimpíada Brasileira de Robótica'+(Number(state.year)===2026?' — até 31/08/2026':''),Number(state.year)===2026?{deadline:'2026-08-31'}:{});
 add('course-showcase','Mostra de Cursos do campus'+(Number(state.year)===2026?' — até 30/09/2026':''),Number(state.year)===2026?{deadline:'2026-09-30'}:{});
 add('pedagogical-training','Formação pedagógica — mínimo de 40 horas anuais',{minHours:40});
 add('collective-planning','Planejamento/replanejamento coletivo — mínimo de 20 horas anuais',{minHours:20});
 add('women-week','Semana de Valorização de Mulheres que Fizeram História — março',{month:3});
 add('cultural-week','Semana Cultural Interescolar — outubro, aberta a estudantes, famílias e comunidade',{month:10});
 return rows;
}

export function mergeLegacyStages(events){
 const result=events.map(e=>({...e}));
 for(let n=1;n<=4;n++){
  const start=result.find(e=>e.requirementId===`stage-start-${n}`),end=result.find(e=>e.requirementId===`stage-end-${n}`);
  if(!start||!end||start.start>end.end||JSON.stringify(start.modalities||[])!==JSON.stringify(end.modalities||[]))continue;
  start.requirementId=`stage-${n}`;start.name=`${n}ª etapa de avaliação — início e término`;start.end=end.end;start.evidence=[...new Set([start.evidence,end.evidence])].join(' / ').slice(0,240);
  result.splice(result.indexOf(end),1);
 }
 return result;
}
