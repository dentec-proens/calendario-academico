import { reviewIsCurrent } from '../src/domain/calendar/base';
import { equivalentRulesets, rulesetVersion } from '../src/domain/policies/registry';
import { assertWritesOpen } from './lib/maintenance';
import { reviewSupport } from '../src/domain/reviews/technical-support';
import { projectDates } from '../src/domain/calendar/model';
import { reviewCriteriaFor, reviewSourceFor } from '../src/domain/reviews/criteria';
import { initialConclusion } from '../src/domain/reviews/conclusion';
import { updateConclusion } from '../src/domain/reviews/conclusion';
import { reviewDocument } from '../src/printing/review-export';
import { reviewNorm } from '../src/domain/reviews/citation';
import { query, mutation, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Member } from './access/contracts';
import { requireNativeUser } from './access/identity';
import { calendarRow, summary } from './calendars/model';
import { baseRecord, submissionSummary } from './calendars/record';
import { applyTransition } from './calendars/transitions';
import { lineage } from './calendars/lifecycle';
import { calendarStatus } from './validators';
import { officialApproval, reviewEditable } from '../src/domain/calendar/lifecycle';
import type { Doc, Id } from './_generated/dataModel';
import * as contracts from './contracts';
import { documentDto } from './documents/model';
import { appendAudit } from './lib/audit';
import { assertCampus, reviewer } from './lib/authorization';
import { pageBound } from './lib/pagination';
import { fail, iso, clean } from './lib/shared';
import { reviewAssignee, reviewRow, reviewDto, reviewProgress } from './reviews/model';
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import type { Infer } from 'convex/values';
import { v } from 'convex/values';

const idArgs = { id: v.id('calendars') };
const queueStatus = v.union(
  ...calendarStatus.members.filter((member) => member.value !== 'rascunho'),
);

/** A review counts only for the submission it was saved in, besides the content version. */
function reviewForSubmission(
  review: Doc<'reviews'> | null,
  row: Pick<Doc<'calendars'>, 'currentSubmissionId'>,
) {
  return !!review && !!row.currentSubmissionId && review.submissionId === row.currentSubmissionId;
}

/**
 * One situation of the queue, newest first. Only a holder filter reads the longer index, whose
 * order would otherwise group the calendars by holder.
 */
function queueRows(
  ctx: QueryCtx,
  status: Infer<typeof queueStatus>,
  campusId: Id<'campuses'> | undefined,
  holder: { id: Id<'users'> | undefined } | undefined,
) {
  const calendars = ctx.db.query('calendars');
  if (campusId && holder)
    return calendars.withIndex('by_campusId_and_status_and_deletedAt_and_assigneeId', (q) =>
      q
        .eq('campusId', campusId)
        .eq('status', status)
        .eq('deletedAt', undefined)
        .eq('assignee.id', holder.id),
    );
  if (campusId)
    return calendars.withIndex('by_campusId_and_status_and_deletedAt', (q) =>
      q.eq('campusId', campusId).eq('status', status).eq('deletedAt', undefined),
    );
  if (holder)
    return calendars.withIndex('by_status_and_deletedAt_and_assigneeId', (q) =>
      q.eq('status', status).eq('deletedAt', undefined).eq('assignee.id', holder.id),
    );
  return calendars.withIndex('by_status_and_deletedAt', (q) =>
    q.eq('status', status).eq('deletedAt', undefined),
  );
}

/** The reviewer works by status; drafts never reach the queue. */
export const reviewQueue = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(queueStatus),
    campusId: v.optional(v.id('campuses')),
    holder: v.optional(v.union(v.literal('mine'), v.literal('none'))),
  },
  returns: paginationResultValidator(contracts.reviewQueueItem),
  handler: async (ctx, { paginationOpts, status = 'enviado', campusId, holder }) => {
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    pageBound(paginationOpts.numItems);
    if (campusId) assertCampus(user, campusId);
    const result = await queueRows(
      ctx,
      status,
      campusId,
      holder && { id: holder === 'mine' ? user.id : undefined },
    )
      .order('desc')
      .paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map(async (row) => {
        const [campus, review, submission] = await Promise.all([
          ctx.db.get(row.campusId),
          reviewRow(ctx, row._id),
          row.currentSubmissionId ? ctx.db.get(row.currentSubmissionId) : null,
        ]);
        if (!campus) fail('Campus não encontrado.', 404);
        return {
          ...(await summary(ctx, row, campus)),
          assignee: reviewAssignee(row),
          submission: submission
            ? {
                id: submission._id,
                sequence: submission.sequence,
                submittedAt: iso(submission.submittedAt),
                resubmission: submission.previousSubmissionId !== undefined,
              }
            : null,
          review: review ? reviewProgress(review, row) : null,
        };
      }),
    );
    return { ...result, page };
  },
});

