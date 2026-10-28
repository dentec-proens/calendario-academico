import { v } from 'convex/values';
import { mutation, internalMutation } from '../_generated/server';
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { requireRecentAdmin } from './identity';
import { appendAudit } from './store';
import { assertWritesOpen } from '../lib/maintenance';

async function unlock(ctx: MutationCtx, id: Id<'users'>, adminOnly = false) {
  const target = await ctx.db.get(id);
  if (
    !target ||
    !target.active ||
    target.removedAt !== undefined ||
    target.loginMethod !== 'local' ||
    (adminOnly && target.role !== 'ADMIN')
  )
    throw Error('Selecione uma conta ativa com senha local.');
  const account = await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) => q.eq('userId', id).eq('provider', 'password'))
    .unique();
  if (!account) throw Error('A conta ainda não possui senha local.');
  const limit = await ctx.db
    .query('authRateLimits')
    .withIndex('identifier', (q) => q.eq('identifier', account._id))
    .unique();
  if (limit) await ctx.db.delete(limit._id);
}

export const unlockPassword = mutation({
  args: { id: v.id('users') },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { id }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireRecentAdmin(ctx);
    await unlock(ctx, id);
    await appendAudit(ctx, user.id, 'UNLOCK_PASSWORD_LOGIN', id);
    return { ok: true as const };
  },
});

// Only the deployment operator can call an internal function. This narrowly
// scoped contingency restores an ADMIN's normal login; it never issues tokens.
export const unlockAdminOperationally = internalMutation({
  args: { id: v.id('users'), incidentRef: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, incidentRef }) => {
    await assertWritesOpen(ctx);
    if (!/^[A-Za-z0-9._/-]{3,120}$/.test(incidentRef))
      throw Error('Informe a referência do incidente.');
    await unlock(ctx, id, true);
    await ctx.db.insert('audit', {
      at: Date.now(),
      actorLabel: 'Contingência: operador da plataforma',
      action: 'UNLOCK_PASSWORD_LOGIN',
      target: { type: 'user', id },
      details: incidentRef,
    });
    return null;
  },
});
