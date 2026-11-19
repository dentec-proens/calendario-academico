import { v } from 'convex/values';
import { calendarName, labelKey, repeatedLabel } from '../src/domain/calendar/label';
import { statusLabels } from '../src/domain/calendar/lifecycle';
import { internalQuery } from './_generated/server';
import type { Doc } from './_generated/dataModel';

/**
 * Temporary: lists the calendars outside the trash whose label is missing or repeats another of
 * the same campus and year, for the administration to rename after the label became required
 * (docs/plans/calendarios-independentes.md). Run with `npx convex run --prod
 * labelReview:pending`; removed once the review is done.
 */
export const pending = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      campus: v.string(),
      year: v.number(),
      name: v.string(),
      status: v.string(),
      problem: v.union(v.literal('sem rótulo'), v.literal('rótulo repetido')),
    }),
  ),
  handler: async (ctx) => {
    const groups = new Map<string, Doc<'calendars'>[]>();
    for await (const row of ctx.db.query('calendars')) {
      if (row.deletedAt) continue;
      const key = `${row.campusId}:${row.year}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const result = [];
    for (const rows of groups.values()) {
      const campus = (await ctx.db.get(rows[0]!.campusId))?.name ?? '';
      const labelled = rows.map((row) => ({
        id: row._id,
        status: row.status,
        label: row.label,
        derivedFrom: row.derivedFrom,
      }));
      for (const row of rows) {
        const missing = !labelKey(row.label);
        const repeated =
          row.status !== 'arquivado' &&
          repeatedLabel(
            labelled.find((item) => item.id === row._id)!,
            row.label,
            labelled,
          );
        if (!missing && !repeated) continue;
        result.push({
          campus,
          year: row.year,
          name: calendarName(row.year, campus, row.label),
          status: statusLabels[row.status],
          problem: missing ? ('sem rótulo' as const) : ('rótulo repetido' as const),
        });
      }
    }
    return result.sort(
      (a, b) =>
        a.campus.localeCompare(b.campus, 'pt-BR') ||
        a.year - b.year ||
        a.name.localeCompare(b.name),
    );
  },
});
