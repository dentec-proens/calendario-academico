import { assertWritesOpen } from '../lib/maintenance';
import { withActionLease } from '../lib/maintenance';
import { internal } from '../_generated/api';
import { mutation, action, internalMutation } from '../_generated/server';
import { passwordCrypto, validatePassword } from '../authCrypto';
import type { Context } from './identity';
import { memberFromRow, requireRecentAdmin } from './identity';
import {
  memberById,
  digest,
  randomHex,
  revokeSessions,
  patchMember,
  appendAudit,
  setPassword,
  origin,
} from './store';
import { v } from 'convex/values';

export const resetError = 'Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.';

export async function validReset(ctx: Context, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error(resetError);
  const hash = await digest(token);
  const resetRow = await ctx.db
    .query('passwordResets')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', hash))
    .unique();
  const reset = resetRow;
  const row = reset && (await memberById(ctx, reset.userId));
  const user = row && memberFromRow(row);
  if (
    !reset ||
    !row ||
    !user ||
    reset.usedAt ||
    reset.expiresAt <= Date.now() ||
    user.loginMethod === 'google' ||
    (user.nativeResetHash && user.nativeResetHash !== hash)
  )
    throw Error(resetError);
  return { row, user, resetRow: resetRow!, reset };
}

export const passwordRecovery = mutation({
  args: { id: v.id('users') },
  returns: v.object({ url: v.string(), expiresAt: v.number(), email: v.string() }),
  handler: async (ctx, { id }) => {
    await assertWritesOpen(ctx);
    const { user: actor } = await requireRecentAdmin(ctx);
    const row = await memberById(ctx, id);
    const user = row && memberFromRow(row);
    const account =
      row &&
      (await ctx.db
        .query('authAccounts')
        .withIndex('userIdAndProvider', (q) => q.eq('userId', row._id).eq('provider', 'password'))
        .unique());
    if (!row || !user || !account || user.loginMethod === 'google')
      throw Error(
        'A recuperação exige uma conta ativa com senha local. Para novos usuários, gere um convite.',
      );
    const token = randomHex(32),
      hash = await digest(token),
      expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await ctx.db.insert('passwordResets', { tokenHash: hash, userId: user.id, expiresAt });
    user.nativeResetHash = hash;
    await patchMember(ctx, row, user);
    await appendAudit(ctx, actor.id, 'ISSUE_PASSWORD_RECOVERY', id);
    return { url: `${origin()}/recuperar-senha#token=${token}`, expiresAt, email: user.email };
  },
});

export const resetPassword = action({
  args: { token: v.string(), password: v.string() },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, { token, password }): Promise<{ message: string }> => {
    validatePassword(password);
    const admission = await ctx.runMutation(internal.access.admission.credentialWork, {
      kind: 'reset',
      token,
    });
    if (!admission.ok || !admission.leaseId)
      throw Error(
        admission.retryAfter === null
          ? 'Há duas operações em andamento para este link. Aguarde sua conclusão.'
          : 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.',
      );
    return withActionLease(
      ctx,
      'access.passwordRecovery.resetPassword',
      async () =>
        ctx.runMutation(internal.access.passwordRecovery.consumeReset, {
          token,
          secret: await passwordCrypto.hashSecret(password),
        }),
      admission.leaseId,
    );
  },
});

export const consumeReset = internalMutation({
  args: { token: v.string(), secret: v.string() },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, { token, secret }) => {
    const { row, user, resetRow } = await validReset(ctx, token);
    await setPassword(ctx, row, secret);
    user.nativeResetHash = 'used';
    await patchMember(ctx, row, user);
    await ctx.db.patch(resetRow._id, { usedAt: Date.now() });
    await revokeSessions(ctx, row._id);
    await appendAudit(ctx, user.id, 'RESET_PASSWORD', user.id);
    return { message: 'Senha alterada. Entre novamente com seu e-mail e a nova senha.' };
  },
});

export const requestPasswordRecovery = action({
  args: { email: v.string() },
  returns: v.object({ message: v.string() }),
  handler: async (ctx) => {
    await ctx.runQuery(internal.access.session.assertWritesAllowed, {});
    throw Error(
      'A recuperação por e-mail ainda não está configurada. Entre em contato com dentec.proens@ifpr.edu.br.',
    );
  },
});
