import { calendarName } from '../domain/calendar/label.ts';

const labels: Record<string, string> = {
  DELETE_CALENDAR: 'Calendário movido para a lixeira',
  RESTORE_CALENDAR: 'Calendário restaurado',
  ANALYZE_HISTORY: 'Calendário anterior analisado',
  SAVE_CALENDAR: 'Calendário salvo',
  CREATE_CALENDAR: 'Calendário criado',
  SAVE_HUMAN_REVIEW: 'Parecer salvo',
  UPLOAD_HISTORY: 'Calendário anterior enviado',
  CREATE_USER: 'Membro cadastrado',
  REMOVE_MEMBER: 'Acesso removido',
  REISSUE_INVITATION: 'Convite renovado',
  ACCEPT_INVITATION: 'Convite aceito',
  UPDATE_CATALOGUE: 'Base institucional alterada',
  CREATE_CAMPUS: 'Unidade cadastrada',
  CREATE_ADMIN: 'Administração criada',
};

export function auditLog(
  db: {
    audit?: {
      id: string;
      action: string;
      actor: string;
      at: string;
      campusId?: string;
      version?: number;
    }[];
    calendars: { id: string; campusId: string; state: { year: number; campus: string } }[];
    users: { id: string; name: string; campusId?: string | null }[];
  },
  user: { role: string; campusId?: string | null },
  offset = 0,
) {
  const visible = (db.audit || [])
    .map((entry) => {
      const calendar = db.calendars.find((c) => c.id === entry.id);
      const owner = db.users.find((u) => u.id === entry.id);
      const campusId = calendar?.campusId || entry.campusId || owner?.campusId;
      // Campi see only calendar/review operations for their unit.
      if (user.role !== 'ADMIN' && (!calendar || campusId !== user.campusId)) return null;
      return {
        at: entry.at,
        action: labels[entry.action] || 'Alteração administrativa registrada',
        actor: db.users.find((u) => u.id === entry.actor)?.name || 'Sistema',
        calendar: calendar ? calendarName(calendar.state.year, calendar.state.campus) : null,
        version: entry.version || null,
      };
    })
    .filter((entry) => entry !== null)
    .reverse();
  return {
    entries: visible.slice(offset, offset + 100),
    nextOffset: offset + 100 < visible.length ? offset + 100 : null,
  };
}
