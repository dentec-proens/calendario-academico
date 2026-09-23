import {datesBetween,parseDate} from './calendar.mjs';
export function monthSaturdays(year,month){
 const prefix=`${year}-${String(month).padStart(2,'0')}`;
 const last=new Date(Date.UTC(year,month,0)).getUTCDate();
 return datesBetween(prefix+'-01',prefix+'-'+last).filter(d=>new Date(parseDate(d)).getUTCDay()===6);
}
export function saturdayEvents(state,dates,name,evidence,id){
 if(!dates.length)throw Error('Selecione pelo menos um sábado.');
 if(!name.trim()||!evidence.trim())throw Error('Informe a atividade e a fonte da decisão.');
 const selected=[...new Set(dates)];
 for(const date of selected){
  if(new Date(parseDate(date)).getUTCDay()!==6||Number(date.slice(0,4))!==state.year)throw Error('Selecione sábados do ano do calendário.');
  if(!state.periods.some(p=>p.start<=date&&date<=p.end))throw Error('O sábado '+date.split('-').reverse().join('/')+' está fora dos períodos letivos. Cadastre ou ajuste o início e o término na seção 3. Períodos letivos e tente adicionar novamente.');
 }
 return selected.filter(date=>!state.events.some(e=>e.kind==='include'&&e.start<=date&&date<=e.end)).map(date=>({id:id(),name:name.trim(),evidence:evidence.trim(),kind:'include',category:'sabado',start:date,end:date}));
}
