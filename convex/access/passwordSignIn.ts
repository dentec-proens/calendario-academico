import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

// Both nested mutations commit with this outer transaction. A password reset
// cannot slip between verification and session creation. Return credential
// failures instead of throwing here so upstream failed-attempt writes commit.
export const authorize = internalMutation({
  args: { email: v.string(), password: v.string() },
  returns: v.union(
    v.object({ error: v.string() }),
    v.object({ userId: v.id('users'), sessionId: v.id('authSessions') }),
  ),
  handler: async (
    ctx,
    { email, password },
  ): Promise<{ error: string } | { userId: Id<'users'>; sessionId: Id<'authSessions'> }> => {
    const result = await ctx.runMutation(internal.auth.store, {
      args: {
        type: 'retrieveAccountWithCredentials',
        provider: 'password',
        account: { id: email, secret: password },
      },
    });
    if (typeof result === 'string') return { error: result };
    if (!result || !('user' in result)) throw Error('Resposta de autenticação inválida.');
    const signedIn = await ctx.runMutation(internal.auth.store, {
      args: { type: 'signIn', userId: result.user._id, generateTokens: false },
    });
    if (!signedIn || typeof signedIn === 'string' || !('sessionId' in signedIn))
      throw Error('Resposta de sessão inválida.');
    return { userId: signedIn.userId, sessionId: signedIn.sessionId };
  },
});
