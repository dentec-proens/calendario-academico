import {evaluateCalendar} from './evaluation.mjs';
import {parseDate} from './calendar.mjs';
import {calendarModalities} from './modalities.mjs';
export function isFirstStageStart(name){
 const text=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!/\binicio\b/.test(text))return false;
 if(/(?:[2-4]\s*[ºªo°]?|segund[oa]|terceir[oa]|quart[oa])\s*(?:bimestre|trimestre|semestre|etapa)/.test(text))return false;
 return /(?:1\s*[ºªo°]?|primeir[oa])\s*(?:bimestre|trimestre|semestre|etapa)/.test(text)||/inicio\s+(?:do\s+)?(?:periodo|ano)\s+letivo/.test(text);
}
export function suggestStages(state,events,start){
 const count=Number(state.assessmentStages);
 if(![2,3,4].includes(count))throw Error('Informe o número de etapas de avaliação.');
 if(!state.periods.length)throw Error('Cadastre o início e o término dos períodos letivos para calcular as etapas.');
 if(!state.weekConfirmed||!state.weekdays.length)throw Error('Confirme a semana letiva antes de calcular as etapas.');
 parseDate(start);
 if(events.some(e=>/^stage-(?:[1-4]|start-[1-4]|end-[1-4])$/.test(e.requirementId||'')))throw Error('Já existem etapas registradas. Revise-as antes de gerar uma nova distribuição; nenhuma data existente será substituída.');
 const result=evaluateCalendar(state,events),modalities=calendarModalities(state);
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
 for(const chunk of chunks){let offset=0;for(let i=0;i<perChunk;i++){const size=Math.floor(chunk.length/perChunk)+(i<chunk.length%perChunk?1:0),part=chunk.slice(offset,offset+size);offset+=size;stages.push({requirementId:`stage-${stages.length+1}`,name:`${stages.length+1}ª etapa de avaliação — início e término`,start:part[0],end:part.at(-1),days:size});}}
 return {stages,total:days.length,byPeriod};
}
