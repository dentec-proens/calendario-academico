import { paginationOptsValidator } from 'convex/server';
import { v, type Infer } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { requireAdmin, requireNativeUser } from './access/identity';
import { maintenancePaused } from './lib/maintenance';
import { pageBound } from './lib/pagination';
import { calendarName } from '../src/domain/calendar/label.ts';

const hour = 60 * 60_000;
const retention = 90 * 24 * hour;
/** A page stuck in a loop cannot fill the table: past this, reports are dropped until the hour ends. */
const reportsPerHour = 30;
const sweepBatch = 200;

export const clientErrorKind = v.union(
  v.literal('save'),
  v.literal('render'),
  v.literal('rejection'),
);

const clientErrorEntry = v.object({
  at: v.string(),
  kind: clientErrorKind,
  status: v.union(v.number(), v.null()),
  message: v.string(),
  route: v.string(),
  actor: v.string(),
  calendar: v.union(v.string(), v.null()),
  release: v.string(),
});

/**
 * A refusal cannot be recorded by the mutation that refused: its throw reverts the transaction, so
 * the client reports it. Nothing here accepts calendar state or form values, and the route loses its
 * query string, which can carry private tokens.
 */
export const report = mutation({
  args: {
    kind: clientErrorKind,
    status: v.optional(v.number()),
    message: v.string(),
    route: v.string(),
    calendarId: v.optional(v.string()),
    release: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { kind, status, message, route, calendarId, release }) => {
    const { row } = await requireNativeUser(ctx);
    if (await maintenancePaused(ctx)) return null;
    const at = Date.now();
    const recent = await ctx.db
      .query('clientErrors')
      .withIndex('by_userId_and_at', (q) => q.eq('userId', row._id).gte('at', at - hour))
      .take(reportsPerHour);
    if (recent.length >= reportsPerHour) return null;
    const calendar = calendarId ? ctx.db.normalizeId('calendars', calendarId) : null;
    await ctx.db.insert('clientErrors', {
      at,
      userId: row._id,
      kind,
      ...(status === undefined ? {} : { status }),
      message: message.slice(0, 300),
      route: (route.split(/[?#]/)[0] ?? '').slice(0, 200),
      ...(calendar ? { calendarId: calendar } : {}),
      release: release.slice(0, 64),
    });
    return null;
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    entries: v.array(clientErrorEntry),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    pageBound(paginationOpts.numItems);
    await requireAdmin(ctx);
    const result = await ctx.db
      .query('clientErrors')
      .withIndex('by_at')
      .order('desc')
      .paginate(paginationOpts);
    const entries: Infer<typeof clientErrorEntry>[] = [];
    for (const row of result.page) {
      const [author, record] = await Promise.all([
        ctx.db.get(row.userId),
        row.calendarId ? ctx.db.get(row.calendarId) : null,
      ]);
      const unit = record ? await ctx.db.get(record.campusId) : null;
      entries.push({
        at: new Date(row.at).toISOString(),
        kind: row.kind,
        status: row.status ?? null,
        message: row.message,
        route: row.route,
        actor: author?.name ?? 'Conta removida',
        calendar: record && unit ? calendarName(record.year, unit.name, record.label) : null,
        release: row.release,
      });
    }
    return { entries, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const sweep = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (await maintenancePaused(ctx)) return 0;
    const expired = await ctx.db
      .query('clientErrors')
      .withIndex('by_at', (q) => q.lt('at', Date.now() - retention))
      .take(sweepBatch);
    for (const row of expired) await ctx.db.delete(row._id);
    if (expired.length === sweepBatch)
      await ctx.scheduler.runAfter(0, internal.clientErrors.sweep, {});
    return expired.length;
  },
});