/** Bounded on purpose: past this, the tabs say "99+" and the exact number changes nothing. */
const queueCountCap = 99;

/**
 * How many calendars await a reviewer in the two tabs that ask for action, under the same filters
 * as the list. These calendars are locked, so an autosave elsewhere does not invalidate the count.
 */
export const reviewQueueCounts = query({
  args: {
    campusId: v.optional(v.id('campuses')),
    holder: v.optional(v.union(v.literal('mine'), v.literal('none'))),
  },
  returns: v.object({ enviado: contracts.queueCount, em_revisao: contracts.queueCount }),
  handler: async (ctx, { campusId, holder }) => {
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    if (campusId) assertCampus(user, campusId);
    const count = async (status: 'enviado' | 'em_revisao') => {
      const rows = await queueRows(
        ctx,
        status,
        campusId,
        holder && { id: holder === 'mine' ? user.id : undefined },
      ).take(queueCountCap + 1);
      return { count: Math.min(rows.length, queueCountCap), more: rows.length > queueCountCap };
    };
    const [enviado, em_revisao] = await Promise.all([count('enviado'), count('em_revisao')]);
    return { enviado, em_revisao };
  },
});

export const reviewHistory = query({
  args: { ...idArgs, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(contracts.reviewDto),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { id, paginationOpts }) => {
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    pageBound(paginationOpts.numItems);
    await calendarRow(ctx, user, id);
    const review = await reviewRow(ctx, id);
    if (!review) return { page: [], isDone: true, continueCursor: '' };
    const result = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_revision', (q) => q.eq('reviewId', review._id))
      .order('desc')
      .paginate(paginationOpts);
    return {
      page: result.page.map(({ _id, _creationTime, reviewId: _reviewId, ...fields }) => ({
        ...fields,
        updatedAt: iso(fields.updatedAt),
        documentSnapshot: fields.documentSnapshot.map(documentDto),
        officialApproval: false as const,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const review = query({
  args: idArgs,
  returns: contracts.reviewSupportDto,
  handler: async (ctx, { id }) => {
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    const { row, status, record, compatibility, review: prior } = await baseRecord(ctx, user, id);
    const support = reviewSupport(
      record,
      projectDates(compatibility.snapshot.events, record.state.events),
    );
    return clean({
      ...support,
      assignee: reviewAssignee(row),
      officialApproval: officialApproval(status),
      status,
      statusRevision: row.statusRevision,
      submission: (await submissionSummary(ctx, user, row)).submission,
      calendar: { ...support.calendar, id: record.id, campus: record.state.campus },
      initialConclusion: initialConclusion(support),
      catalogueRevision: compatibility.snapshot.revision,
      baseCompatible: compatibility.compatible,
      review: prior ? reviewDto(prior) : null,
      baseIdentity: compatibility.identity,
      rulesetVersion: rulesetVersion(record.state),
      stale:
        !!prior &&
        (!reviewForSubmission(prior, row) ||
          !reviewIsCurrent(prior, record.version, {
            revision: compatibility.snapshot.revision,
            identity: compatibility.identity,
            rulesetVersion: rulesetVersion(record.state),
          })),
    }) as Infer<typeof contracts.reviewSupportDto>;
  },
});

export const saveReview = mutation({
  args: { ...idArgs, body: contracts.reviewInput },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, { id, body }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    const {
      row,
      status,
      record,
      base,
      compatibility,
      review: prior,
    } = await baseRecord(ctx, user, id);
    if (!reviewEditable(status))
      fail('O parecer só pode ser alterado enquanto o calendário está enviado ou em revisão.', 409);
    if (!body.submissionId || body.submissionId !== row.currentSubmissionId)
      fail('O calendário foi reenviado ou recolhido. Reabra a revisão do envio atual.', 409);
    if (row.assignee && row.assignee.id !== user.id)
      fail(`${row.assignee.name} assumiu este parecer. Assuma-o para salvar.`, 409);
    const currentRules = rulesetVersion(record.state);
    const criteria = reviewCriteriaFor(record.state.year);
    if (!equivalentRulesets(body.rulesetVersion, currentRules))
      fail(
        'O conjunto de regras da revisão mudou. Reabra e confira os critérios antes de salvar.',
        409,
      );
    if (body.baseIdentity !== compatibility.identity)
      fail(
        'A identidade da base da revisão mudou. Reabra e confira os critérios antes de salvar.',
        409,
      );
    if (
      !reviewIsCurrent(body, record.version, {
        revision: base.revision,
        identity: compatibility.identity,
        rulesetVersion: currentRules,
      })
    )
      fail('O calendário ou a base mudou. Reabra a revisão.', 409);
    if (body.revision !== (prior?.revision ?? 0))
      fail('Outro revisor atualizou este parecer. Reabra antes de salvar.', 409);
    if (
      prior &&
      (!reviewForSubmission(prior, row) ||
        !reviewIsCurrent(prior, record.version, {
          revision: base.revision,
          identity: compatibility.identity,
          rulesetVersion: currentRules,
        })) &&
      !body.acknowledgeStale
    )
      fail('Confirme a reavaliação das conclusões anteriores após a mudança de versão.', 409);
    if (
      body.entries.length !== criteria.length ||
      new Set(body.entries.map((e) => e.id)).size !== criteria.length
    )
      fail('Confira todos os critérios da revisão.');
    for (const e of body.entries) {
      if (!criteria.some((c) => c.id === e.id) || e.notes.length > 2000)
        fail('Critério ou observação inválidos.');
      if (e.status === 'PENDENTE' && e.reviewed)
        fail('Selecione Atendido, Não atendido ou Não aplicável antes de confirmar o critério.');
    }
    const support = reviewSupport(
      record,
      projectDates(compatibility.snapshot.events, record.state.events),
    );
    const conclusion = updateConclusion(
      body.conclusion,
      criteria,
      body.entries,
      reviewNorm(record.state.year, support.sameYear ? support.source.norm : ''),
    );
    if (
      conclusion.length > 8000 ||
      (body.processNumber ?? '').length > 100 ||
      (body.applicableNorm ?? '').length > 1000
    )
      fail('Síntese ou identificação muito longa.');
    const next = {
      calendarId: id,
      submissionId: body.submissionId,
      calendarVersion: record.version,
      catalogueRevision: base.revision,
      baseIdentity: compatibility.identity,
      rulesetVersion: currentRules,
      revision: (prior?.revision ?? 0) + 1,
      source: reviewSourceFor(record.state.year).id,
      documentSnapshot: compatibility.snapshot.documents,
      entries: body.entries,
      conclusion,
      processNumber: body.processNumber ?? '',
      applicableNorm: body.applicableNorm || reviewNorm(record.state.year),
      reviewer: { id: user.id, name: user.name },
      updatedAt: Date.now(),
    };
    if (prior) {
      const { _id, _creationTime: _creation, ...fields } = prior;
      await ctx.db.insert('reviewVersions', { reviewId: _id, ...fields });
      await ctx.db.replace(_id, next);
    } else await ctx.db.insert('reviews', next);
    await appendAudit(
      ctx,
      user,
      'SAVE_HUMAN_REVIEW',
      { type: 'calendar', id },
      { calendarId: id, campusId: record.campusId, version: record.version },
    );
    // A parecer without a holder belongs to whoever saves it.
    if (!row.assignee) await assign(ctx, user, row);
    // The first save of the current submission starts its review.
    if (status === 'enviado')
      await applyTransition(ctx, user, {
        id,
        from: status,
        statusRevision: row.statusRevision,
        action: 'startReview',
      });
    return { revision: next.revision };
  },
});

async function assign(ctx: MutationCtx, user: Member, row: Doc<'calendars'>) {
  await ctx.db.patch(row._id, { assignee: { id: user.id, name: user.name, at: Date.now() } });
  await appendAudit(
    ctx,
    user,
    'ASSUME_REVIEW',
    { type: 'calendar', id: row._id },
    {
      calendarId: row._id,
      campusId: row.campusId,
      version: row.version,
      ...(row.assignee ? { details: row.assignee.name } : {}),
    },
  );
}

/**
 * `expectedAssigneeId` is the holder the person was seeing: two people assuming at once, or a
 * confirmation answered after a change, never take the parecer from someone they did not see.
 */
export const assumeReview = mutation({
  args: { ...idArgs, expectedAssigneeId: v.union(v.id('users'), v.null()) },
  returns: v.null(),
  handler: async (ctx, { id, expectedAssigneeId }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    const row = await calendarRow(ctx, user, id);
    if (!reviewEditable(row.status))
      fail('O parecer só pode ser assumido enquanto o calendário está enviado ou em revisão.', 409);
    if ((row.assignee?.id ?? null) !== expectedAssigneeId)
      fail(
        row.assignee
          ? `${row.assignee.name} assumiu este parecer. Confira antes de assumi-lo.`
          : 'Este parecer foi liberado. Confira antes de assumi-lo.',
        409,
      );
    if (row.assignee?.id !== user.id) await assign(ctx, user, row);
    return null;
  },
});

/** Only the holder releases; anyone else first assumes the parecer, which is recorded. */
export const releaseReview = mutation({
  args: idArgs,
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    const row = await calendarRow(ctx, user, id);
    // A request from a screen that is out of date never clears the holder a resubmission keeps.
    if (!reviewEditable(row.status))
      fail('O parecer só pode ser liberado enquanto o calendário está enviado ou em revisão.', 409);
    if (!row.assignee) return null;
    if (row.assignee.id !== user.id)
      fail(`${row.assignee.name} assumiu este parecer. Só essa pessoa pode liberá-lo.`, 409);
    await ctx.db.patch(id, { assignee: undefined });
    await appendAudit(
      ctx,
      user,
      'RELEASE_REVIEW',
      { type: 'calendar', id },
      { calendarId: id, campusId: row.campusId, version: row.version },
    );
    return null;
  },
});

export const exportReview = query({
  args: { ...idArgs, revision: v.number() },
  returns: contracts.exportDto,
  handler: async (ctx, { id, revision }) => {
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    const { row, record, compatibility, review: prior } = await baseRecord(ctx, user, id);
    if (!prior) fail('Salve o parecer antes de exportar.', 409);
    if (
      prior.revision !== revision ||
      !reviewForSubmission(prior, row) ||
      !reviewIsCurrent(prior, record.version, {
        revision: compatibility.snapshot.revision,
        identity: compatibility.identity,
        rulesetVersion: rulesetVersion(record.state),
      })
    )
      fail('O parecer está desatualizado. Reabra, confira e salve antes de exportar.', 409);
    return reviewDocument(record, reviewDto(prior)) as Infer<typeof contracts.exportDto>;
  },
});

/**
 * The review a submission decision recorded: the current review when the revision is current,
 * otherwise its archived revision. The submission must belong to the calendar's chain.
 */
export const submissionReview = query({
  args: { ...idArgs, submissionId: v.id('calendarSubmissions'), revision: v.number() },
  returns: contracts.reviewDto,
  handler: async (ctx, { id, submissionId, revision }) => {
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    const row = await calendarRow(ctx, user, id);
    const submission = await ctx.db.get(submissionId);
    const chain = new Set((await lineage(ctx, row)).map((item) => item._id));
    if (!submission || !chain.has(submission.calendarId)) fail('Envio não encontrado.', 404);
    const current = await reviewRow(ctx, submission.calendarId);
    if (!current) fail('Parecer não encontrado.', 404);
    if (current.revision === revision) return reviewDto(current);
    const archived = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_revision', (q) =>
        q.eq('reviewId', current._id).eq('revision', revision),
      )
      .unique();
    if (!archived) fail('Parecer não encontrado.', 404);
    const { _id, _creationTime, reviewId: _reviewId, ...fields } = archived;
    return {
      ...fields,
      updatedAt: iso(fields.updatedAt),
      documentSnapshot: fields.documentSnapshot.map(documentDto),
      officialApproval: false as const,
    };
  },
});
