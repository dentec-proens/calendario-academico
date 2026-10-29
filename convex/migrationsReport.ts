import type { WithoutSystemFields } from 'convex/server';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

export const migrationKey = 'offers-v4' as const;
export const purgedTables = [
  'reviewVersions',
  'reviews',
  'calendarVersions',
  'calendarSnapshots',
  'calendarAliases',
] as const;
export type PurgedTable = (typeof purgedTables)[number];
type Result = WithoutSystemFields<Doc<'migrationResults'>>;

export const migrationReport = (ctx: QueryCtx) =>
  ctx.db
    .query('migrationReports')
    .withIndex('by_key', (q) => q.eq('key', migrationKey))
    .unique();

export async function ensureMigrationReport(ctx: MutationCtx) {
  const report = await migrationReport(ctx);
  if (report) return report;
  const id = await ctx.db.insert('migrationReports', {
    key: migrationKey,
    converted: 0,
    alreadyV4: 0,
    // A content contributes once if organization, required stages or intake remain pending.
    pending: 0,
    orphanContents: 0,
    orphanCalendars: 0,
    orphanKeys: 0,
    failures: 0,
    purged: {
      reviewVersions: 0,
      reviews: 0,
      calendarVersions: 0,
      calendarSnapshots: 0,
      calendarAliases: 0,
    },
    startedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

export const migrationResult = (ctx: QueryCtx, reference: string) =>
  ctx.db
    .query('migrationResults')
    .withIndex('by_key_and_reference', (q) => q.eq('key', migrationKey).eq('reference', reference))
    .unique();

function contribution(result: Result | null) {
  return {
    converted: Number(result?.outcome === 'converted'),
    alreadyV4: Number(result?.outcome === 'already-v4'),
    pending: Number(result?.pending ?? false),
    orphanContents: Number(result?.outcome === 'orphan-content'),
    orphanCalendars: Number(result?.outcome === 'orphan-calendar'),
    orphanKeys: result?.orphanKeys ?? 0,
    failures: Number(result?.outcome === 'failed'),
  };
}

/** Replacement subtracts the previous receipt, so retries cannot inflate totals. */
export async function recordMigrationResult(ctx: MutationCtx, result: Result) {
  const previous = await migrationResult(ctx, result.reference);
  const before = contribution(previous);
  const after = contribution(result);
  const report = await ensureMigrationReport(ctx);
  await ctx.db.patch(report._id, {
    converted: report.converted + after.converted - before.converted,
    alreadyV4: report.alreadyV4 + after.alreadyV4 - before.alreadyV4,
    pending: report.pending + after.pending - before.pending,
    orphanContents: report.orphanContents + after.orphanContents - before.orphanContents,
    orphanCalendars: report.orphanCalendars + after.orphanCalendars - before.orphanCalendars,
    orphanKeys: report.orphanKeys + after.orphanKeys - before.orphanKeys,
    failures: report.failures + after.failures - before.failures,
    completedAt: undefined,
  });
  if (previous) await ctx.db.replace(previous._id, result);
  else await ctx.db.insert('migrationResults', result);
}

export async function clearCalendarResult(ctx: MutationCtx, reference: string) {
  const previous = await migrationResult(ctx, reference);
  if (!previous) return;
  const before = contribution(previous);
  const report = await ensureMigrationReport(ctx);
  await ctx.db.patch(report._id, {
    failures: report.failures - before.failures,
    orphanCalendars: report.orphanCalendars - before.orphanCalendars,
    completedAt: undefined,
  });
  await ctx.db.delete(previous._id);
}

export async function purgeMigrationRow(
  ctx: MutationCtx,
  row: Doc<PurgedTable>,
  table: PurgedTable,
) {
  const report = await ensureMigrationReport(ctx);
  await ctx.db.delete(row._id);
  await ctx.db.patch(report._id, {
    purged: { ...report.purged, [table]: report.purged[table] + 1 },
  });
}
