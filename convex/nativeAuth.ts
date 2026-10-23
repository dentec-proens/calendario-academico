import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import { query, mutation, action, internalMutation, internalQuery } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';
import { affectedScopes } from './model';
import type { EntityTable } from './model';
import { legacySecret, passwordCrypto, validatePassword } from './authCrypto';

type Context = QueryCtx | MutationCtx;
const maxMembers = 1000;
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

export function memberFromRow(row: any) {
  if (!row?.value) return null;
  const user = decodeValue(row.value);
  return user &&
    typeof user.id === 'string' &&
    row.appId === user.id &&
    typeof user.email === 'string' &&
    row.email === user.email &&
    /^[^\s@]+@ifpr\.edu\.br$/.test(user.email) &&
    ['ADMIN', 'CAMPUS'].includes(user.role) &&
    user.active &&
    !user.removedAt
    ? user
    : null;
}

export function safeMember(user: any) {
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
  if (!id || !sessionId) throw Error('Entre com sua conta.');
  const [row, session] = await Promise.all([ctx.db.get(id), ctx.db.get(sessionId)]);
  const user = memberFromRow(row);
  if (!user || !session || session.userId !== id || session.expirationTime <= Date.now())
    throw Error('Entre com sua conta.');
  return { row: row!, user };
}

