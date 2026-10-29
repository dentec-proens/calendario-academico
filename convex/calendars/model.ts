import { calendarName } from '../../src/domain/calendar/label';
import type { Doc, Id } from '../_generated/dataModel';
import type { Member } from '../access/contracts';
import { assertCampus } from '../lib/authorization';
import type { Context } from '../lib/shared';
import { fail, iso } from '../lib/shared';
import type { DomainState, StoredContentState } from '../validators';
import { convertCalendarV3 } from '../../src/domain/calendar/normalization/conversion-v4';
import { calendarAuthorship } from './authorship';

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

export async function summary(ctx: Context, row: Doc<'calendars'>, campus: Doc<'campuses'>) {
  return {
    id: row._id,
    name: calendarName(row.year, campus.name),
    campusId: row.campusId,
    year: row.year,
    offerKinds: row.offerKinds ?? row.modalities ?? [],
    purpose: row.purpose,
    courses: row.courses,
    classes: row.classes,
    shifts: row.shifts,
    version: row.version,
    updatedAt: iso(row.updatedAt),
    ...(await calendarAuthorship(ctx, row)),
    ...(row.deletedAt ? { deletedAt: iso(row.deletedAt) } : {}),
  };
}

export function domainState(
  row: Doc<'calendars'>,
  campus: Doc<'campuses'>,
  state: StoredContentState,
): DomainState {
  const content =
    state.schemaVersion === 4
      ? state
      : convertCalendarV3(state, {
          year: row.year,
          modalities: row.modalities ?? row.offerKinds ?? [],
        });
  return {
    ...content,
    year: row.year,
    campus: campus.name,
  } as DomainState;
}
