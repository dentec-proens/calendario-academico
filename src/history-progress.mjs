import {proposedDates} from './history-dates.mjs';
import {calendarModalities,appliesTo} from './modalities.mjs';
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function historicalRequirement(name,state){
 const t=normalized(name);
 const stages=[...t.matchAll(/\b([1-4])\s*(?:a|o)?\s*(bimestre|trimestre|semestre|etapa)\b/g)];
 for(const stage of stages){const n=Number(stage[1]),unit=stage[2],count=Number(state.assessmentStages);
  const appropriate=unit==='etapa'||unit==='bimestre'&&count===4||unit==='trimestre'&&count===3||unit==='semestre'&&count===2;
  if(appropriate&&n<=count){
   if(/\b(inicio|termino|fim)\b/.test(t)&&!/(resultado|conselho|prazo)/.test(t))return `stage-${n}`;
   if(/resultado/.test(t)&&/lancamento/.test(t)&&!/final/.test(t))return `results-${n}`;
   if(/conselho/.test(t)&&!/extraordinario/.test(t))return `council-${n}`;
  }
 }
 if(/conselho/.test(t)&&/extraordinario/.test(t))return 'extraordinary-council';
 const term=t.match(/\b([12])\s*(?:o|a)?\s*semestre\b/);
 if(term){const n=term[1];if(/\bpit\b|plano individual de trabalho/.test(t))return `pit-${n}`;
  if(/rematricula/.test(t))return `enrolment-${n}`;
  if(/ajuste.*matricula/.test(t)&&/veterano/.test(t))return `adjustment-${n}`;
 }
 return null;
}
export function existingHistoryEvent(events,candidate,state){
 const requirement=historicalRequirement(candidate.name,state),dates=proposedDates(candidate,state.year),name=normalized(candidate.name);
 const matches=events.filter(e=>e.start&&e.end&&(requirement?e.requirementId===requirement:name&&normalized(e.name)===name&&dates.start&&e.start===dates.start&&e.end===dates.end));
 // Do not hide a suggestion needed by another offer in a combined calendar.
 return matches.length&&calendarModalities(state).every(m=>matches.some(e=>appliesTo(e,m)))?matches[0]:null;
}
export const historyCandidateKey=c=>JSON.stringify([c.page,c.excerpt]);
export function includedHistoryCandidate(events,historyId,candidate,candidates){
 const key=historyCandidateKey(candidate);
 return events.some(e=>{
  const source=e.historicalSource;if(!source||source.historyId!==historyId||source.page!==candidate.page)return false;
  if(source.candidateKey)return source.candidateKey===key;
  // Legacy records can only be matched when their original name is unambiguous.
  return e.name===candidate.name&&candidates.filter(c=>c.page===candidate.page&&c.name===candidate.name).length===1;
 });
}
