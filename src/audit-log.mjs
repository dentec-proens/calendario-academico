import {calendarName} from './calendar-label.mjs';
const labels={DELETE_CALENDAR:'Calendário movido para a lixeira',RESTORE_CALENDAR:'Calendário restaurado',ANALYZE_HISTORY:'Calendário anterior analisado',SAVE_CALENDAR:'Calendário salvo',CREATE_CALENDAR:'Calendário criado',SAVE_HUMAN_REVIEW:'Parecer salvo',UPLOAD_HISTORY:'Calendário anterior enviado',CREATE_USER:'Membro cadastrado',REMOVE_MEMBER:'Acesso removido',REISSUE_INVITATION:'Convite renovado',ACCEPT_INVITATION:'Convite aceito',UPDATE_CATALOGUE:'Base institucional alterada',CREATE_CAMPUS:'Unidade cadastrada',CREATE_ADMIN:'Administração criada'};
export function auditLog(db,user,offset=0){
 const visible=(db.audit||[]).map(entry=>{
  const history=(db.histories||[]).find(h=>h.id===entry.id);
  const calendar=db.calendars.find(c=>c.id===(history?.calendarId||entry.id));
  const owner=db.users.find(u=>u.id===entry.id);
  const campusId=calendar?.campusId||entry.campusId||owner?.campusId;
  // Campi see only calendar/history/review operations for their unit.
  if(user.role!=='ADMIN'&&(!calendar||campusId!==user.campusId))return null;
  return {at:entry.at,action:labels[entry.action]||'Alteração administrativa registrada',actor:db.users.find(u=>u.id===entry.actor)?.name||'Sistema',calendar:calendar?calendarName(calendar.state.year,calendar.state.campus):null,version:entry.version||null};
 }).filter(Boolean).reverse();
 return {entries:visible.slice(offset,offset+100),nextOffset:offset+100<visible.length?offset+100:null};
}
