import { reviewIsCurrent } from '../../src/domain/calendar/base';
import { missingCoursesIssue } from '../../src/domain/calendar/identity';
import {
  maximumNoteLength,
  transition,
  validSei,
  type CalendarStatus,
  type LifecycleAction,
} from '../../src/domain/calendar/lifecycle';
import { rulesetVersion } from '../../src/domain/policies/registry';
import { conclusionBlock } from '../../src/domain/reviews/conclusion-block';
import { reviewCriteriaFor } from '../../src/domain/reviews/criteria';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { Member } from '../access/contracts';
import { appendAudit } from '../lib/audit';
import { clean, domainRule, fail } from '../lib/shared';
import { campusName } from './model';
import { baseRecord } from './record';
import {
  appendDecision,
  assertUniqueInFlow,
  lastReturn,
  contentHash,
  lifecycleRole,
  maximumSubmissionBytes,
  nextSequence,
  overlapping,
  replacedCalendars,
  submissionRow,
} from './lifecycle';

export const transitionAudit: Record<LifecycleAction, string> = {
  submit: 'SUBMIT_CALENDAR',
  withdraw: 'WITHDRAW_CALENDAR',
  startReview: 'START_REVIEW',
  return: 'RETURN_CALENDAR',
  conclude: 'CONCLUDE_REVIEW',
  reopen: 'REOPEN_REVIEW',
  publish: 'PUBLISH_CALENDAR',
  archive: 'ARCHIVE_CALENDAR',
  reinstate: 'REINSTATE_CALENDAR',
};

export interface TransitionRequest {
  id: Id<'calendars'>;
  from: CalendarStatus;
  statusRevision: number;
  action: LifecycleAction;
  version?: number;
  baseIdentity?: string;
  note?: string;
  sei?: string;
  partial?: boolean;
}

const actor = (user: Member) => ({ id: user.id, name: user.name });

/**
 * A submission states what it was made under: the rules and references in force. Without this, the
 * locked calendar would compare itself to rules it never recorded and start out as outdated.
 */
async function recordCurrentBase(
  ctx: MutationCtx,
  user: Member,
  { row, content, compatibility }: Awaited<ReturnType<typeof baseRecord>>,
) {
  const { snapshot, events } = compatibility;
  if (
    content.state.rulesetVersion === snapshot.rulesetVersion &&
    content.catalogueRevision === snapshot.revision &&
    !events.added.length &&
    !events.removed.length &&
    !events.changed.length
  )
    return { content, version: row.version };
  const fields = {
    state: clean({ ...content.state, rulesetVersion: snapshot.rulesetVersion }),
    catalogueRevision: snapshot.revision,
    institutionalSnapshot: clean(
      snapshot.events,
    ) as Doc<'calendarContents'>['institutionalSnapshot'],
  };
  const version = row.version + 1;
  await ctx.db.patch(content._id, fields);
  await ctx.db.patch(row._id, { version, updatedAt: Date.now() });
  await appendAudit(
    ctx,
    user,
    'SAVE_CALENDAR',
    { type: 'calendar', id: row._id },
    { calendarId: row._id, campusId: row.campusId, version },
  );
  return { content: { ...content, ...fields }, version };
}

/**
 * Reads the competitors, validates and writes in one mutation: Convex's serializable
 * transaction keeps uniqueness against simultaneous submissions and publications.
 */
