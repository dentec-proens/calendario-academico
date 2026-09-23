import {parseDate,datesBetween} from './calendar.mjs';
import {calendarModalities,appliesTo} from './modalities.mjs';
export function durationEnd(start,quantity,state,events=[]){
 const count=Number(quantity),time=parseDate(start);
 if(!Number.isInteger(count)||count<1||count>366)throw Error('Informe uma quantidade inteira entre 1 e 366 dias.');
 if(!state)return new Date(time+(count-1)*86400000).toISOString().slice(0,10);
 if(!state.weekConfirmed||!state.weekdays?.length)throw Error('Confirme a semana letiva antes de calcular o término.');
 if(Number(start.slice(0,4))!==state.year)throw Error('O início deve pertencer ao ano do calendário.');
 const ends=calendarModalities(state).map(modality=>{
  const scoped=events.filter(e=>appliesTo(e,modality));let total=0;
  for(const date of datesBetween(start,`${state.year}-12-31`)){
   const active=scoped.filter(e=>e.start<=date&&e.end>=date);
   if(active.some(e=>e.kind==='exclude'))continue;
   if(active.some(e=>e.kind==='include')||state.weekdays.includes(new Date(parseDate(date)).getUTCDay())){
    if(++total===count)return date;
   }
  }
  throw Error('Não há dias letivos suficientes até o fim do ano para essa quantidade.');
 });
 if(new Set(ends).size>1)throw Error('As ofertas têm impedimentos diferentes e resultam em términos diferentes. Revise os períodos por oferta.');
 return ends[0];
}
