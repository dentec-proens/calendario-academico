import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Doc } from './_generated/dataModel';

const action = 'PURGE_RELEASE_RESIDUE';
const campusPrefix = 'Operação de publicação release-';
const counts = v.object({
  calendarContents: v.number(),
  calendars: v.number(),
  campuses: v.number(),
});
const keptReason = v.union(
  v.literal('has-users'),
  v.literal('has-other-calendars'),
  v.literal('has-users-and-other-calendars'),
  v.null(),
);
const input = v.object({
  campusId: v.id('campuses'),
  calendarId: v.id('calendars'),
  expectedVersion: v.number(),
  dryRun: v.boolean(),
});
const result = v.object({
  status: v.union(v.literal('dry-run'), v.literal('deleted'), v.literal('already-deleted')),
  dryRun: v.boolean(),
  reference: v.string(),
  campusId: v.id('campuses'),
  calendarId: v.id('calendars'),
  version: v.number(),
  plannedDeletes: counts,
  deletedNow: counts,
  campusKeptReason: keptReason,
  auditId: v.union(v.id('audit'), v.null()),
});
type Input = Infer<typeof input>;
type Counts = Infer<typeof counts>;
type KeptReason = Infer<typeof keptReason>;
export type ReleaseResidueResult = Infer<typeof result>;

const noDeletes = (): Counts => ({ calendarContents: 0, calendars: 0, campuses: 0 });
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isKeptReason = (value: unknown): value is KeptReason =>
  value === null ||
  value === 'has-users' ||
  value === 'has-other-calendars' ||
  value === 'has-users-and-other-calendars';

/** Validate the original receipt before treating a retry as a completed deletion. */
function receiptReason(receipt: Doc<'audit'>, args: Input, reference: string): KeptReason {
  if (
    receipt.target.type !== 'archived' ||
    receipt.target.reference !== reference ||
    receipt.calendarId !== args.calendarId ||
    receipt.campusId !== args.campusId ||
    receipt.version !== args.expectedVersion
  )
    throw new Error('O recibo de exclusão não corresponde aos IDs e à versão informados.');
  let details: unknown;
  try {
    details = JSON.parse(receipt.details ?? 'null');
  } catch {
    throw new Error('Recibo de exclusão inválido.');
  }
  if (
    !isObject(details) ||
    details.reference !== reference ||
    details.calendarId !== args.calendarId ||
    details.campusId !== args.campusId ||
    details.version !== args.expectedVersion ||
    !isKeptReason(details.campusKeptReason) ||
    !isObject(details.deleted) ||
    details.deleted.calendarContents !== 1 ||
    details.deleted.calendars !== 1 ||
    details.deleted.campuses !== Number(details.campusKeptReason === null)
  )
    throw new Error('Recibo de exclusão inválido.');
  return details.campusKeptReason;
}

/**
 * Temporary M9 operation, published with B and removed in C immediately after its reviewed run.
 * Accept only the explicit IDs/version checked by the production inventory and fresh backup.
 */
