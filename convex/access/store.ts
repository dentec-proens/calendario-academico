import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { Member } from '../authContracts';
import type { Context } from './identity';

export const origin = () => (process.env.SITE_URL || 'http://127.0.0.1:4183').replace(/\/$/, '');

export const randomHex = (length: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

export async function digest(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function appendAudit(
  ctx: MutationCtx,
  actorId: Id<'users'>,
  action: string,
  id: Id<'users'>,
) {
  await ctx.db.insert('audit', { at: Date.now(), actorId, action, target: { type: 'user', id } });
}

export async function memberById(ctx: Context, id: Id<'users'>) {
  return ctx.db.get(id);
}

export async function patchMember(ctx: MutationCtx, row: Doc<'users'>, user: Member) {
  await ctx.db.patch(row._id, {
    name: user.name,
    email: user.email,
    role: user.role,
    campusId: user.campusId ?? undefined,
    active: user.active,
    loginMethod: user.loginMethod,
    inviteExpiresAt: user.inviteExpiresAt,
    removedAt: user.removedAt,
    nativeInviteHash: user.nativeInviteHash,
    nativeResetHash: user.nativeResetHash,
    googleSubject: user.googleSubject,
    googleLastLoginAt: user.googleLastLoginAt,
  });
}

export async function setPassword(ctx: MutationCtx, row: Doc<'users'>, secret: string) {
  const account = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', row.email!),
    )
    .unique();
  if (account && account.userId !== row._id) throw Error('E-mail já cadastrado.');
  if (account) await ctx.db.patch(account._id, { secret });
  else
    await ctx.db.insert('authAccounts', {
      provider: 'password',
      providerAccountId: row.email!,
      userId: row._id,
      secret,
    });
}

export async function revokeSessions(ctx: MutationCtx, userId: Id<'users'>) {
  const sessions = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .take(1001);
  if (sessions.length > 1000) throw Error('Limite de sessões excedido.');
  let tokenCount = 0;
  for (const session of sessions) {
    const tokens = await ctx.db
      .query('authRefreshTokens')
      .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
      .take(1001);
    tokenCount += tokens.length;
    if (tokens.length > 1000 || tokenCount > 4000) throw Error('Limite de tokens excedido.');
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(session._id);
  }
}
