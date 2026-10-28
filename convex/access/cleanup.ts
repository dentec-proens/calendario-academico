import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { maintenancePaused } from '../lib/maintenance';

const batchSize = 100;

/** At most 100 token deletes and 25 session deletes in one transaction. */
export async function purgeUserSessions(ctx: MutationCtx, userId: Id<'users'>, generation: number) {
  let remaining = batchSize;
  for (let i = 0; i < 25 && remaining > 0; i++) {
    const session = await ctx.db
      .query('authSessions')
      .withIndex('by_userId_generation', (q) => q.eq('userId', userId).lt('generation', generation))
      .first();
    if (!session) return false;
    const tokens = await ctx.db
      .query('authRefreshTokens')
      .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
      .take(remaining);
    for (const token of tokens) await ctx.db.delete(token._id);
    remaining -= tokens.length;
    if (remaining === 0) return true;
    await ctx.db.delete(session._id);
  }
  return true;
}

export const purgeRevoked = internalMutation({
  args: { userId: v.id('users'), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await maintenancePaused(ctx)) return null;
    if (await purgeUserSessions(ctx, args.userId, args.generation)) {
      await ctx.scheduler.runAfter(0, internal.access.cleanup.purgeRevoked, args);
    }
    return null;
  },
});

export const sweep = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), continued: v.boolean() }),
  handler: async (ctx) => {
    if (await maintenancePaused(ctx)) return { deleted: 0, continued: false };
    const now = Date.now();
    let deleted = 0;
    // Expired sessions are cleaned independently, without touching newer logins.
    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('by_expirationTime', (q) => q.lte('expirationTime', now))
      .take(10);
    let continued = sessions.length === 10;
    for (const session of sessions) {
      const tokens = await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
        .take(batchSize - deleted);
      for (const token of tokens) await ctx.db.delete(token._id);
      deleted += tokens.length;
      if (deleted >= batchSize) continued = true;
      else {
        await ctx.db.delete(session._id);
        deleted++;
      }
      if (deleted >= batchSize) {
        continued = true;
        break;
      }
    }
    if (deleted < batchSize) {
      const verifiers = await ctx.db
        .query('authVerifiers')
        .withIndex('by_creation_time', (q) => q.lt('_creationTime', now - 60 * 60_000))
        .take(Math.min(25, Math.max(0, batchSize - deleted)));
      for (const row of verifiers) await ctx.db.delete(row._id);
      deleted += verifiers.length;
      continued ||= verifiers.length === 25;
      const codes = await ctx.db
        .query('authVerificationCodes')
        .withIndex('by_expirationTime', (q) => q.lte('expirationTime', now))
        .take(Math.min(25, Math.max(0, batchSize - deleted)));
      for (const row of codes) await ctx.db.delete(row._id);
      deleted += codes.length;
      continued ||= codes.length === 25;
      const invitations = await ctx.db
        .query('invitations')
        .withIndex('by_expiresAt', (q) => q.lte('expiresAt', now))
        .take(Math.min(25, Math.max(0, batchSize - deleted)));
      for (const row of invitations) await ctx.db.delete(row._id);
      deleted += invitations.length;
      continued ||= invitations.length === 25;
      const resets = await ctx.db
        .query('passwordResets')
        .withIndex('by_expiresAt', (q) => q.lte('expiresAt', now))
        .take(Math.min(25, Math.max(0, batchSize - deleted)));
      for (const row of resets) await ctx.db.delete(row._id);
      deleted += resets.length;
      continued ||= resets.length === 25;
    }
    if (continued) await ctx.scheduler.runAfter(0, internal.access.cleanup.sweep, {});
    return { deleted, continued };
  },
});
