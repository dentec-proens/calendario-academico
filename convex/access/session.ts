import { assertWritesOpen } from '../lib/maintenance';
import { query, internalQuery, internalMutation } from '../_generated/server';
import { publicMember } from '../authContracts';
import { memberFromRow, requireNativeUser, requireRecentAdmin, safeMember } from './identity';
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

export const me = query({
  args: {},
  returns: v.union(publicMember, v.null()),
  handler: async (ctx) => {
    if (!(await getAuthUserId(ctx))) return null;
    try {
      return safeMember((await requireNativeUser(ctx)).user);
    } catch {
      return null;
    }
  },
});

export const status = query({
  args: {},
  returns: v.object({
    setupRequired: v.boolean(),
    hosted: v.boolean(),
    googleEnabled: v.boolean(),
    user: v.union(publicMember, v.null()),
  }),
  handler: async (ctx) => {
    let user = null;
    if (await getAuthUserId(ctx)) {
      try {
        user = safeMember((await requireNativeUser(ctx)).user);
      } catch {
        /* expired session */
      }
    }
    return {
      setupRequired: !(await ctx.db.query('users').first()),
      hosted: true,
      googleEnabled: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
      user,
    };
  },
});

export const passwordOptions = query({
  args: {},
  returns: v.object({ emailEnabled: v.boolean() }),
  handler: async () => ({ emailEnabled: false }),
});

export const assertAdmin = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireRecentAdmin(ctx);
    return null;
  },
});

export const authorizedMember = internalQuery({
  args: { id: v.id('users') },
  returns: v.boolean(),
  handler: async (ctx, { id }) => !!memberFromRow(await ctx.db.get(id)),
});

export const assertWritesAllowed = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await assertWritesOpen(ctx);
    return null;
  },
});
