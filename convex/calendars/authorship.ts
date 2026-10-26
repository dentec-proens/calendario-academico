import type { Doc } from '../_generated/dataModel';
import type { Context } from '../lib/shared';

/** Read attribution only after the caller has authorized access to this calendar. */
export async function calendarAuthorship(
  ctx: Context,
  calendar: Pick<Doc<'calendars'>, '_id' | 'version' | 'updatedAt'>,
) {
  const entry = (action: string, order: 'asc' | 'desc') =>
    ctx.db
      .query('audit')
      .withIndex('by_calendarId_and_action_and_at', (q) =>
        q.eq('calendarId', calendar._id).eq('action', action),
      )
      .order(order)
      .first();
  const [created, saved, converted] = await Promise.all([
    entry('CREATE_CALENDAR', 'asc'),
    entry('SAVE_CALENDAR', 'desc'),
    entry('MAKE_CALENDAR_DEFINITIVE', 'desc'),
  ]);
  // Uploads, reviews and trash operations do not change the calendar's updatedAt/version.
  const latest = [created, saved, converted]
    .filter((item) => item !== null)
    .filter(
      (item) =>
        item.version === calendar.version ||
        (item.version === undefined && item.at === calendar.updatedAt),
    )
    .sort((a, b) => b.at - a.at || (b.version ?? 0) - (a.version ?? 0))[0];
  const name = async (row: Doc<'audit'> | null | undefined) => {
    if (!row) return undefined;
    if (row.actorLabel?.trim()) return row.actorLabel.trim();
    return row.actorId ? (await ctx.db.get(row.actorId))?.name.trim() || undefined : undefined;
  };
  const [createdByName, updatedByName] = await Promise.all([name(created), name(latest)]);
  return {
    ...(createdByName ? { createdByName } : {}),
    ...(updatedByName ? { updatedByName } : {}),
  };
}