export async function applyTransition(ctx: MutationCtx, user: Member, request: TransitionRequest) {
  const loaded = await baseRecord(ctx, user, request.id);
  const { row, status, content, review, readiness, compatibility, record } = loaded;
  const statusRevision = row.statusRevision;
  if (status !== request.from || statusRevision !== request.statusRevision)
    fail('A situação do calendário mudou em outra sessão. Atualize antes de continuar.', 409);
  const current =
    request.action === 'withdraw' ? await submissionRow(ctx, row.currentSubmissionId) : null;
  const next = domainRule(() =>
    transition(status, request.action, lifecycleRole(user), current?.submittedFrom),
  );
  const now = Date.now();
  const patch: Partial<Doc<'calendars'>> = { status: next, statusRevision: statusRevision + 1 };
  const reviewMatches = (submissionId: Id<'calendarSubmissions'> | undefined) =>
    !!review && !!submissionId && review.submissionId === submissionId;
  const reviewCurrent = () =>
    reviewIsCurrent(review, row.version, {
      revision: compatibility.snapshot.revision,
      identity: compatibility.identity,
      rulesetVersion: rulesetVersion(record.state),
    });
  const scope = { calendarId: row._id, campusId: row.campusId, version: row.version };
  let submitted = { content, version: row.version };

  switch (request.action) {
    case 'submit': {
      if (request.version !== undefined && request.version !== row.version)
        fail('Há versão mais recente. Reabra o calendário antes de enviar.', 409);
      if (!row.courses.trim()) fail(missingCoursesIssue, 409);
      if (request.baseIdentity === undefined)
        fail('Atualize a aplicação recarregando a página antes de enviar.', 409);
      // Nobody submits dates they did not see. Nothing is written, and the editor already shows it.
      if (request.baseIdentity !== compatibility.identity)
        fail(
          'A base institucional mudou enquanto você preenchia. Confira o calendário e envie novamente.',
          409,
        );
      await assertUniqueInFlow(ctx, row);
      // Checked here so the error does not surface only after the review.
      await replacedCalendars(ctx, row, {
        allowed: user.role === 'ADMIN',
        confirmed: request.partial === true,
      });
      submitted = await recordCurrentBase(ctx, user, loaded);
      scope.version = submitted.version;
      const campus = await campusName(ctx, row);
      // A restored draft still answers its last return, which stays the comparison base.
      const answered =
        status === 'devolvido' ? row.currentSubmissionId : (await lastReturn(ctx, row._id))?._id;
      const copy = {
        calendarId: row._id,
        sequence: await nextSequence(ctx, row._id),
        submittedAt: now,
        submittedBy: actor(user),
        submittedFrom: status as 'rascunho' | 'devolvido',
        ...(answered ? { previousSubmissionId: answered } : {}),
        contentVersion: submitted.version,
        contentHash: contentHash(submitted.content),
        state: submitted.content.state,
        catalogueRevision: submitted.content.catalogueRevision,
        institutionalSnapshot: submitted.content.institutionalSnapshot,
        documentSnapshot: submitted.content.documentSnapshot,
        offerKinds: row.offerKinds,
        campusName: campus,
        decisions: [],
      };
      if (new TextEncoder().encode(JSON.stringify(copy)).length > maximumSubmissionBytes)
        fail(
          'O calendário ficou grande demais para ser enviado. Reduza a quantidade de eventos e tente novamente.',
        );
      patch.currentSubmissionId = await ctx.db.insert('calendarSubmissions', copy);
      break;
    }
    case 'withdraw': {
      await appendDecision(ctx, current!, { action: 'withdrawn', at: now, by: actor(user) });
      // A withdrawn submission is kept but never serves as a comparison base. A draft points to
      // no submission; a returned calendar points back to its returned one.
      patch.currentSubmissionId =
        current!.submittedFrom === 'devolvido' ? current!.previousSubmissionId : undefined;
      break;
    }
    case 'startReview':
      break;
    case 'return': {
      const note = request.note?.trim() ?? '';
      if (!note) fail('Descreva o que o campus precisa ajustar.');
      if (note.length > maximumNoteLength)
        fail(`A nota da devolução pode ter até ${maximumNoteLength} caracteres.`);
      const submission = await submissionRow(ctx, row.currentSubmissionId);
      // A review saved in an earlier round is never inherited by this return.
      await appendDecision(ctx, submission, {
        action: 'returned',
        at: now,
        by: actor(user),
        note,
        ...(reviewMatches(submission._id) ? { reviewRevision: review!.revision } : {}),
      });
      break;
    }
    case 'conclude':
    case 'reopen': {
      const submission = await submissionRow(ctx, row.currentSubmissionId);
      if (request.action === 'conclude') {
        const block = conclusionBlock({
          baseCompatible: compatibility.compatible,
          reviewCurrent: reviewMatches(submission._id) && reviewCurrent(),
          criteria: reviewCriteriaFor(row.year),
          entries: review?.entries ?? [],
        });
        if (block) fail(block, 409);
      }
      await appendDecision(ctx, submission, {
        action: request.action === 'conclude' ? 'concluded' : 'reopened',
        at: now,
        by: actor(user),
        ...(reviewMatches(submission._id) ? { reviewRevision: review!.revision } : {}),
      });
      break;
    }
    case 'publish': {
      const sei = domainRule(() => validSei(request.sei ?? ''));
      const submission = await submissionRow(ctx, row.currentSubmissionId);
      // A changed base is solved only by a return, so it is reported before the review.
      if (!compatibility.compatible)
        fail('A base institucional mudou depois do envio. Devolva o calendário ao campus.', 409);
      if (!reviewMatches(submission._id) || !reviewCurrent())
        fail('O parecer não corresponde ao envio revisado. Reabra a revisão.', 409);
      if (
        row.version !== submission.contentVersion ||
        contentHash(content) !== submission.contentHash
      )
        fail('O conteúdo do calendário difere do envio revisado.', 409);
      if (!readiness.ready) fail('Resolva as pendências da conferência antes de publicar.', 409);
      // The published calendars may have changed since the submission.
      const { replaced } = await replacedCalendars(ctx, row, {
        allowed: true,
        confirmed: request.partial === true,
      });
      for (const other of replaced) {
        await ctx.db.patch(other._id, {
          status: 'arquivado',
          statusRevision: other.statusRevision + 1,
          archivedAt: now,
          supersededBy: row._id,
        });
        await appendAudit(
          ctx,
          user,
          transitionAudit.archive,
          { type: 'calendar', id: other._id },
          {
            calendarId: other._id,
            campusId: other.campusId,
            version: other.version,
            details: `Substituído por ${row._id}`,
          },
        );
      }
      await appendDecision(ctx, submission, {
        action: 'published',
        at: now,
        by: actor(user),
        reviewRevision: review!.revision,
      });
      Object.assign(patch, {
        seiProcess: sei,
        publishedAt: now,
        publishedBy: user.id,
        publishedSubmissionId: submission._id,
      });
      break;
    }
    case 'archive':
      patch.archivedAt = now;
      break;
    case 'reinstate': {
      const competitors = await overlapping(ctx, row, ['vigente']);
      if (competitors.length)
        fail('Há outro calendário vigente para os mesmos tipos de oferta neste campus e ano.', 409);
      patch.archivedAt = undefined;
      patch.supersededBy = undefined;
      break;
    }
  }
  await ctx.db.patch(row._id, patch);
  await appendAudit(
    ctx,
    user,
    transitionAudit[request.action],
    { type: 'calendar', id: row._id },
    {
      ...scope,
      ...(request.action === 'return' ? { details: request.note?.trim() } : {}),
      ...(request.action === 'publish' ? { details: patch.seiProcess } : {}),
    },
  );
  return { status: next, statusRevision: statusRevision + 1 };
}
