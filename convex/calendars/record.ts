import { readActivityDates } from '../../src/domain/calendar/civil-dates.ts';
import { frozenBase, inspectBase } from './base';
import { isEditable, isPublished, isUnderReview, officialApproval } from '../../src/domain/calendar/lifecycle';
import { lastReturn, outcome } from './lifecycle';
import { releaseReadiness } from '../../src/domain/calendar/readiness';
import type { Doc, Id } from '../_generated/dataModel';
import type { Member } from '../access/contracts';
import { catalogue } from '../catalogue/model';
import type * as contracts from '../contracts';
import { documentDto, currentDocuments } from '../documents/model';
import { assertCampus } from '../lib/authorization';
import type { Context } from '../lib/shared';
import { fail, iso, clean } from '../lib/shared';
import { reviewRow, reviewDto } from '../reviews/model';
import { calendarRow, contents, summary, domainState } from './model';
import type { Infer } from 'convex/values';

export async function baseRecord(ctx: Context, user: Member, id: Id<'calendars'>) {
  const row = await calendarRow(ctx, user, id),
    status = row.status,
    [content, campus, base, docs, review] = await Promise.all([
      contents(ctx, id),
      ctx.db.get(row.campusId),
      catalogue(ctx, row.year),
      currentDocuments(ctx, row.year),
      reviewRow(ctx, id),
    ]);
  if (!campus) fail('Campus não encontrado.', 404);
  const record = {
    ...(await summary(ctx, row, campus)),
    state: domainState(row, campus, content.state),
    catalogueRevision: content.catalogueRevision,
    documentSnapshot: content.documentSnapshot.map(documentDto),
    institutionalSnapshot: content.institutionalSnapshot.map(readActivityDates),
  };
  // A later base change never alters a published calendar.
  const compatibility = isPublished(status)
    ? frozenBase(status, record.state, content)
    : inspectBase(status, record.state, content, base, docs);
  const readiness = {
    // While editing, pending issues follow the current base; a locked calendar keeps its own copy.
    ...releaseReadiness(
      isEditable(status)
        ? { ...record, institutionalSnapshot: compatibility.snapshot.events }
        : record,
      {
        base: compatibility,
        catalogue: { revision: compatibility.snapshot.revision },
        reviews: review ? [reviewDto(review)] : [],
        submissionId: row.currentSubmissionId ?? null,
        locked: isUnderReview(status),
      },
    ),
    officialApproval: officialApproval(status),
  } as Infer<typeof contracts.readiness>;
  return { row, status, content, record, base, docs, review, readiness, compatibility };
}

export async function submissionSummary(ctx: Context, user: Member, row: Doc<'calendars'>) {
  const submission = row.currentSubmissionId ? await ctx.db.get(row.currentSubmissionId) : null;
  const returned =
    submission && outcome(submission) === 'returned' ? submission : await lastReturn(ctx, row._id);
  const decision = returned?.decisions.at(-1);
  return {
    submission: submission
      ? {
          id: submission._id,
          sequence: submission.sequence,
          submittedAt: iso(submission.submittedAt),
          submittedBy: submission.submittedBy.name,
          submittedFrom: submission.submittedFrom,
          ...(submission.previousSubmissionId
            ? { previousSubmissionId: submission.previousSubmissionId }
            : {}),
          outcome: outcome(submission),
        }
      : null,
    lastReturn:
      returned && decision
        ? {
            submissionId: returned._id,
            sequence: returned.sequence,
            at: iso(decision.at),
            note: decision.note ?? '',
            ...(user.role === 'CAMPUS' ? {} : { by: decision.by.name }),
          }
        : null,
  };
}

export async function fullRecord(
  ctx: Context,
  user: Member,
  id: Id<'calendars'>,
): Promise<Infer<typeof contracts.calendarDto>> {
  const { row, record, readiness, compatibility } = await baseRecord(ctx, user, id);
  return clean({
    ...record,
    ...(await submissionSummary(ctx, user, row)),
    readiness,
    institutionalEvents: compatibility.snapshot.events,
    currentCatalogueRevision: compatibility.snapshot.revision,
    currentDocuments: compatibility.snapshot.documents.map(documentDto),
  });
}

export async function calendarSummaries(ctx: Context, user: Member, deleted = false) {
  const rows = await calendarQuery(ctx, user, deleted).order('desc').take(100);
  return Promise.all(
    rows
      .filter((row) => !!row.deletedAt === deleted)
      .map(async (row) => {
        const campus = await ctx.db.get(row.campusId);
        if (!campus) fail('Campus não encontrado.', 404);
        return summary(ctx, row, campus);
      }),
  );
}

export function calendarQuery(
  ctx: Context,
  user: Member,
  deleted: boolean,
  requestedCampus?: Id<'campuses'>,
) {
  if (requestedCampus) assertCampus(user, requestedCampus);
  const campusId = user.role === 'CAMPUS' ? user.campusId! : requestedCampus;
  return campusId
    ? ctx.db.query('calendars').withIndex('by_campusId_and_deletedAt', (q) => {
        const scoped = q.eq('campusId', campusId);
        return deleted ? scoped.gt('deletedAt', 0) : scoped.eq('deletedAt', undefined);
      })
    : ctx.db
        .query('calendars')
        .withIndex('by_deletedAt', (q) =>
          deleted ? q.gt('deletedAt', 0) : q.eq('deletedAt', undefined),
        );
}
