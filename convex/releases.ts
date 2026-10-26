import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { planValidator, assertPlan } from './releases/plan';
import { releaseTables } from './releases/schema';
import { maintenancePaused } from './lib/maintenance';

const receipt = releaseTables.releaseProgress.validator;
async function read(ctx: QueryCtx) {
  return ctx.db
    .query('releaseProgress')
    .withIndex('by_key', (q) => q.eq('key', 'backend'))
    .unique();
}
async function owned(ctx: MutationCtx, owner: string) {
  if (await maintenancePaused(ctx)) throw Error('A manutenção impede a release online.');
  const record = await read(ctx);
  if (!record || record.owner !== owner) throw Error('A reserva da release mudou.');
  return record;
}
export const status = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ ...receipt.fields, _id: v.id('releaseProgress'), _creationTime: v.number() }),
  ),
  handler: read,
});

export const begin = internalMutation({
  args: {
    commit: v.string(),
    previousBackend: v.string(),
    previousFrontend: v.string(),
    owner: v.string(),
    previousOwner: v.optional(v.string()),
    contractHash: v.string(),
    planHash: v.string(),
    plan: planValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await maintenancePaused(ctx)) throw Error('A manutenção impede a release online.');
    assertPlan(args.plan);
    for (const sha of [args.commit, args.previousBackend, args.owner])
      if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Identidade de release inválida.');
    if (!/^dpl_[a-zA-Z0-9]+$/.test(args.previousFrontend))
      throw Error('Deployment anterior inválido.');
    if (
      !/^[a-f0-9]{64}$/.test(args.contractHash) ||
      !/^[a-f0-9]{64}$/.test(args.planHash) ||
      args.plan.baseline !== args.previousBackend
    )
      throw Error('Fingerprint de release inválido.');
    for (const definition of args.plan.migrations) {
      const previousDefinition = await ctx.db
        .query('releaseMigrationDefinitions')
        .withIndex('by_migrationId', (q) => q.eq('id', definition.id))
        .unique();
      if (previousDefinition) {
        const old = previousDefinition.definition;
        const sameSource =
          old.source.kind === definition.source.kind &&
          (old.source.kind === 'copy' && definition.source.kind === 'copy'
            ? old.source.field === definition.source.field
            : old.source.kind === 'literal' &&
              definition.source.kind === 'literal' &&
              old.source.value === definition.source.value);
        if (old.table !== definition.table || old.field !== definition.field || !sameSource)
          throw Error('Uma identidade de migração já publicada não pode mudar de definição.');
      } else await ctx.db.insert('releaseMigrationDefinitions', { id: definition.id, definition });
    }
    const previous = await read(ctx);
    if (previous && previous.phase !== 'complete') {
      if (
        previous.commit !== args.commit ||
        previous.planHash !== args.planHash ||
        previous.contractHash !== args.contractHash ||
        previous.previousFrontend !== args.previousFrontend ||
        previous.owner !== args.previousOwner
      )
        throw Error('A expansão pendente exige retomar o mesmo código, plano e proprietário.');
      await ctx.db.patch(previous._id, {
        owner: args.owner,
        phase: 'expanded',
        migrations:
          previous.phase === 'validated'
            ? previous.migrations.map((item) => ({ ...item, verifyCursor: null, verified: false }))
            : previous.migrations,
        changedAt: Date.now(),
      });
      return null;
    }
    if (previous && previous.commit !== args.previousBackend)
      throw Error('O backend instalado diverge do baseline.');
    const { previousOwner: _, ...value } = args;
    const next = {
      ...value,
      key: 'backend' as const,
      phase: 'expanded' as const,
      migrations: args.plan.migrations.map((item) => ({
        id: item.id,
        cursor: null,
        done: false,
        count: 0,
        verifyCursor: null,
        verified: false,
      })),
      changedAt: Date.now(),
    };
    if (previous) await ctx.db.replace(previous._id, next);
    else await ctx.db.insert('releaseProgress', next);
    return null;
  },
});

export const batch = internalMutation({
  args: { owner: v.string(), id: v.string(), verify: v.boolean() },
  returns: v.object({ done: v.boolean(), count: v.number() }),
  handler: async (ctx, { owner, id, verify }) => {
    const record = await owned(ctx, owner);
    if (record.phase !== 'expanded') throw Error('A fase da release não admite migração.');
    const definition = record.plan.migrations.find((item) => item.id === id);
    const index = record.migrations.findIndex((item) => item.id === id);
    if (!definition || index < 0) throw Error('Migração ausente do plano conferido.');
    const progress = record.migrations[index]!;
    if (verify && !progress.done) throw Error('Conclua os lotes antes de verificar.');
    if (verify ? progress.verified : progress.done) return { done: true, count: progress.count };
    const page = await ctx.db
      .query(definition.table)
      .paginate({ numItems: 50, cursor: verify ? progress.verifyCursor : progress.cursor });
    let count = 0;
    for (const doc of page.page) {
      if (Object.hasOwn(doc, definition.field)) continue;
      if (verify) throw Error('A migração ainda possui registros sem o campo aditivo.');
      const value: unknown =
        definition.source.kind === 'literal'
          ? definition.source.value
          : Reflect.get(doc, definition.source.field);
      if (value === undefined)
        throw Error('O campo de origem não existe. Nenhuma alteração do lote foi gravada.');
      // Only missing top-level fields are filled. IDs, existing fields and
      // sessions cannot be rewritten; Convex validates the result atomically.
      await ctx.db.patch(doc._id, { [definition.field]: value });
      count++;
    }
    const migrations = [...record.migrations];
    migrations[index] = verify
      ? { ...progress, verifyCursor: page.continueCursor, verified: page.isDone }
      : {
          ...progress,
          cursor: page.continueCursor,
          done: page.isDone,
          count: progress.count + count,
        };
    await ctx.db.patch(record._id, { migrations, changedAt: Date.now() });
    return { done: page.isDone, count: progress.count + count };
  },
});
export const validated = internalMutation({
  args: { owner: v.string(), candidateId: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner, candidateId }) => {
    const record = await owned(ctx, owner);
    if (
      record.phase === 'complete' ||
      !record.migrations.every((item) => item.done && item.verified) ||
      !candidateId.startsWith('dpl_')
    )
      throw Error('Migrações ou candidato não conferidos.');
    await ctx.db.patch(record._id, { phase: 'validated', candidateId, changedAt: Date.now() });
    return null;
  },
});
export const complete = internalMutation({
  args: { owner: v.string(), candidateId: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner, candidateId }) => {
    const record = await owned(ctx, owner);
    if (record.phase !== 'validated' || record.candidateId !== candidateId)
      throw Error('O candidato não corresponde à validação.');
    await ctx.db.patch(record._id, { phase: 'complete', changedAt: Date.now() });
    await ctx.db.insert('releaseReceipts', {
      commit: record.commit,
      owner,
      contractHash: record.contractHash,
      planHash: record.planHash,
      candidateId,
      completedAt: Date.now(),
    });
    return null;
  },
});
