import { v, type Infer } from 'convex/values';
import type { PaginationOptions } from 'convex/server';
import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { Member } from './access/contracts';
import { calendarName } from '../src/domain/calendar/label.ts';

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
  ASSUME_REVIEW: 'Parecer assumido',
  RELEASE_REVIEW: 'Parecer liberado',
  SUBMIT_CALENDAR: 'Calendário enviado para análise',
  WITHDRAW_CALENDAR: 'Envio recolhido pelo campus',
  START_REVIEW: 'Revisão iniciada',
  RETURN_CALENDAR: 'Calendário devolvido ao campus',
  CONCLUDE_REVIEW: 'Revisão concluída',
  REOPEN_REVIEW: 'Revisão reaberta',
  PUBLISH_CALENDAR: 'Calendário publicado',
  ARCHIVE_CALENDAR: 'Calendário arquivado',
  REINSTATE_CALENDAR: 'Calendário restabelecido',
  CREATE_CALENDAR_VERSION: 'Nova versão do calendário criada',
  UPDATE_CALENDAR_IDENTITY: 'Identificação do calendário alterada',
  RENAME_CALENDAR: 'Calendário renomeado',
  UPLOAD_HISTORY: 'Calendário anterior enviado',
  CREATE_USER: 'Membro cadastrado',
  UNLOCK_PASSWORD_LOGIN: 'Login por senha desbloqueado',
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
  UPDATE_MEMBER_ROLE: 'Perfil de acesso alterado',
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
  const entries = await auditEntries(
    ctx,
    result.page,
    user.role === 'CAMPUS'
      ? (row, record) =>
          !!row.calendarId &&
          (row.target.type === 'calendar' || row.target.type === 'archived') &&
          record?.campusId === user.campusId
      : undefined,
  );
  return { entries, isDone: result.isDone, continueCursor: result.continueCursor };
}

/** Operations of one calendar record; the caller has already authorized reading that calendar. */
export async function readCalendarHistory(
  ctx: QueryCtx,
  calendarId: Id<'calendars'>,
  paginationOpts: PaginationOptions,
) {
  const result = await ctx.db
    .query('audit')
    .withIndex('by_calendarId_and_at', (q) => q.eq('calendarId', calendarId))
    .order('desc')
    .paginate(paginationOpts);
  return { ...result, page: await auditEntries(ctx, result.page) };
}

async function auditEntries(
  ctx: QueryCtx,
  rows: Doc<'audit'>[],
  include?: (row: Doc<'audit'>, record: Doc<'calendars'> | null) => boolean,
) {
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

  const entries: Infer<typeof logEntry>[] = [];
  for (const row of rows) {
    let calendarId = row.calendarId;
    if (!calendarId && row.target.type === 'calendar') calendarId = row.target.id;
    const record = calendarId ? await calendar(calendarId) : null;
    if (include && !include(row, record)) continue;
    const unit = record ? await campus(record.campusId) : null;
    const author = row.actorId && row.actorLabel === undefined ? await actor(row.actorId) : null;
    entries.push({
      at: new Date(row.at).toISOString(),
      action:
        row.action === 'UPDATE_CATALOGUE' && row.details
          ? `${labels[row.action]}: ${row.details}`
          : row.action === 'ASSUME_REVIEW' && row.details
            ? `${labels[row.action]} de ${row.details}`
            : (labels[row.action] ?? 'Alteração administrativa registrada'),
      actor: row.actorLabel ?? author?.name ?? 'Sistema',
      calendar: record && unit ? calendarName(record.year, unit.name, record.label) : null,
      version: row.version ?? null,
    });
  }
  return entries;
}
