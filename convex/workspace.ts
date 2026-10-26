import { query } from './_generated/server';
import { requireNativeUser, safeMember } from './access/identity';
import { readAuditPage, logEntry } from './audit';
import { calendarSummaries } from './calendars/record';
import { catalogue } from './catalogue/model';
import * as contracts from './contracts';
import { calendarEditor } from './lib/authorization';
import { pageBound } from './lib/pagination';
import { fail } from './lib/shared';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

export const bootstrap = query({
  args: { includeCalendars: v.optional(v.boolean()) },
  returns: contracts.bootstrapDto,
  handler: async (ctx, { includeCalendars }) => {
    const { user } = await requireNativeUser(ctx);
    const rows = await ctx.db.query('campuses').withIndex('by_name').take(501);
    if (rows.length > 500) fail('Limite de unidades excedido.');
    const members = user.role === 'ADMIN' ? await ctx.db.query('users').take(1001) : [];
    if (members.length > 1000) fail('Use a consulta paginada de membros.');
    return {
      user: safeMember(user),
      campuses: rows
        .filter((c) => !c.archived && (user.role !== 'CAMPUS' || c._id === user.campusId))
        .map(({ _id, name, archived }) => ({ id: _id, name, archived })),
      catalogue: await catalogue(ctx),
      calendars: includeCalendars === false ? [] : await calendarSummaries(ctx, user),
      users: members
        .filter((u) => !u.removedAt)
        .map((u) => safeMember({ ...u, id: u._id, campusId: u.campusId ?? null })),
    };
  },
});

export const logs = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    entries: v.array(logEntry),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    pageBound(paginationOpts.numItems);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
    return readAuditPage(ctx, user, paginationOpts);
  },
});
