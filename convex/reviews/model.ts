import type { Doc, Id } from '../_generated/dataModel';
import { documentDto } from '../documents/model';
import type { Context } from '../lib/shared';
import { iso } from '../lib/shared';

export function reviewDto(row: Doc<'reviews'>) {
  const { _id, _creationTime, ...fields } = row;
  return {
    ...fields,
    updatedAt: iso(row.updatedAt),
    documentSnapshot: row.documentSnapshot.map(documentDto),
    officialApproval: false as const,
  };
}

export async function reviewRow(ctx: Context, id: Id<'calendars'>) {
  return ctx.db
    .query('reviews')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
    .unique();
}
