import {countCalendar} from './calendar.mjs';
import {calendarModalities,appliesTo} from './modalities.mjs';
export function evaluateCalendar(s,events){
 const byModality={};
 for(const modality of calendarModalities(s)){
  const scoped=events.filter(e=>appliesTo(e,modality));
  const minimum=s.year===2027&&modality!=='posgraduacao';
  byModality[modality]=countCalendar({year:s.year,offerId:modality,periods:s.periods,weekPattern:{weekdays:s.weekdays,confirmed:s.weekConfirmed,evidenceId:s.weekEvidence},inclusions:scoped.filter(e=>e.kind==='include').map(e=>({...e,offerIds:[modality],confirmed:true,evidenceId:e.evidence})),exclusions:scoped.filter(e=>e.kind==='exclude').map(e=>({...e,offerIds:[modality],confirmed:true,evidenceId:e.evidence})),thresholds:{annual:minimum?200:null,byPeriod:Object.fromEntries(s.periods.map(p=>[p.id,minimum&&s.regime!=='anual'?100:null]))}});
 }
 return {...byModality[calendarModalities(s)[0]],byModality};
}
