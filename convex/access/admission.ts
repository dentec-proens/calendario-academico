import { RateLimiter, MINUTE } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';
import { components } from '../_generated/api';
import { internalMutation } from '../_generated/server';
import { assertWritesOpen } from '../lib/maintenance';
import { validInvitation, inviteError } from './invitations';
import { validReset } from './passwordRecovery';
import { institutionalEmail } from './identity';

const limiter = new RateLimiter(components.rateLimiter, {
  credentialWork: { kind: 'token bucket', rate: 2, period: MINUTE, capacity: 2 },
});

// This transaction commits the quota before the action does expensive work.
// Invalid capabilities never allocate quota keys or operational leases.
export const credentialWork = internalMutation({
  args: {
    kind: v.union(v.literal('invitation'), v.literal('reset')),
    token: v.string(),
    email: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    retryAfter: v.union(v.number(), v.null()),
    leaseId: v.union(v.id('operationalLeases'), v.null()),
  }),
  handler: async (ctx, { kind, token, email }) => {
    await assertWritesOpen(ctx);
    let key: string;
    if (kind === 'invitation') {
      const { user, invite } = await validInvitation(ctx, token);
      if (user.email !== institutionalEmail(email)) throw Error(inviteError);
      key = `invitation:${invite.tokenHash}`;
    } else {
      const { reset } = await validReset(ctx, token);
      key = `reset:${reset.tokenHash}`;
    }
    const active = await ctx.db
      .query('operationalLeases')
      .withIndex('by_credentialKey', (q) => q.eq('credentialKey', key))
      .take(2);
    if (active.length >= 2) return { ok: false, retryAfter: null, leaseId: null };
    const result = await limiter.limit(ctx, 'credentialWork', { key });
    if (!result.ok) return { ok: false, retryAfter: result.retryAfter ?? null, leaseId: null };
    const leaseId = await ctx.db.insert('operationalLeases', {
      operation:
        kind === 'invitation'
          ? 'access.invitations.acceptInvitation'
          : 'access.passwordRecovery.resetPassword',
      credentialKey: key,
      startedAt: Date.now(),
    });
    return { ok: true, retryAfter: null, leaseId };
  },
});
