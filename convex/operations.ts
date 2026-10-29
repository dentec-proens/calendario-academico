import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { assertWritesOpen, maintenancePaused } from './lib/maintenance';

const statusValue = v.object({
  emergency: v.boolean(),
  paused: v.boolean(),
  commit: v.union(v.string(), v.null()),
  active: v.array(
    v.object({ id: v.id('operationalLeases'), operation: v.string(), startedAt: v.number() }),
  ),
});

export const availability = query({
  args: {},
  returns: v.object({ maintenance: v.boolean() }),
  handler: async (ctx) => {
    return { maintenance: await maintenancePaused(ctx) };
  },
});

export const begin = internalMutation({
  args: { operation: v.string() },
  returns: v.id('operationalLeases'),
  handler: async (ctx, { operation }): Promise<Id<'operationalLeases'>> => {
    await assertWritesOpen(ctx);
    const actorId = await getAuthUserId(ctx);
    return ctx.db.insert('operationalLeases', {
      operation,
      startedAt: Date.now(),
      ...(actorId ? { actorId } : {}),
    });
  },
});

export const finish = internalMutation({
  args: { id: v.id('operationalLeases') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.delete(id);
    return null;
  },
});

export const pause = internalMutation({
  args: { commit: v.string() },
  returns: v.null(),
  handler: async (ctx, { commit }) => {
    if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Commit de publicação inválido.');
    const control = await ctx.db
      .query('operationalControl')
      .withIndex('by_key', (q) => q.eq('key', 'release'))
      .unique();
    if (control?.paused && control.commit !== commit)
      throw Error('Outra publicação está em andamento. Confira seu estado antes de continuar.');
    const value = { key: 'release' as const, paused: true, commit, changedAt: Date.now() };
    if (control) await ctx.db.replace(control._id, value);
    else await ctx.db.insert('operationalControl', value);
    return null;
  },
});

export const status = internalQuery({
  args: {},
  returns: statusValue,
  handler: async (ctx) => {
    const control = await ctx.db
      .query('operationalControl')
      .withIndex('by_key', (q) => q.eq('key', 'release'))
      .unique();
    const active = await ctx.db.query('operationalLeases').withIndex('by_startedAt').take(1001);
    if (active.length > 1000) throw Error('Não é possível comprovar a drenagem das operações.');
    return {
      emergency: process.env.DENTEC_MAINTENANCE === '1',
      paused: control?.paused === true,
      commit: control?.commit ?? null,
      active: active.map(({ _id, operation, startedAt }) => ({ id: _id, operation, startedAt })),
    };
  },
});

export const resume = internalMutation({
  args: { commit: v.string() },
  returns: v.null(),
  handler: async (ctx, { commit }) => {
    if (process.env.DENTEC_MAINTENANCE === '1')
      throw Error('Remova o bloqueio emergencial DENTEC_MAINTENANCE antes de liberar o acesso.');
    const control = await ctx.db
      .query('operationalControl')
      .withIndex('by_key', (q) => q.eq('key', 'release'))
      .unique();
    if (!control?.paused || control.commit !== commit)
      throw Error('A manutenção não pertence a esta publicação.');
    if (await ctx.db.query('operationalLeases').withIndex('by_startedAt').first())
      throw Error('Há operações em andamento. A manutenção permanece ativa.');
    await ctx.db.patch(control._id, { paused: false, changedAt: Date.now() });
    return null;
  },
});
