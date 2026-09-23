import {datesBetween} from './calendar.mjs';

// Scheduling rule explicitly configured by DENTEC; the campus supplies July's start.
export function teacherVacations(year,julyStart,evidence){
 if(julyStart&&typeof julyStart==='object'){
  if(typeof evidence!=='string'||!evidence.trim()||evidence.length>240)throw Error('Informe a fonte ou decisão das férias docentes.');
  const {firstStart,firstEnd,secondStart,secondEnd}=julyStart;
  const periods=[[firstStart,firstEnd]];if(secondStart||secondEnd)periods.push([secondStart,secondEnd]);
  const seen=new Set();const events=periods.map(([start,end],i)=>{
   if(!start||!end)throw Error('Informe início e término de cada período de férias.');
   const days=datesBetween(start,end);for(const d of days){if(seen.has(d))throw Error('Os períodos de férias não podem se sobrepor.');seen.add(d);}
   return {id:`teacher-vacation-${i?'july':'january'}`,name:`Férias docentes — ${days.length} dias`,start,end,kind:'note',category:'ferias',evidence:evidence.trim()};
  });return {...julyStart,events,total:seen.size};
 }
 if(!Number.isInteger(year)||year<1900||year>9999)throw Error('Ano inválido.');
 const januaryStart=`${year}-01-02`,januaryEnd=`${year}-01-31`;
 if(typeof julyStart!=='string'||!julyStart.startsWith(`${year}-07-`))throw Error('Escolha o início das férias de julho no ano do calendário.');
 datesBetween(julyStart,julyStart);
 const end=new Date(julyStart+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+14);
 const julyEnd=end.toISOString().slice(0,10);
 if(!julyEnd.startsWith(`${year}-07-`))throw Error('Os 15 dias devem caber em julho: escolha início entre 01/07 e 17/07.');
 if(typeof evidence!=='string'||!evidence.trim()||evidence.length>240)throw Error('Informe a fonte ou decisão das férias docentes (até 240 caracteres).');
 const events=[['january',januaryStart,januaryEnd,30],['july',julyStart,julyEnd,15]].map(([id,start,end,days])=>({id:`teacher-vacation-${id}`,name:`Férias docentes — ${days} dias`,start,end,kind:'note',category:'ferias',evidence:evidence.trim()}));
 return {januaryStart,januaryEnd,julyStart,julyEnd,total:events.reduce((n,e)=>n+datesBetween(e.start,e.end).length,0),events};
}
