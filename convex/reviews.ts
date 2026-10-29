import { reviewIsCurrent } from '../src/domain/calendar/base';
import { rulesetVersion } from '../src/domain/policies/registry';
import { assertWritesOpen } from './lib/maintenance';
import { reviewSupport } from '../src/domain/reviews/technical-support';
import { reviewCriteriaFor, reviewSourceFor } from '../src/domain/reviews/criteria';
import { initialConclusion } from '../src/domain/reviews/conclusion';
import { updateConclusion } from '../src/domain/reviews/conclusion';
import { reviewDocument } from '../src/printing/review-export';
import { reviewNorm } from '../src/domain/reviews/citation';
import { query, mutation } from './_generated/server';
import { requireNativeUser } from './access/identity';
import { calendarRow } from './calendars/model';
import { baseRecord } from './calendars/record';
import * as contracts from './contracts';
import { documentDto } from './documents/model';
import { appendAudit } from './lib/audit';
import { reviewer } from './lib/authorization';
import { pageBound } from './lib/pagination';
import { fail, iso, clean } from './lib/shared';
import { reviewRow, reviewDto } from './reviews/model';
import { paginationOptsValidator } from 'convex/server';
import type { Infer } from 'convex/values';
import { v } from 'convex/values';

const idArgs = { id: v.id('calendars') };

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
    const { record, base, compatibility, review: prior } = await baseRecord(ctx, user, id);
    const support = reviewSupport(record, [
      ...compatibility.snapshot.events,
      ...record.state.events,
    ]);
    return clean({
      ...support,
      initialConclusion: initialConclusion(support),
      catalogueRevision: base.revision,
      review: prior ? reviewDto(prior) : null,
      baseIdentity: compatibility.identity,
      rulesetVersion: rulesetVersion(record.state),
      stale:
        !!prior &&
        !reviewIsCurrent(prior, record.version, {
          revision: base.revision,
          identity: compatibility.identity,
          rulesetVersion: rulesetVersion(record.state),
        }),
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
    const { record, base, docs, compatibility, review: prior } = await baseRecord(ctx, user, id);
    const currentRules = rulesetVersion(record.state);
    const criteria = reviewCriteriaFor(record.state.year);
    if (record.state.schemaVersion === 3 && body.rulesetVersion !== currentRules)
      fail(
        'O conjunto de regras da revisão mudou. Reabra e confira os critérios antes de salvar.',
        409,
      );
    if (record.state.schemaVersion === 3 && body.baseIdentity !== compatibility.identity)
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
      fail('Outro revisor atualizou esta análise. Reabra antes de salvar.', 409);
    if (
      prior &&
      !reviewIsCurrent(prior, record.version, {
        revision: base.revision,
        identity: compatibility.identity,
        rulesetVersion: currentRules,
      }) &&
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
        fail('Selecione Atendido, Não atendido ou Não aplicável antes de confirmar a análise.');
    }
    const support = reviewSupport(record, [
      ...compatibility.snapshot.events,
      ...record.state.events,
    ]);
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
      calendarVersion: record.version,
      catalogueRevision: base.revision,
      baseIdentity: compatibility.identity,
      rulesetVersion: currentRules,
      revision: (prior?.revision ?? 0) + 1,
      source: reviewSourceFor(record.state.year).id,
      documentSnapshot: docs,
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
    return { revision: next.revision };
  },
});

export const exportReview = query({
  args: { ...idArgs, revision: v.number() },
  returns: contracts.exportDto,
  handler: async (ctx, { id, revision }) => {
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    const { record, base, compatibility, review: prior } = await baseRecord(ctx, user, id);
    if (!prior) fail('Salve a análise inicial ou a revisão antes de exportar.', 409);
    if (
      prior.revision !== revision ||
      !reviewIsCurrent(prior, record.version, {
        revision: base.revision,
        identity: compatibility.identity,
        rulesetVersion: rulesetVersion(record.state),
      })
    )
      fail('A análise está desatualizada. Reabra, confira e salve antes de exportar.', 409);
    return reviewDocument(record, reviewDto(prior)) as Infer<typeof contracts.exportDto>;
  },
});
