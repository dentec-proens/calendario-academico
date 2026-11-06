import type { Doc, Id } from '../_generated/dataModel';
import { documentDto } from '../documents/model';
import { reviewCriteriaFor } from '../../src/domain/reviews/criteria';
import { reviewEditable } from '../../src/domain/calendar/lifecycle';
import type { Context } from '../lib/shared';
import { iso } from '../lib/shared';

export function reviewDto(row: Doc<'reviews'>) {
  const { _id, _creationTime, ...fields } = row;
  return {
    ...fields,
    updatedAt: iso(row.updatedAt),
    documentSnapshot: row.documentSnapshot.map(documentDto),
    officialApproval: false as const,
  };
}

export async function reviewRow(ctx: Context, id: Id<'calendars'>) {
  return ctx.db
    .query('reviews')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
    .unique();
}

/** The holder counts only while the parecer can change; afterwards the saved author tells it. */
export function reviewAssignee(row: Doc<'calendars'>) {
  return row.assignee && reviewEditable(row.status)
    ? { id: row.assignee.id, name: row.assignee.name, at: iso(row.assignee.at) }
    : null;
}

/** What the review list shows without rebuilding the analysis: progress and calendar drift. */
export function reviewProgress(row: Doc<'reviews'>, calendar: Doc<'calendars'>) {
  const criteria = reviewCriteriaFor(calendar.year);
  return {
    revision: row.revision,
    reviewerName: row.reviewer.name,
    updatedAt: iso(row.updatedAt),
    reviewed: row.entries.filter(
      (entry) =>
        entry.reviewed &&
        entry.status !== 'PENDENTE' &&
        criteria.some((criterion) => criterion.id === entry.id),
    ).length,
    total: criteria.length,
    calendarChanged: row.calendarVersion !== calendar.version,
    // A review of another round never counts for the open submission, even without edits.
    otherSubmission:
      !!calendar.currentSubmissionId && row.submissionId !== calendar.currentSubmissionId,
  };
}
