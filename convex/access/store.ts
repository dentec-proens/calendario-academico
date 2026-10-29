import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { Member } from './contracts';
import type { Context } from './identity';
import { internal } from '../_generated/api';
import { purgeUserSessions } from './cleanup';

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
  const row = await ctx.db.get(userId);
  if (!row) throw Error('Membro não encontrado.');
  const generation = (row.sessionGeneration ?? 0) + 1;
  await ctx.db.patch(userId, { sessionGeneration: generation });
  if (await purgeUserSessions(ctx, userId, generation)) {
    await ctx.scheduler.runAfter(0, internal.access.cleanup.purgeRevoked, { userId, generation });
  }
}

export async function initializeSession(
  ctx: MutationCtx,
  userId: Id<'users'>,
  sessionId: Id<'authSessions'>,
) {
  const user = await ctx.db.get(userId);
  if (!user) throw Error('Membro não encontrado.');
  await ctx.db.patch(sessionId, {
    generation: user.sessionGeneration ?? 0,
    authenticatedAt: Date.now(),
  });
}