export const purge = internalMutation({
  args: input.fields,
  returns: result,
  handler: async (ctx, args): Promise<ReleaseResidueResult> => {
    if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 1)
      throw new Error('Versão esperada inválida.');
    const reference = `release-residue:${args.campusId}:${args.calendarId}:v${args.expectedVersion}`;
    const base = {
      dryRun: args.dryRun,
      reference,
      campusId: args.campusId,
      calendarId: args.calendarId,
      version: args.expectedVersion,
    };
    const receipts = await ctx.db
      .query('audit')
      .withIndex('by_calendarId_and_action_and_at', (q) =>
        q.eq('calendarId', args.calendarId).eq('action', action),
      )
      .take(2);
    if (receipts.length > 1) throw new Error('Há mais de um recibo de exclusão para o calendário.');
    if (receipts[0]) {
      const campusKeptReason = receiptReason(receipts[0], args, reference);
      const calendar = await ctx.db.get('calendars', args.calendarId);
      const content = await ctx.db
        .query('calendarContents')
        .withIndex('by_calendarId', (q) => q.eq('calendarId', args.calendarId))
        .first();
      const campus = await ctx.db.get('campuses', args.campusId);
      if (calendar || content || (campusKeptReason === null && campus))
        throw new Error(
          'O recibo existe, mas há dados restaurados; nenhuma nova exclusão será feita.',
        );
      return {
        ...base,
        status: 'already-deleted',
        plannedDeletes: noDeletes(),
        deletedNow: noDeletes(),
        campusKeptReason,
        auditId: receipts[0]._id,
      };
    }
    const campus = await ctx.db.get('campuses', args.campusId);
    if (!campus || !campus.name.startsWith(campusPrefix))
      throw new Error('O campus não corresponde ao resíduo de release esperado.');
    const calendar = await ctx.db.get('calendars', args.calendarId);
    if (!calendar || calendar.campusId !== args.campusId || calendar.year !== 8700)
      throw new Error('O calendário não corresponde ao campus e ao ano 8700 esperados.');
    if (calendar.version !== args.expectedVersion)
      throw new Error('O calendário mudou desde a conferência; nenhuma exclusão foi feita.');
    const contents = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', args.calendarId))
      .take(2);
    if (contents.length !== 1)
      throw new Error('O resíduo precisa ter exatamente um conteúdo associado.');
    const content = contents[0];
    if (content.state.schemaVersion !== 4)
      throw new Error('O conteúdo precisa estar no formato 4.');
    // calendarVersions is the authoritative calendar→snapshot association. Never delete snapshots.
    const history = await ctx.db
      .query('calendarVersions')
      .withIndex('by_calendarId_and_version', (q) => q.eq('calendarId', args.calendarId))
      .first();
    if (history)
      throw new Error('Há histórico posterior associado ao calendário; exclusão recusada.');
    const review = await ctx.db
      .query('reviews')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', args.calendarId))
      .first();
    if (review) {
      const reviewHistory = await ctx.db
        .query('reviewVersions')
        .withIndex('by_reviewId_and_revision', (q) => q.eq('reviewId', review._id))
        .first();
      if (reviewHistory)
        throw new Error('Há histórico de parecer associado ao calendário; exclusão recusada.');
      throw new Error('Há parecer associado ao calendário; exclusão recusada.');
    }
    const hasAnyUsers =
      (await ctx.db
        .query('users')
        .withIndex('by_campusId', (q) => q.eq('campusId', args.campusId))
        .first()) !== null;
    const otherCalendars = await ctx.db
      .query('calendars')
      .withIndex('by_campusId_and_year', (q) => q.eq('campusId', args.campusId))
      .take(2);
    const hasOtherCalendars = otherCalendars.some((row) => row._id !== args.calendarId);
    const campusKeptReason: KeptReason = hasAnyUsers
      ? hasOtherCalendars
        ? 'has-users-and-other-calendars'
        : 'has-users'
      : hasOtherCalendars
        ? 'has-other-calendars'
        : null;
    const plannedDeletes = {
      calendarContents: 1,
      calendars: 1,
      campuses: Number(campusKeptReason === null),
    };
    if (args.dryRun)
      return {
        ...base,
        status: 'dry-run',
        plannedDeletes,
        deletedNow: noDeletes(),
        campusKeptReason,
        auditId: null,
      };
    await ctx.db.delete('calendarContents', content._id);
    await ctx.db.delete('calendars', calendar._id);
    if (campusKeptReason === null) await ctx.db.delete('campuses', campus._id);
    const auditId = await ctx.db.insert('audit', {
      at: Date.now(),
      action,
      target: { type: 'archived', reference },
      calendarId: args.calendarId,
      campusId: args.campusId,
      version: args.expectedVersion,
      details: JSON.stringify({
        reference,
        calendarId: args.calendarId,
        campusId: args.campusId,
        contentId: content._id,
        version: args.expectedVersion,
        deleted: plannedDeletes,
        campusKeptReason,
      }),
    });
    return {
      ...base,
      status: 'deleted',
      plannedDeletes,
      deletedNow: plannedDeletes,
      campusKeptReason,
      auditId,
    };
  },
});
