import {calendarModalities,modalityLabels,appliesTo} from './modalities.mjs';
import {activityChecklist} from './obligations.mjs';
import {calendarResult} from './pdf.mjs';
import {reviewCriteria} from './review.mjs';

// Operational requirements explicitly requested by DENTEC. Dates must be supplied
// by the campus/current reference; keyword matches are only presence checks.
export const requiredActivities=[
 ['supervisao','Atividades de supervisão obrigatórias','supervisao'],
 ['segunda-chamada','Período da segunda chamada do processo seletivo','segunda chamada|2[ªa°º]? chamada'],
 ['resultado-chamada','Resultado final da segunda chamada','resultado.*(segunda|2[ªa°º]?) chamada'],
 ['confirmacao','Confirmação de matrícula dos ingressantes','confirmacao.*matricula'],
 ['rematricula','Rematrícula dos estudantes','rematricula'],
 ['ajuste','Ajuste das matrículas dos veteranos','ajuste.*matricula'],
 ['plano','Entrega do Plano de Ensino','plano.*ensino'],
 ['pit','Entrega do PIT','\\bpit\\b|plano individual de trabalho'],
 ['formacao','Formação pedagógica','formacao.*pedagogica'],
 ['planejamento','Planejamento/replanejamento coletivo','planejamento.*coletivo'],
 ['transferencia','Publicação dos editais de transferência, reingresso e portador de diploma','edita.*(transferencia|reingresso|diploma)'],
 ['trancamento','Trancamento de curso','trancamento'],
 ['cancelamento','Cancelamento de matrícula em componente curricular','cancelamento']
];
const plain=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

// Fail closed: machine checks never replace a current, evidenced human review.
export function releaseReadiness(record,db){
 const issues=[];
 const events=[...record.institutionalSnapshot,...record.state.events];
 if(![2,3,4].includes(record.state.assessmentStages))issues.push('Informe a quantidade de etapas de avaliação (2, 3 ou 4).');
 for(const modality of calendarModalities(record.state))for(const activity of activityChecklist(record.state))if(!events.some(e=>appliesTo(e,modality)&&e.requirementId===activity.id&&e.evidence?.trim()))issues.push(`${modalityLabels[modality]} — ${activity.name}: vincule um evento com datas e fonte no roteiro de atividades.`);
 for(const modality of calendarModalities(record.state)){
 const eventFor=id=>events.find(e=>e.requirementId===id&&appliesTo(e,modality));
 for(let n=1;n<=(record.state.assessmentStages||0);n++){
  const start=eventFor('stage-'+n),end=eventFor('stage-'+n),results=eventFor('results-'+n),council=eventFor('council-'+n);
  if(start&&end&&start.start>end.end)issues.push(`${n}ª etapa: término anterior ao início.`);
  if(end&&results&&results.end<end.end)issues.push(`${n}ª etapa: prazo de lançamento de resultados anterior ao término.`);
  if(results&&council&&council.start<results.end)issues.push(`${n}ª etapa: conselho anterior ao prazo de lançamento dos resultados.`);
 }
 }

 for(const [,title,pattern] of requiredActivities){
  if(!events.some(e=>e.evidence?.trim()&&new RegExp(pattern).test(plain(e.name))))issues.push(`${title}: cadastre a data ou o período e a fonte.`);
 }
 if(record.catalogueRevision!==db.catalogue.revision)issues.push('Salve o calendário com a base institucional atualizada.');
 try{
  const result=calendarResult(record.state,[...record.institutionalSnapshot,...record.state.events]);
  if(!record.state.periods.length)issues.push('Cadastre os períodos letivos.');
  if(record.state.regime!=='anual'&&record.state.periods.length!==2)issues.push('Cadastre os dois semestres letivos.');
  for(const [modality,detail] of Object.entries(result.byModality))for(const check of detail.checks){
   if(check.scope!=='annual'&&record.state.regime==='anual')continue;
   if(check.status!=='MET')issues.push(`${modalityLabels[modality]} — ${check.scope==='annual'?'Total anual':record.state.periods.find(p=>p.id===check.scope)?.name}: mínimo de dias não atendido ou não configurado.`);
  }
  if(Object.values(result.byModality).some(r=>r.conflicts.length))issues.push('Resolva os conflitos entre dias letivos e exclusões.');
 }catch{issues.push('Complete e confira a semana letiva, os períodos e as evidências da contagem.');}
 const review=(db.reviews||[]).find(r=>r.calendarId===record.id);
 const current=review&&review.calendarVersion===record.version&&review.catalogueRevision===db.catalogue.revision;
 if(!current)issues.push('A DENTEC/PROENS precisa salvar a revisão desta versão do calendário e da base.');
 if(!review?.applicableNorm?.trim())issues.push('Identifique a norma vigente aplicável na revisão.');
 for(const c of reviewCriteria){
  const entry=current&&review.entries.find(e=>e.id===c.id);
  if(!entry?.reviewed||!['ATENDIDO','NAO_APLICAVEL'].includes(entry.status)||!entry.notes?.trim())issues.push(`${c.item}: ${c.title} — atendimento ou não aplicabilidade fundamentada pendente.`);
  if(c.pattern&&entry?.status==='ATENDIDO'&&!events.some(e=>e.evidence?.trim()&&new RegExp(c.pattern).test(plain(e.name+' '+(e.category||'')))))issues.push(`${c.item}: ${c.title} — nenhum evento com data e fonte localizado no calendário; confira o cadastro.`);
 }
 return {ready:issues.length===0,issues,officialApproval:false};
}
