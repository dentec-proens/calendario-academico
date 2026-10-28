import { assertWritesOpen } from '../lib/maintenance';
import { withActionLease } from '../lib/maintenance';
import { internal } from '../_generated/api';
import { mutation, action, internalMutation } from '../_generated/server';
import type { CreatedMember } from '../authContracts';
import { memberRole, createdMember, memberInput, memberCredentialsInput } from '../authContracts';
import { passwordCrypto, validatePassword } from '../authCrypto';
import {
  institutionalEmail,
  memberFromRow,
  requireRecentAdmin,
  storedMember,
  safeMember,
} from './identity';
import { issueInvite } from './invitations';
import { memberById, revokeSessions, patchMember, appendAudit, setPassword } from './store';
import { v } from 'convex/values';
import { fail } from '../lib/shared';

export const createMember = action({
  args: { data: memberCredentialsInput },
  returns: createdMember,
  handler: async (ctx, { data }): Promise<CreatedMember> => {
    await ctx.runMutation(internal.access.session.assertAdmin, {});
    return withActionLease(ctx, 'access.members.createMember', async () => {
      let secret: string | null = null;
      if ((data.loginMethod || 'local') === 'local') {
        validatePassword(data.password);
        secret = await passwordCrypto.hashSecret(data.password);
      }
      const { password: _password, ...profile } = data;
      return ctx.runMutation(internal.access.members.createMemberRecord, { data: profile, secret });
    });
  },
});

export const createMemberRecord = internalMutation({
  args: { data: memberInput, secret: v.union(v.string(), v.null()) },
  returns: createdMember,
  handler: async (ctx, { data, secret }) => {
    const { user: actor } = await requireRecentAdmin(ctx);
    const email = institutionalEmail(data.email);
    const role = data.role ?? 'CAMPUS';
    const loginMethod = data.loginMethod || 'local';
    if (!['ADMIN', 'CAMPUS', 'PARECERISTA'].includes(role)) throw Error('Perfil inválido.');
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

export const updateMemberRole = mutation({
  args: {
    id: v.id('users'),
    role: memberRole,
    campusId: v.optional(v.union(v.id('campuses'), v.null())),
    expected: v.object({ role: memberRole, campusId: v.union(v.id('campuses'), v.null()) }),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { id, role, campusId, expected }) => {
    await assertWritesOpen(ctx);
    const { user: actor } = await requireRecentAdmin(ctx);
    const row = await memberById(ctx, id);
    if (!row || row.removedAt !== undefined) throw Error('Membro não encontrado.');
    if (row.role !== expected.role || (row.campusId ?? null) !== expected.campusId)
      fail('O perfil mudou em outra sessão. Atualize a lista antes de continuar.', 409);
    const selectedCampus = role === 'CAMPUS' ? (campusId ?? row.campusId) : undefined;
    if (role === 'CAMPUS') {
      const campus = selectedCampus ? await ctx.db.get(selectedCampus) : null;
      if (!campus || campus.archived) throw Error('Selecione um campus ativo.');
    }
    if (row.role === role && row.campusId === selectedCampus) return { ok: true };
    if (row.role === 'ADMIN' && row.active && role !== 'ADMIN') {
      const admins = await ctx.db
        .query('users')
        .withIndex('by_role_and_active', (q) => q.eq('role', 'ADMIN').eq('active', true))
        .take(2);
      if (admins.filter((admin) => memberFromRow(admin)).length <= 1)
        throw Error('É necessário manter um administrador ativo.');
    }
    await ctx.db.patch(id, { role, campusId: selectedCampus });
    await revokeSessions(ctx, id);
    await appendAudit(ctx, actor.id, 'UPDATE_MEMBER_ROLE', id);
    return { ok: true };
  },
});

export const removeMember = mutation({
  args: { id: v.id('users') },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { id }) => {
    await assertWritesOpen(ctx);
    const { user: actor } = await requireRecentAdmin(ctx);
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