async function requireAdmin(ctx: Context) {
  const auth = await requireNativeUser(ctx);
  if (auth.user.role !== 'ADMIN') throw Error('Acesso exclusivo da administração.');
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

async function touchCollection(ctx: MutationCtx, field: EntityTable, item: any, delta = 0) {
  const root = await ctx.db
    .query('rootFields')
    .withIndex('by_name', (q) => q.eq('name', field))
    .unique();
  if (root && root.count !== undefined) await ctx.db.patch(root._id, { count: root.count + delta });
  if (!root) await ctx.db.insert('rootFields', { name: field, count: delta });
  for (const key of [
    ...affectedScopes(field, item),
    ...(!root ? ['roots:index', `${field}:presence`] : []),
  ]) {
    const scope = await ctx.db
      .query('scopeVersions')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (scope) await ctx.db.patch(scope._id, { revision: scope.revision + 1 });
    else await ctx.db.insert('scopeVersions', { key, revision: 1 });
  }
}

async function appendAudit(ctx: MutationCtx, actor: string, action: string, id: string) {
  const value = { at: new Date().toISOString(), actor, action, id };
  const last = await ctx.db.query('audit').withIndex('by_position').order('desc').first();
  await ctx.db.insert('audit', {
    key: `audit:${crypto.randomUUID()}`,
    position: (last?.position ?? -1) + 1,
    value: encodeValue(value),
  });
  await touchCollection(ctx, 'audit', value, 1);
}

async function memberByAppId(ctx: Context, id: string) {
  return ctx.db
    .query('users')
    .withIndex('by_appId', (q) => q.eq('appId', id))
    .unique();
}

async function patchMember(ctx: MutationCtx, row: any, user: any) {
  await ctx.db.patch(row._id, {
    value: encodeValue(user),
    email: user.email,
    name: user.name,
    campusId: user.campusId ?? undefined,
  });
  await touchCollection(ctx, 'users', user);
}

async function setPassword(ctx: MutationCtx, row: any, secret: string) {
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

async function revokeSessions(ctx: MutationCtx, userId: any) {
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

async function issueInvite(ctx: MutationCtx, row: any, actor: string) {
  const user = decodeValue(row.value);
  if (user.removedAt || user.active || user.loginMethod !== 'invite') throw Error(inviteError);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const tokenHash = await digest(token);
  const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
  const last = await ctx.db.query('invitations').withIndex('by_position').order('desc').first();
  await ctx.db.insert('invitations', {
    key: `invitations:${tokenHash}`,
    position: (last?.position ?? -1) + 1,
    // Existing invitations are logically invalidated by this unique hash on
    // the member. Imported invitations without it remain valid until expiry.
    value: encodeValue({
      tokenHash,
      userId: user.id,
      expiresAt,
      createdBy: actor,
      createdAt: Date.now(),
      revoked: false,
    }),
  });
  await touchCollection(ctx, 'invitations', { tokenHash, userId: user.id }, 1);
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
    .withIndex('by_key', (q) => q.eq('key', `invitations:${hash}`))
    .unique();
  const invite = inviteRow && decodeValue(inviteRow.value);
  const row = invite && (await memberByAppId(ctx, invite.userId));
  const user = row && decodeValue(row.value);
  if (
    !row ||
    !user ||
    !invite ||
    invite.usedAt ||
    invite.revoked ||
    invite.expiresAt <= Date.now() ||
    user.active ||
    user.removedAt ||
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
    .withIndex('by_key', (q) => q.eq('key', `passwordResets:${hash}`))
    .unique();
  const reset = resetRow && decodeValue(resetRow.value);
  const row = reset && (await memberByAppId(ctx, reset.userId));
  const user = row && memberFromRow(row);
  if (
    !reset ||
    !row ||
    !user ||
    reset.usedAt ||
    reset.expires <= Date.now() ||
    user.loginMethod === 'google' ||
    (user.nativeResetHash && user.nativeResetHash !== hash)
  )
    throw Error(resetError);
  return { row, user, resetRow: resetRow!, reset };
}

export const me = query({
  args: {},
  returns: v.any(),
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
  returns: v.any(),
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
      setupRequired: !(await ctx.db.query('users').withIndex('by_position').first()),
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
  returns: v.any(),
  handler: async (ctx, { token }) => {
    const { user, invite } = await validInvitation(ctx, token);
    const campus =
      user.campusId &&
      (await ctx.db
        .query('campuses')
        .withIndex('by_appId', (q) => q.eq('appId', user.campusId))
        .unique());
    return {
      name: user.name,
      email: user.email,
      role: user.role,
      campus: campus ? decodeValue(campus.value).name : null,
      expiresAt: invite.expiresAt,
    };
  },
});

export const issueInvitation = mutation({
  args: { id: v.string() },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    const { user } = await requireAdmin(ctx);
    const row = await memberByAppId(ctx, id);
    if (!row) throw Error('Membro não encontrado.');
    const result = await issueInvite(ctx, row, user.id);
    await appendAudit(ctx, user.id, 'REISSUE_INVITATION', id);
    return result;
  },
});

export const createMember = action({
  args: { data: v.any() },
  returns: v.any(),
  handler: async (ctx, { data }): Promise<any> => {
    const secret =
      (data.loginMethod || 'local') === 'local'
        ? await passwordCrypto.hashSecret(data.password)
        : null;
    const { password: _password, ...profile } = data;
    return ctx.runMutation(internal.nativeAuth.createMemberRecord, { data: profile, secret });
  },
});

export const createMemberRecord = internalMutation({
  args: { data: v.any(), secret: v.union(v.string(), v.null()) },
  returns: v.any(),
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
      const campus = await ctx.db
        .query('campuses')
        .withIndex('by_appId', (q) => q.eq('appId', data.campusId))
        .unique();
      if (!campus || decodeValue(campus.value).archived) throw Error('Campus inválido.');
    }
    if (loginMethod === 'local' && !secret) throw Error('Informe a senha.');
    const user = {
      id: crypto.randomUUID(),
      name: data.name.trim(),
      email,
      role,
      campusId: role === 'ADMIN' ? null : data.campusId,
      loginMethod,
      active: loginMethod !== 'invite',
    };
    const last = await ctx.db.query('users').withIndex('by_position').order('desc').first();
    const id = await ctx.db.insert('users', {
      key: `users:${user.id}`,
      position: (last?.position ?? -1) + 1,
      appId: user.id,
      email,
      name: user.name,
      ...(user.campusId ? { campusId: user.campusId } : {}),
      value: encodeValue(user),
    });
    await touchCollection(ctx, 'users', user, 1);
    const row = (await ctx.db.get(id))!;
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
    const { row, user, inviteRow, invite } = await validInvitation(ctx, token);
    if (user.email !== email) throw Error(inviteError);
    await setPassword(ctx, row, secret);
    user.active = true;
    user.loginMethod = 'local';
    delete user.inviteExpiresAt;
    delete user.nativeInviteHash;
    delete user.hash;
    delete user.salt;
    await patchMember(ctx, row, user);
    await ctx.db.patch(inviteRow._id, { value: encodeValue({ ...invite, usedAt: Date.now() }) });
    await touchCollection(ctx, 'invitations', invite);
    await appendAudit(ctx, user.id, 'ACCEPT_INVITATION', user.id);
    return { ok: true };
  },
});

export const passwordRecovery = mutation({
  args: { id: v.string() },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    const { user: actor } = await requireAdmin(ctx);
    const row = await memberByAppId(ctx, id);
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
    const last = await ctx.db
      .query('passwordResets')
      .withIndex('by_position')
      .order('desc')
      .first();
    await ctx.db.insert('passwordResets', {
      key: `passwordResets:${hash}`,
      position: (last?.position ?? -1) + 1,
      value: encodeValue({ hash, userId: user.id, expires: expiresAt }),
    });
    await touchCollection(ctx, 'passwordResets', { hash, userId: user.id }, 1);
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
    const { row, user, resetRow, reset } = await validReset(ctx, token);
    await setPassword(ctx, row, secret);
    user.nativeResetHash = 'used';
    delete user.hash;
    delete user.salt;
    await patchMember(ctx, row, user);
    await ctx.db.patch(resetRow._id, { value: encodeValue({ ...reset, usedAt: Date.now() }) });
    await touchCollection(ctx, 'passwordResets', reset);
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
  args: { id: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { id }) => {
    const { user: actor } = await requireAdmin(ctx);
    if (id === actor.id) throw Error('Você não pode excluir seu próprio acesso.');
    const row = await memberByAppId(ctx, id);
    const user = row && decodeValue(row.value);
    if (!row || !user || user.removedAt) throw Error('Membro não encontrado.');
    if (user.role === 'ADMIN' && user.active) {
      const rows = await ctx.db
        .query('users')
        .withIndex('by_position')
        .take(maxMembers + 1);
      if (rows.length > maxMembers) throw Error('Limite de membros excedido.');
      if (rows.filter((r) => memberFromRow(r)?.role === 'ADMIN').length <= 1)
        throw Error('É necessário manter um administrador ativo.');
    }
    user.active = false;
    user.removedAt = new Date().toISOString();
    delete user.inviteExpiresAt;
    await patchMember(ctx, row, user);
    await revokeSessions(ctx, row._id);
    await appendAudit(ctx, actor.id, 'REMOVE_MEMBER', id);
    return { ok: true };
  },
});

export const setup = action({
  args: { data: v.any() },
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
    if (await ctx.db.query('users').withIndex('by_position').first())
      throw Error('Conta ADMIN já criada.');
    if (!name.trim() || name.length > 240) throw Error('Informe seu nome.');
    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email,
      role: 'ADMIN',
      campusId: null,
      active: true,
      loginMethod: 'local',
    };
    const id = await ctx.db.insert('users', {
      key: `users:${user.id}`,
      position: 0,
      appId: user.id,
      email,
      name: user.name,
      value: encodeValue(user),
    });
    await touchCollection(ctx, 'users', user, 1);
    await setPassword(ctx, (await ctx.db.get(id))!, secret);
    await appendAudit(ctx, user.id, 'CREATE_ADMIN', email);
    return { ok: true };
  },
});

// Admin-only, internal migration entry point. Never exposes hashes to browsers.
export const initializeImportedAccounts = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query('users')
      .withIndex('by_position')
      .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 100) });
    let imported = 0,
      skipped = 0;
    for (const row of page.page) {
      const user = decodeValue(row.value);
      const member = memberFromRow(row);
      if (member && user.hash && user.salt && user.loginMethod !== 'google') {
        const account = await ctx.db
          .query('authAccounts')
          .withIndex('userIdAndProvider', (q) => q.eq('userId', row._id).eq('provider', 'password'))
          .unique();
        if (!account) {
          await setPassword(ctx, row, legacySecret(user.salt, user.hash));
          imported++;
        } else skipped++;
      } else skipped++;
      if (user.hash || user.salt) {
        delete user.hash;
        delete user.salt;
        await patchMember(ctx, row, user);
      }
    }
    return { imported, skipped, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

export const authorizedMember = internalQuery({
  args: { id: v.id('users') },
  returns: v.boolean(),
  handler: async (ctx, { id }) => !!memberFromRow(await ctx.db.get(id)),
});
