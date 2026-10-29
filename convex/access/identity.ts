import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Member, PublicMember } from './contracts';
import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

export type Context = QueryCtx | MutationCtx;

export function institutionalEmail(value: unknown): string {
  if (typeof value !== 'string') throw Error('Use um e-mail @ifpr.edu.br.');
  const email = value.trim().toLowerCase();
  if (email.length > 240 || !/^[^\s@]+@ifpr\.edu\.br$/.test(email))
    throw Error('Use um e-mail @ifpr.edu.br.');
  return email;
}

export function storedMember(row: Doc<'users'>): Member {
  return {
    id: row._id,
    name: row.name!,
    email: row.email!,
    role: row.role,
    campusId: row.campusId ?? null,
    active: row.active,
    loginMethod: row.loginMethod,
    inviteExpiresAt: row.inviteExpiresAt,
    removedAt: row.removedAt,
    nativeInviteHash: row.nativeInviteHash,
    nativeResetHash: row.nativeResetHash,
    googleSubject: row.googleSubject,
    googleLastLoginAt: row.googleLastLoginAt,
  };
}

export function memberFromRow(row: Doc<'users'> | null): Member | null {
  if (
    !row ||
    typeof row.name !== 'string' ||
    typeof row.email !== 'string' ||
    !/^[^\s@]+@ifpr\.edu\.br$/.test(row.email) ||
    !['ADMIN', 'CAMPUS', 'PARECERISTA'].includes(row.role) ||
    (row.role === 'CAMPUS' && !row.campusId) ||
    row.active !== true ||
    row.removedAt !== undefined
  )
    return null;
  return storedMember(row);
}

export function safeMember(user: Member): PublicMember {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    campusId: user.campusId ?? null,
    active: !!user.active,
    inviteExpiresAt: user.inviteExpiresAt ?? null,
    loginMethod: user.loginMethod || 'local',
  };
}

export async function assertUserSession(
  ctx: Context,
  id: Id<'users'>,
  sessionId: Id<'authSessions'>,
) {
  const [row, session] = await Promise.all([ctx.db.get(id), ctx.db.get(sessionId)]);
  const user = memberFromRow(row);
  if (
    !user ||
    !session ||
    session.userId !== id ||
    session.expirationTime <= Date.now() ||
    (session.generation ?? 0) !== (row!.sessionGeneration ?? 0)
  )
    throw new ConvexError({ status: 401, error: 'Entre com sua conta.' });
  return { row: row!, user, session };
}

export async function requireNativeUser(ctx: Context) {
  const id = await getAuthUserId(ctx);
  const sessionId = await getAuthSessionId(ctx);
  if (!id || !sessionId) throw new ConvexError({ status: 401, error: 'Entre com sua conta.' });
  return assertUserSession(ctx, id, sessionId);
}

export async function requireAdmin(ctx: Context) {
  const auth = await requireNativeUser(ctx);
  if (auth.user.role !== 'ADMIN')
    throw new ConvexError({ status: 403, error: 'Acesso exclusivo da administração.' });
  return auth;
}

export async function requireRecentAdmin(ctx: MutationCtx) {
  const auth = await requireAdmin(ctx);
  if (Date.now() - (auth.session.authenticatedAt ?? auth.session._creationTime) > 15 * 60_000) {
    throw new ConvexError({
      status: 403,
      error: 'Esta operação exige autenticação recente. Saia e entre novamente antes de continuar.',
    });
  }
  return auth;
}
