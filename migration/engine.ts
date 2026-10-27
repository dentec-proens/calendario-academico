/** Temporary migration backend. Never copy this module into the application. */
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

const operation = v.union(
  v.object({
    kind: v.literal('replace'),
    table: v.string(),
    id: v.string(),
    document: v.any(),
  }),
  v.object({ kind: v.literal('insert'), table: v.string(), document: v.any() }),
  v.object({ kind: v.literal('delete'), table: v.string(), id: v.string() }),
);

// Only the administrator CLI may invoke these internal functions. A staged
// migration removes the public application functions, closing the write window.
export const status = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => ctx.db.query('migrationState').first(),
});

export const apply = internalMutation({
  args: {
    purpose: v.optional(v.literal('retire-previous-calendars')),
    planDigest: v.string(),
    batchDigest: v.string(),
    batch: v.number(),
    totalBatches: v.number(),
    sourceDigest: v.string(),
    operations: v.array(operation),
  },
  returns: v.object({ nextBatch: v.number(), done: v.boolean(), replay: v.boolean() }),
  handler: async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.batch) ||
      !Number.isSafeInteger(args.totalBatches) ||
      args.batch < 0 ||
      args.batch >= args.totalBatches ||
      args.operations.length > 250
    )
      throw Error('Lote de migração inválido.');
    const prior = await ctx.db.query('migrationState').first();
    if (
      prior &&
      (prior.planDigest !== args.planDigest ||
        prior.sourceDigest !== args.sourceDigest ||
        prior.totalBatches !== args.totalBatches)
    )
      throw Error('O deployment já iniciou outro plano. Restaure o backup antes de substituir.');
    if (prior && prior.nextBatch === args.batch + 1 && prior.lastBatchDigest === args.batchDigest)
      return {
        nextBatch: prior.nextBatch,
        done: prior.nextBatch === args.totalBatches,
        replay: true,
      };
    if ((prior?.nextBatch ?? 0) !== args.batch)
      throw Error('Lote fora de ordem. Consulte o checkpoint antes de continuar.');
    for (const op of args.operations) {
      if (
        op.table === '_storage' &&
        op.kind === 'delete' &&
        args.purpose === 'retire-previous-calendars'
      ) {
        const id = ctx.db.system.normalizeId('_storage', op.id);
        if (!id) throw Error('ID de Storage inválido.');
        if (await ctx.db.system.get(id)) await ctx.storage.delete(id);
        continue;
      }
      if (op.table.startsWith('_') || op.table.startsWith('auth') || op.table === 'migrationState')
        throw Error('Tabela protegida: a migração preserva Auth e Storage sem alterações.');
      if (op.kind === 'insert') {
        if (!op.document || typeof op.document !== 'object' || Array.isArray(op.document))
          throw Error('Documento inválido.');
        await ctx.db.insert(op.table, op.document);
      } else {
        const id = ctx.db.normalizeId(op.table, op.id);
        if (!id) throw Error('ID não pertence à tabela esperada.');
        if (!(await ctx.db.get(id))) throw Error('Registro de origem ausente. Restaure o backup.');
        if (op.kind === 'delete') await ctx.db.delete(id);
        else await ctx.db.replace(id, op.document);
      }
    }
    const checkpoint = {
      planDigest: args.planDigest,
      sourceDigest: args.sourceDigest,
      totalBatches: args.totalBatches,
      nextBatch: args.batch + 1,
      lastBatchDigest: args.batchDigest,
      updatedAt: Date.now(),
    };
    if (prior) await ctx.db.replace(prior._id, checkpoint);
    else await ctx.db.insert('migrationState', checkpoint);
    return {
      nextBatch: checkpoint.nextBatch,
      done: checkpoint.nextBatch === args.totalBatches,
      replay: false,
    };
  },
});

export const recordVerification = internalMutation({
  args: {
    planDigest: v.string(),
    sourceDigest: v.string(),
    snapshotDigest: v.string(),
    schemaDigest: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db.query('migrationState').first();
    if (
      !checkpoint ||
      checkpoint.planDigest !== args.planDigest ||
      checkpoint.sourceDigest !== args.sourceDigest ||
      checkpoint.nextBatch !== checkpoint.totalBatches
    )
      throw Error('A verificação exige o plano completo neste deployment.');
    await ctx.db.patch(checkpoint._id, {
      verifiedSnapshotDigest: args.snapshotDigest,
      verifiedSchemaDigest: args.schemaDigest,
      verifiedAt: Date.now(),
    });
    return null;
  },
});

export const finish = internalMutation({
  args: {
    planDigest: v.string(),
    sourceDigest: v.string(),
    snapshotDigest: v.string(),
    schemaDigest: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db.query('migrationState').first();
    if (!checkpoint) return null;
    if (
      checkpoint.planDigest !== args.planDigest ||
      checkpoint.sourceDigest !== args.sourceDigest ||
      checkpoint.nextBatch !== checkpoint.totalBatches
    )
      throw Error('O checkpoint não pertence a um plano completamente aplicado.');
    if (
      checkpoint.verifiedSnapshotDigest !== args.snapshotDigest ||
      checkpoint.verifiedSchemaDigest !== args.schemaDigest
    )
      throw Error('O recibo não corresponde à verificação registrada neste deployment.');
    await ctx.db.delete(checkpoint._id);
    return null;
  },
});
