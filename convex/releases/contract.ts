import { v } from 'convex/values';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { internalMutation, internalQuery } from '../_generated/server';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import schema from '../schema';
import { contractProgress } from './schema';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const schemaDigest = () =>
  bytesToHex(
    sha256(
      new TextEncoder().encode(
        canonical(JSON.parse((schema as unknown as { export(): string }).export())),
      ),
    ),
  );
const read = (ctx: QueryCtx) =>
  ctx.db
    .query('releaseProgress')
    .withIndex('by_key', (q) => q.eq('key', 'backend'))
    .unique();
async function window(ctx: QueryCtx, commit: string) {
  const control = await ctx.db
    .query('operationalControl')
    .withIndex('by_key', (q) => q.eq('key', 'release'))
    .unique();
  if (!control?.paused || control.commit !== commit || control.smokeUserId !== undefined)
    throw Error('A contração exige manutenção exclusiva do commit, sem acesso de smoke.');
  if ((await ctx.db.query('operationalLeases').withIndex('by_startedAt').take(1)).length)
    throw Error('Aguarde a drenagem antes de registrar a contração.');
}
const identityFields = [
  'commit',
  'previousBackend',
  'previousFrontend',
  'candidateId',
  'functionSpecHash',
  'planDigest',
  'sourceDigest',
  'schemaDigest',
  'rehearsalDigest',
  'verificationDigest',
] as const;

/** Confirms the schema actually compiled into this deployment, including after an ambiguous push. */
export const state = internalQuery({
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
      schemaDigest: schemaDigest(),
      paused: control?.paused === true,
      commit: control?.commit ?? null,
      smoke: control?.smokeUserId !== undefined,
      drained: !(await ctx.db.query('operationalLeases').withIndex('by_startedAt').take(1)).length,
    };
  },
});
export const published = internalMutation({
  args: {
    ...contractProgress.fields,
    phase: v.literal('published'),
    previousOwner: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await window(ctx, args.commit);
    for (const value of [args.commit, args.previousBackend, args.owner])
      if (!/^[a-f0-9]{40}$/.test(value)) throw Error('Identidade contract inválida.');
    for (const key of [
      'functionSpecHash',
      'planDigest',
      'sourceDigest',
      'schemaDigest',
      'rehearsalDigest',
      'verificationDigest',
    ] as const)
      if (!/^[a-f0-9]{64}$/.test(args[key])) throw Error('Evidência contract inválida.');
    if (
      ![args.candidateId, args.previousFrontend].every((id) => /^dpl_[A-Za-z0-9]+$/.test(id)) ||
      args.schemaDigest !== schemaDigest()
    )
      throw Error('Candidato ou schema contract inválido.');
    const previous = await read(ctx);
    if (
      previous &&
      'mode' in previous &&
      previous.mode === 'contract' &&
      previous.commit === args.commit
    ) {
      if (identityFields.some((key) => previous[key] !== args[key]))
        throw Error('A contração pendente exige o mesmo código, candidato e provas.');
      if (previous.owner === args.owner) return null;
      if (previous.phase === 'complete' || previous.owner !== args.previousOwner)
        throw Error('O proprietário da contração mudou.');
      await ctx.db.patch(previous._id, { owner: args.owner, changedAt: Date.now() });
      return null;
    }
    if (!previous || previous.phase !== 'complete' || previous.commit !== args.previousBackend)
      throw Error('O baseline contract diverge do backend concluído.');
    const { previousOwner: _, ...value } = args;
    await ctx.db.replace(previous._id, { ...value, changedAt: Date.now() });
    return null;
  },
});
async function owned(ctx: MutationCtx, owner: string, candidateId: string) {
  const record = await read(ctx);
  if (
    !record ||
    !('mode' in record) ||
    record.mode !== 'contract' ||
    record.owner !== owner ||
    record.candidateId !== candidateId
  )
    throw Error('A reserva contract não corresponde ao candidato.');
  await window(ctx, record.commit);
  return record;
}
export const validated = internalMutation({
  args: { owner: v.string(), candidateId: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner, candidateId }) => {
    const record = await owned(ctx, owner, candidateId);
    if (record.phase === 'complete') throw Error('A contração já foi concluída.');
    if (record.phase !== 'validated')
      await ctx.db.patch(record._id, { phase: 'validated', changedAt: Date.now() });
    return null;
  },
});
export const complete = internalMutation({
  args: { owner: v.string(), candidateId: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner, candidateId }) => {
    const record = await owned(ctx, owner, candidateId);
    if (record.phase === 'complete') return null;
    if (record.phase !== 'validated') throw Error('A conclusão exige o candidato validado.');
    await ctx.db.patch(record._id, { phase: 'complete', changedAt: Date.now() });
    const {
      _id: _recordId,
      _creationTime: _created,
      key: _key,
      previousBackend: _backend,
      previousFrontend: _frontend,
      phase: _phase,
      changedAt: _changed,
      ...identity
    } = record;
    await ctx.db.insert('releaseReceipts', { ...identity, completedAt: Date.now() });
    return null;
  },
});
