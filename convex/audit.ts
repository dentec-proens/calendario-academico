import { v } from 'convex/values';
import type { PaginationOptions } from 'convex/server';
import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { Member } from './authContracts';
import { calendarName } from '../src/calendar-label.ts';

export const logEntry = v.object({
  at: v.string(),
  action: v.string(),
  actor: v.string(),
  calendar: v.union(v.string(), v.null()),
  version: v.union(v.number(), v.null()),
});

const labels: Record<string, string> = {
  DELETE_CALENDAR: 'Calendário movido para a lixeira',
  RESTORE_CALENDAR: 'Calendário restaurado',
  ANALYZE_HISTORY: 'Calendário anterior analisado',
  SAVE_CALENDAR: 'Calendário salvo',
  CREATE_CALENDAR: 'Calendário criado',
  MAKE_CALENDAR_DEFINITIVE: 'Calendário tornado definitivo',
  SAVE_HUMAN_REVIEW: 'Parecer salvo',
  UPLOAD_HISTORY: 'Calendário anterior enviado',
  CREATE_USER: 'Membro cadastrado',
  REMOVE_MEMBER: 'Acesso removido',
  REISSUE_INVITATION: 'Convite renovado',
  ACCEPT_INVITATION: 'Convite aceito',
  ISSUE_PASSWORD_RECOVERY: 'Recuperação de senha emitida',
  RESET_PASSWORD: 'Senha alterada',
  RESTORE_HISTORY_ORIGINAL: 'PDF histórico original restaurado',
  RESTORE_DOCUMENT_ORIGINAL: 'PDF institucional original restaurado',
  UPDATE_CATALOGUE: 'Base institucional alterada',
  CREATE_CAMPUS: 'Unidade cadastrada',
  CREATE_ADMIN: 'Administração criada',
  UPLOAD_INSTITUTIONAL_DOCUMENT: 'Documento institucional enviado',
  SET_INSTITUTIONAL_DOCUMENT_VIGENTE: 'Documento institucional publicado',
  SET_INSTITUTIONAL_DOCUMENT_ARQUIVADO: 'Documento institucional arquivado',
};

export async function readAuditPage(
  ctx: QueryCtx,
  user: Member,
  paginationOpts: PaginationOptions,
) {
  if (user.role === 'CAMPUS' && !user.campusId) throw Error('Campus obrigatório.');
  const result = await (
    user.role === 'CAMPUS'
      ? ctx.db
          .query('audit')
          .withIndex('by_campusId_and_at', (q) => q.eq('campusId', user.campusId!))
      : ctx.db.query('audit').withIndex('by_at')
  )
    .order('desc')
    .paginate(paginationOpts);

  const actors = new Map<Id<'users'>, Promise<Doc<'users'> | null>>();
  const calendars = new Map<Id<'calendars'>, Promise<Doc<'calendars'> | null>>();
  const campuses = new Map<Id<'campuses'>, Promise<Doc<'campuses'> | null>>();
  const actor = (id: Id<'users'>) => {
    if (!actors.has(id)) actors.set(id, ctx.db.get(id));
    return actors.get(id)!;
  };
  const calendar = (id: Id<'calendars'>) => {
    if (!calendars.has(id)) calendars.set(id, ctx.db.get(id));
    return calendars.get(id)!;
  };
  const campus = (id: Id<'campuses'>) => {
    if (!campuses.has(id)) campuses.set(id, ctx.db.get(id));
    return campuses.get(id)!;
  };

  const entries = [];
  for (const row of result.page) {
    if (
      user.role === 'CAMPUS' &&
      (!row.calendarId || (row.target.type !== 'calendar' && row.target.type !== 'history'))
    )
      continue;
    let calendarId = row.calendarId;
    if (!calendarId && row.target.type === 'calendar') calendarId = row.target.id;
    if (!calendarId && row.target.type === 'history') {
      calendarId = (await ctx.db.get(row.target.id))?.calendarId;
    }
    const record = calendarId ? await calendar(calendarId) : null;
    if (user.role === 'CAMPUS' && (!record || record.campusId !== user.campusId)) continue;
    const unit = record ? await campus(record.campusId) : null;
    const author = row.actorId && row.actorLabel === undefined ? await actor(row.actorId) : null;
    entries.push({
      at: new Date(row.at).toISOString(),
      action: labels[row.action] ?? 'Alteração administrativa registrada',
      actor: row.actorLabel ?? author?.name ?? 'Sistema',
      calendar: record && unit ? calendarName(record.year, unit.name) : null,
      version: row.version ?? null,
    });
  }
  return { entries, isDone: result.isDone, continueCursor: result.continueCursor };
}
