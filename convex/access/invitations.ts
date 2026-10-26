import { assertWritesOpen } from '../lib/maintenance';
import { withActionLease } from '../lib/maintenance';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { query, mutation, action, internalMutation } from '../_generated/server';
import { memberRole, invitationResult } from '../authContracts';
import { passwordCrypto, validatePassword } from '../authCrypto';
import type { Context } from './identity';
import { institutionalEmail, requireAdmin, storedMember } from './identity';
import { memberById, digest, patchMember, appendAudit, setPassword, origin } from './store';
import { v } from 'convex/values';

export const inviteError =
  'Convite inválido, expirado ou já utilizado. Solicite um novo ao administrador.';

export async function issueInvite(ctx: MutationCtx, row: Doc<'users'>, actor: Id<'users'>) {
  const user = storedMember(row);
  if (user.removedAt !== undefined || user.active || user.loginMethod !== 'invite')
    throw Error(inviteError);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const tokenHash = await digest(token);
  const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
  await ctx.db.insert('invitations', {
    tokenHash,
    userId: user.id,
    expiresAt,
    createdBy: actor,
    createdAt: Date.now(),
    revoked: false,
  });
  user.inviteExpiresAt = expiresAt;
  user.nativeInviteHash = tokenHash;
  await patchMember(ctx, row, user);
  return { inviteUrl: `${origin()}/ativar-conta#token=${token}`, inviteExpiresAt: expiresAt };
}

export async function validInvitation(ctx: Context, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error(inviteError);
  const hash = await digest(token);
  const inviteRow = await ctx.db
    .query('invitations')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', hash))
    .unique();
  const invite = inviteRow;
  const row = invite && (await memberById(ctx, invite.userId));
  const user = row && storedMember(row);
  if (
    !row ||
    !user ||
    !invite ||
    invite.usedAt ||
    invite.revoked ||
    invite.expiresAt <= Date.now() ||
    user.active ||
    user.removedAt !== undefined ||
    user.loginMethod !== 'invite' ||
    (user.nativeInviteHash && user.nativeInviteHash !== hash)
  )
    throw Error(inviteError);
  return { row, user, inviteRow: inviteRow!, invite };
}

export const checkInvitation = query({
  args: { token: v.string() },
  returns: v.object({
    name: v.string(),
    email: v.string(),
    role: memberRole,
    campus: v.union(v.string(), v.null()),
    expiresAt: v.number(),
  }),
  handler: async (ctx, { token }) => {
    const { user, invite } = await validInvitation(ctx, token);
    const campus = user.campusId ? await ctx.db.get(user.campusId) : null;
    return {
      name: user.name,
      email: user.email,
      role: user.role,
      campus: campus?.name ?? null,
      expiresAt: invite.expiresAt,
    };
  },
});

export const issueInvitation = mutation({
  args: { id: v.id('users') },
  returns: v.object(invitationResult),
  handler: async (ctx, { id }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireAdmin(ctx);
    const row = await memberById(ctx, id);
    if (!row) throw Error('Membro não encontrado.');
    const result = await issueInvite(ctx, row, user.id);
    await appendAudit(ctx, user.id, 'REISSUE_INVITATION', id);
    return result;
  },
});

// Actions authorize before doing CPU-heavy work. The mutation checks again so
// session revocation or a role change during hashing cannot grant access.

export const acceptInvitation = action({
  args: { token: v.string(), email: v.string(), password: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args): Promise<{ ok: boolean }> =>
    withActionLease(ctx, 'access.invitations.acceptInvitation', async () => {
      validatePassword(args.password);
      return ctx.runMutation(internal.access.invitations.consumeInvitation, {
        token: args.token,
        email: institutionalEmail(args.email),
        secret: await passwordCrypto.hashSecret(args.password),
      });
    }),
});

export const consumeInvitation = internalMutation({
  args: { token: v.string(), email: v.string(), secret: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { token, email, secret }) => {
    const { row, user, inviteRow } = await validInvitation(ctx, token);
    if (user.email !== email) throw Error(inviteError);
    await setPassword(ctx, row, secret);
    user.active = true;
    user.loginMethod = 'local';
    delete user.inviteExpiresAt;
    delete user.nativeInviteHash;
    await patchMember(ctx, row, user);
    await ctx.db.patch(inviteRow._id, { usedAt: Date.now() });
    await appendAudit(ctx, user.id, 'ACCEPT_INVITATION', user.id);
    return { ok: true };
  },
});
