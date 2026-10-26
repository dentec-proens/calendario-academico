import { calendarName } from '../../src/calendar-label';
import { normalizeCalendar } from '../../src/calendar-normalize';
import type { Doc, Id } from '../_generated/dataModel';
import type { Member } from '../authContracts';
import { assertCampus } from '../lib/authorization';
import type { Context } from '../lib/shared';
import { clean, fail, iso } from '../lib/shared';
import type { DomainState, ContentState } from '../validators';

export async function calendarRow(ctx: Context, user: Member, id: Id<'calendars'>, trash = false) {
  const row = await ctx.db.get(id);
  if (!row || (!trash && row.deletedAt)) fail('Registro não encontrado.', 404);
  assertCampus(user, row.campusId);
  return row;
}

export async function contents(ctx: Context, id: Id<'calendars'>) {
  const row = await ctx.db
    .query('calendarContents')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
    .unique();
  if (!row) fail('Conteúdo do calendário não encontrado.', 404);
  return row;
}

export function summary(row: Doc<'calendars'>, campus: Doc<'campuses'>) {
  return {
    id: row._id,
    name: calendarName(row.year, campus.name),
    campusId: row.campusId,
    year: row.year,
    modalities: row.modalities,
    offer: row.modalities[0],
    purpose: row.purpose,
    courses: row.courses,
    classes: row.classes,
    shifts: row.shifts,
    version: row.version,
    updatedAt: iso(row.updatedAt),
    ...(row.deletedAt ? { deletedAt: iso(row.deletedAt) } : {}),
  };
}

export function domainState(
  row: Doc<'calendars'>,
  campus: Doc<'campuses'>,
  state: ContentState,
): DomainState {
  return {
    ...state,
    schemaVersion: 2,
    year: row.year,
    campus: campus.name,
    modalities: row.modalities,
    offer: row.modalities[0],
  };
}

export function toContent(input: DomainState): ContentState {
  const normalized = normalizeCalendar(input) as DomainState;
  const {
    schemaVersion: _schema,
    year: _year,
    campus: _campus,
    offer: _offer,
    modalities: _modalities,
    ...state
  } = normalized;
  return clean(state);
}
