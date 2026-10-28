import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import schema from '../schema';
import { environments } from '../../config/environments';
import { withoutManualSources } from '../../src/manual-sources';
import { presencePolicyDigest } from './presenceLifecycle';
import { assertReceipt, fingerprint, hexDigest } from './manualSourceProtocol';

const entry = v.object({
  id: v.string(),
  before: v.string(),
  after: v.string(),
  removed: v.number(),
});
const identity = {
  planDigest: v.string(),
  presencePolicyDigest: v.string(),
  backupSha256: v.string(),
  schemaDigest: v.string(),
  projectionDigest: v.union(v.string(), v.null()),
  commit: v.string(),
};
const receipt = v.object({
  ...identity,
  format: v.literal(1),
  operation: v.literal('manual-sources'),
  mode: v.union(v.literal('rehearsal'), v.literal('production')),
  deploymentUrl: v.string(),
  verifiedSnapshotSha256: v.string(),
  removed: v.number(),
  result: v.literal('verified'),
  presenceReportDigest: v.string(),
  digest: v.string(),
});

/** CLI verifies the same maintenance window before taking an export or advancing its journal. */
export const preflight = internalQuery({
  args: {},
  returns: v.object({
    url: v.union(v.string(), v.null()),
    schemaDigest: v.string(),
    paused: v.boolean(),
    commit: v.union(v.string(), v.null()),
    smoke: v.boolean(),
    drained: v.boolean(),
  }),
  handler: async (ctx) => {
    const control = await ctx.db
      .query('operationalControl')
      .withIndex('by_key', (q) => q.eq('key', 'release'))
      .unique();
    return {
      url: process.env.CONVEX_CLOUD_URL ?? null,
      schemaDigest: fingerprint(JSON.parse((schema as unknown as { export(): string }).export())),
      paused: control?.paused === true,
      commit: control?.commit ?? null,
      smoke: control?.smokeUserId !== undefined,
      drained: !(await ctx.db.query('operationalLeases').withIndex('by_startedAt').take(1)).length,
    };
  },
});

/** Native, bounded cleanup. No generic document replacement or temporary permissive backend. */
export const applyBatch = internalMutation({
  args: {
    ...identity,
    table: v.union(v.literal('calendarContents'), v.literal('calendarSnapshots')),
    entries: v.array(entry),
    batchDigest: v.string(),
    mode: v.union(v.literal('rehearsal'), v.literal('production')),
    rehearsal: v.optional(receipt),
  },
  returns: v.object({
    changed: v.number(),
    removed: v.number(),
    replayed: v.number(),
    batchDigest: v.string(),
  }),
  handler: async (ctx, args) => {
    if (
      !/^[a-f0-9]{40}$/.test(args.commit) ||
      !hexDigest(args.planDigest) ||
      args.presencePolicyDigest !== presencePolicyDigest ||
      !hexDigest(args.backupSha256) ||
      !hexDigest(args.schemaDigest) ||
      (args.projectionDigest !== null && !hexDigest(args.projectionDigest)) ||
      !args.entries.length ||
      args.entries.length > 10 ||
      fingerprint({ table: args.table, entries: args.entries }) !== args.batchDigest
    )
      throw Error('Identidade ou lote de limpeza inválido.');
    const deployedSchema = JSON.parse((schema as unknown as { export(): string }).export());
    if (fingerprint(deployedSchema) !== args.schemaDigest)
      throw Error('O schema instalado diverge do schema ensaiado.');
    const url = process.env.CONVEX_CLOUD_URL;
    if (!url) throw Error('Não foi possível identificar o deployment da limpeza.');
    const production = url === environments.production.url;
    if (
      args.mode === 'rehearsal' &&
      (production || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))
    )
      throw Error('O ensaio exige backend local descartável explicitamente identificado.');
    if ((args.mode === 'production') !== production)
      throw Error('O modo de aplicação diverge do deployment.');
    if (production) {
      if (!args.rehearsal || !args.projectionDigest)
        throw Error('Produção exige ensaio e equivalência de contagens e prazos deste plano.');
      assertReceipt(args.rehearsal, {
        planDigest: args.planDigest,
        presencePolicyDigest: args.presencePolicyDigest,
        backupSha256: args.backupSha256,
        schemaDigest: args.schemaDigest,
        projectionDigest: args.projectionDigest,
        commit: args.commit,
      });
      if (
        args.rehearsal.mode !== 'rehearsal' ||
        args.rehearsal.deploymentUrl === url ||
        !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(args.rehearsal.deploymentUrl)
      )
        throw Error('O recibo deve pertencer ao ensaio local descartável deste plano.');
    }
    const control = await ctx.db
      .query('operationalControl')
      .withIndex('by_key', (q) => q.eq('key', 'release'))
      .unique();
    if (!control?.paused || control.commit !== args.commit || control.smokeUserId)
      throw Error('A limpeza exige manutenção exclusiva do commit conferido, sem acesso de smoke.');
    if ((await ctx.db.query('operationalLeases').withIndex('by_startedAt').take(1)).length)
      throw Error('Aguarde a drenagem das operações antes da limpeza.');
    let changed = 0,
      removed = 0,
      replayed = 0;
    const ids = new Set<string>();
    for (const item of args.entries) {
      if (
        ids.has(item.id) ||
        !hexDigest(item.before) ||
        !hexDigest(item.after) ||
        item.before === item.after ||
        !Number.isSafeInteger(item.removed) ||
        item.removed < 1
      )
        throw Error('Documento duplicado ou transformação inválida.');
      ids.add(item.id);
      const id = ctx.db.normalizeId(args.table, item.id);
      if (!id) throw Error('ID fora da tabela conferida.');
      const row = await ctx.db.get(id);
      if (!row) throw Error('Documento da origem não encontrado.');
      const current = fingerprint(row);
      if (current === item.after) {
        replayed++;
        continue;
      }
      if (current !== item.before)
        throw Error(
          'Documento mudou depois do backup. Preserve a manutenção e reconcilie o plano.',
        );
      const result = withoutManualSources(row.state);
      if (
        result.removed !== item.removed ||
        fingerprint({ ...row, state: result.state }) !== item.after
      )
        throw Error('A remoção prevista não corresponde aos seis caminhos autorizados.');
      await ctx.db.patch(row._id, { state: result.state });
      changed++;
      removed += result.removed;
    }
    if (changed)
      await ctx.db.insert('audit', {
        at: Date.now(),
        action: 'manual-sources-removed',
        target: { type: 'archived', reference: 'manual-source-cleanup' },
        details: JSON.stringify({
          planDigest: args.planDigest,
          presencePolicyDigest: args.presencePolicyDigest,
          backupSha256: args.backupSha256,
          schemaDigest: args.schemaDigest,
          projectionDigest: args.projectionDigest,
          commit: args.commit,
          rehearsalDigest: args.rehearsal?.digest ?? null,
          table: args.table,
          batchDigest: args.batchDigest,
          changed,
          removed,
        }),
      });
    return { changed, removed, replayed, batchDigest: args.batchDigest };
  },
});
