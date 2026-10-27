import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { planValidator, assertPlan } from './releases/plan';
import { safeProgress, fastProgress } from './releases/schema';
import { maintenancePaused } from './lib/maintenance';

const systemFields = { _id: v.id('releaseProgress'), _creationTime: v.number() };
async function read(ctx: QueryCtx) {
  return ctx.db
    .query('releaseProgress')
    .withIndex('by_key', (q) => q.eq('key', 'backend'))
    .unique();
}
async function owned(ctx: MutationCtx, owner: string) {
  if (await maintenancePaused(ctx)) throw Error('A manutenção impede a release online.');
  const record = await read(ctx);
  if (!record || record.owner !== owner || 'mode' in record)
    throw Error('A reserva da release mudou ou pertence ao modo fast.');
  return record;
}
// Keep the original status contract for older clients and contract snapshots.
export const status = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({ ...safeProgress.fields, ...systemFields })),
  handler: async (ctx) => {
    const record = await read(ctx);
    return record && !('mode' in record) ? record : null;
  },
});

// The installed backend receipt can belong to either release mode.
export const installed = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ ...safeProgress.fields, ...systemFields }),
    v.object({ ...fastProgress.fields, ...systemFields }),
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
      if ('mode' in previous)
        throw Error('Há uma fast release pendente. Reconcilie a publicação antes de continuar.');
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

export const fastPublished = internalMutation({
  args: {
    commit: v.string(),
    previousBackend: v.string(),
    previousFrontend: v.string(),
    owner: v.string(),
    candidateId: v.string(),
    functionSpecHash: v.string(),
    plan: planValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await maintenancePaused(ctx)) throw Error('A manutenção impede a fast release.');
    if (args.plan.migrations.length)
      throw Error('Migrações exigem a release normal com backup e verificação.');
    for (const sha of [args.commit, args.previousBackend, args.owner])
      if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Identidade de release inválida.');
    if (
      !/^[a-f0-9]{64}$/.test(args.functionSpecHash) ||
      ![args.previousFrontend, args.candidateId].every((id) => /^dpl_[a-zA-Z0-9]+$/.test(id))
    )
      throw Error('Identidade de deployment ou fingerprint inválido.');
    const previous = await read(ctx);
    if (previous && previous.phase !== 'complete')
      throw Error('Há uma release pendente. Reconcilie a publicação antes de continuar.');
    if (previous && previous.commit !== args.previousBackend)
      throw Error('O backend instalado diverge do baseline.');
    const { plan: _, ...identity } = args;
    const next = {
      ...identity,
      key: 'backend' as const,
      mode: 'fast' as const,
      phase: 'published' as const,
      skippedValidations: {
        check: true as const,
        smoke: true as const,
        compatibility: true as const,
        backup: true as const,
      },
      changedAt: Date.now(),
    };
    if (previous) await ctx.db.replace(previous._id, next);
    else await ctx.db.insert('releaseProgress', next);
    return null;
  },
});

export const fastComplete = internalMutation({
  args: { owner: v.string(), candidateId: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner, candidateId }) => {
    if (await maintenancePaused(ctx)) throw Error('A manutenção impede a fast release.');
    const record = await read(ctx);
    if (
      !record ||
      !('mode' in record) ||
      record.owner !== owner ||
      record.candidateId !== candidateId
    )
      throw Error('A reserva ou o candidato da fast release mudou.');
    if (record.phase === 'complete') return null;
    await ctx.db.patch(record._id, { phase: 'complete', changedAt: Date.now() });
    await ctx.db.insert('releaseReceipts', {
      mode: record.mode,
      commit: record.commit,
      owner,
      candidateId,
      functionSpecHash: record.functionSpecHash,
      skippedValidations: record.skippedValidations,
      completedAt: Date.now(),
    });
    return null;
  },
});
