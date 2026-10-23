import { ConvexError, v } from 'convex/values';
import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import { query, mutation, action, internalMutation, internalQuery } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  publicMember,
  memberRole,
  invitationResult,
  createdMember,
  memberInput,
  memberCredentialsInput,
  setupInput,
} from './authContracts';
import type { Member, PublicMember, CreatedMember } from './authContracts';
import { passwordCrypto, validatePassword } from './authCrypto';

type Context = QueryCtx | MutationCtx;
const inviteError =
  'Convite inválido, expirado ou já utilizado. Solicite um novo ao administrador.';
const resetError = 'Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.';

export function institutionalEmail(value: unknown): string {
  if (typeof value !== 'string') throw Error('Use um e-mail @ifpr.edu.br.');
  const email = value.trim().toLowerCase();
  if (email.length > 240 || !/^[^\s@]+@ifpr\.edu\.br$/.test(email))
    throw Error('Use um e-mail @ifpr.edu.br.');
  return email;
}

function storedMember(row: Doc<'users'>): Member {
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
    !['ADMIN', 'CAMPUS'].includes(row.role) ||
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

export async function requireNativeUser(ctx: Context) {
  const id = await getAuthUserId(ctx);
  const sessionId = await getAuthSessionId(ctx);
  if (!id || !sessionId) throw new ConvexError({ status: 401, error: 'Entre com sua conta.' });
  const [row, session] = await Promise.all([ctx.db.get(id), ctx.db.get(sessionId)]);
  const user = memberFromRow(row);
  if (!user || !session || session.userId !== id || session.expirationTime <= Date.now())
    throw new ConvexError({ status: 401, error: 'Entre com sua conta.' });
  return { row: row!, user };
}

async function requireAdmin(ctx: Context) {
  const auth = await requireNativeUser(ctx);
  if (auth.user.role !== 'ADMIN')
    throw new ConvexError({ status: 403, error: 'Acesso exclusivo da administração.' });
  return auth;
}

const origin = () => (process.env.SITE_URL || 'http://127.0.0.1:4183').replace(/\/$/, '');
const randomHex = (length: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

async function digest(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function appendAudit(
  ctx: MutationCtx,
  actorId: Id<'users'>,
  action: string,
  id: Id<'users'>,
) {
  await ctx.db.insert('audit', { at: Date.now(), actorId, action, target: { type: 'user', id } });
}

async function memberById(ctx: Context, id: Id<'users'>) {
  return ctx.db.get(id);
}

async function patchMember(ctx: MutationCtx, row: Doc<'users'>, user: Member) {
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

async function setPassword(ctx: MutationCtx, row: Doc<'users'>, secret: string) {
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

async function revokeSessions(ctx: MutationCtx, userId: Id<'users'>) {
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

async function issueInvite(ctx: MutationCtx, row: Doc<'users'>, actor: Id<'users'>) {
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
  return { inviteUrl: `${origin()}/ativar#token=${token}`, inviteExpiresAt: expiresAt };
}

async function validInvitation(ctx: Context, token: string) {
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

async function validReset(ctx: Context, token: string) {
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
export const assertAdmin = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return null;
  },
});

export const createMember = action({
  args: { data: memberCredentialsInput },
  returns: createdMember,
  handler: async (ctx, { data }): Promise<CreatedMember> => {
    await ctx.runQuery(internal.nativeAuth.assertAdmin, {});
    let secret: string | null = null;
    if ((data.loginMethod || 'local') === 'local') {
      validatePassword(data.password);
      secret = await passwordCrypto.hashSecret(data.password);
    }
    const { password: _password, ...profile } = data;
    return ctx.runMutation(internal.nativeAuth.createMemberRecord, { data: profile, secret });
  },
});

export const createMemberRecord = internalMutation({
  args: { data: memberInput, secret: v.union(v.string(), v.null()) },
  returns: createdMember,
  handler: async (ctx, { data, secret }) => {
    const { user: actor } = await requireAdmin(ctx);
    const email = institutionalEmail(data.email);
    const role = data.role ?? 'CAMPUS';
    const loginMethod = data.loginMethod || 'local';
    if (!['ADMIN', 'CAMPUS'].includes(role)) throw Error('Perfil inválido.');
    if (!['local', 'google', 'invite'].includes(loginMethod))
      throw Error('Forma de acesso inválida.');
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 240)
      throw Error('Campo obrigatório ou texto muito longo.');
    const prior = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .take(2);
    if (prior.length) throw Error('E-mail já cadastrado.');
    if (role === 'CAMPUS') {
      const campusId = data.campusId;
      if (!campusId) throw Error('Campus inválido.');
      const campus = await ctx.db.get(campusId);
      if (!campus || campus.archived) throw Error('Campus inválido.');
    }
    if (loginMethod === 'local' && !secret) throw Error('Informe a senha.');
    const id = await ctx.db.insert('users', {
      name: data.name.trim(),
      email,
      role,
      ...(role === 'CAMPUS' && data.campusId ? { campusId: data.campusId } : {}),
      loginMethod,
      active: loginMethod !== 'invite',
    });
    const row = (await ctx.db.get(id))!;
    const user = storedMember(row);
    if (secret) await setPassword(ctx, row, secret);
    await appendAudit(ctx, actor.id, 'CREATE_USER', user.id);
    if (loginMethod === 'invite')
      return { ...safeMember(user), ...(await issueInvite(ctx, row, actor.id)) };
    return safeMember(user);
  },
});

export const acceptInvitation = action({
  args: { token: v.string(), email: v.string(), password: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    validatePassword(args.password);
    return ctx.runMutation(internal.nativeAuth.consumeInvitation, {
      token: args.token,
      email: institutionalEmail(args.email),
      secret: await passwordCrypto.hashSecret(args.password),
    });
  },
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

export const passwordRecovery = mutation({
  args: { id: v.id('users') },
  returns: v.object({ url: v.string(), expiresAt: v.number(), email: v.string() }),
  handler: async (ctx, { id }) => {
    const { user: actor } = await requireAdmin(ctx);
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
  handler: async (ctx, { token, password }): Promise<{ message: string }> =>
    ctx.runMutation(internal.nativeAuth.consumeReset, {
      token,
      secret: await passwordCrypto.hashSecret(password),
    }),
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
  handler: async () => {
    throw Error(
      'A recuperação por e-mail ainda não está configurada. Entre em contato com dentec.proens@ifpr.edu.br.',
    );
  },
});

export const removeMember = mutation({
  args: { id: v.id('users') },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { id }) => {
    const { user: actor } = await requireAdmin(ctx);
    if (id === actor.id) throw Error('Você não pode excluir seu próprio acesso.');
    const row = await memberById(ctx, id);
    const user = row && storedMember(row);
    if (!row || !user || user.removedAt !== undefined) throw Error('Membro não encontrado.');
    if (user.role === 'ADMIN' && user.active) {
      const rows = await ctx.db
        .query('users')
        .withIndex('by_role_and_active', (q) => q.eq('role', 'ADMIN').eq('active', true))
        .take(2);
      if (rows.filter((r) => memberFromRow(r)).length <= 1)
        throw Error('É necessário manter um administrador ativo.');
    }
    user.active = false;
    user.removedAt = Date.now();
    delete user.inviteExpiresAt;
    await patchMember(ctx, row, user);
    await revokeSessions(ctx, row._id);
    await appendAudit(ctx, actor.id, 'REMOVE_MEMBER', id);
    return { ok: true };
  },
});

export const setup = action({
  args: { data: setupInput },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { data }): Promise<{ ok: boolean }> => {
    const email = institutionalEmail(data.email);
    if (
      !process.env.DENTEC_SETUP_CODE ||
      data.code !== process.env.DENTEC_SETUP_CODE ||
      (process.env.DENTEC_SETUP_EMAIL && email !== process.env.DENTEC_SETUP_EMAIL.toLowerCase())
    )
      throw Error('Código ou e-mail de instalação incorreto.');
    return ctx.runMutation(internal.nativeAuth.setupRecord, {
      email,
      name: data.name,
      secret: await passwordCrypto.hashSecret(data.password),
    });
  },
});

export const setupRecord = internalMutation({
  args: { email: v.string(), name: v.string(), secret: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { email, name, secret }) => {
    if (await ctx.db.query('users').first()) throw Error('Conta ADMIN já criada.');
    if (!name.trim() || name.length > 240) throw Error('Informe seu nome.');
    const id = await ctx.db.insert('users', {
      name: name.trim(),
      email,
      role: 'ADMIN',
      active: true,
      loginMethod: 'local',
    });
    await setPassword(ctx, (await ctx.db.get(id))!, secret);
    await appendAudit(ctx, id, 'CREATE_ADMIN', id);
    return { ok: true };
  },
});

export const authorizedMember = internalQuery({
  args: { id: v.id('users') },
  returns: v.boolean(),
  handler: async (ctx, { id }) => !!memberFromRow(await ctx.db.get(id)),
});
