import { civilDate } from '../../src/domain/civil-date.ts';
import type { CalendarActivity, CalendarContentV4 } from '../../src/domain/calendar/model.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { reviewCriteriaFor } from '../../src/domain/reviews/criteria.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';
import type { CalendarStatus, LifecycleAction } from '../../src/domain/calendar/lifecycle.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import { api } from '../../convex/_generated/api.js';
import type { createNativeFixture } from './native-database.ts';

type Client = Pick<
  ReturnType<Awaited<ReturnType<typeof createNativeFixture>>['asClient']>,
  'query' | 'mutation'
>;

/** Content that passes every machine check for 2027, as in the release test. */
export function readyContent(): CalendarContentV4 {
  const state = {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        name: 'Ano',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
      },
    ],
    events: [] as CalendarActivity[],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'presencial' as const,
        organization: 'anual' as const,
        stages: { perTerm: 4 },
        scope: { status: 'covered' as const },
      },
    ],
  };
  state.events = reviewCriteriaFor(2027).map((criterion, index) => ({
    id: 'criterion-' + index,
    name: criterion.title,
    start: civilDate('2027-02-01'),
    end: civilDate('2027-02-01'),
    kind: 'note',
    category: 'institucional',
    offers: ['integrado'],
  }));
  for (const requirement of activityChecklist(state)) {
    const event: CalendarActivity = {
      id: requirement.id.replace(/:/g, '-'),
      requirementId: requirement.id,
      offers: [requirement.offerId ?? 'integrado'],
      name: requirement.name,
      start: civilDate('2027-02-01'),
      end: civilDate('2027-02-01'),
      kind: 'note',
    };
    if (requirement.minHours) event.hours = requirement.minHours;
    if (requirement.month)
      event.start = event.end = civilDate(`2027-${String(requirement.month).padStart(2, '0')}-10`);
    if (requirement.admissionType) {
      event.publicationStatus = 'planned';
      event.admission = {
        type: requirement.admissionType,
        year: requirement.admissionType === 'regular' ? 2028 : 2027,
        term: requirement.term ?? 'annual',
        ...(requirement.admissionType === 'transfer' ? { periodId: 'year' } : {}),
      };
    }
    if (requirement.id.startsWith('admission-notice-'))
      event.start = event.end = civilDate('2027-01-01');
    state.events.push(event);
  }
  const { year: _year, ...content } = state;
  return { ...content, rulesetVersion: rulesetVersion(state) };
}

export async function calendarStatus(client: Client, id: Id<'calendars'>) {
  const record = await client.query(api.calendars.calendar, { id });
  return { status: record.status as CalendarStatus, statusRevision: record.statusRevision, record };
}

export async function act(
  client: Client,
  id: Id<'calendars'>,
  action: LifecycleAction,
  extra: { note?: string; sei?: string; partial?: boolean; version?: number } = {},
  reader: Client = client,
) {
  const { status, statusRevision } = await calendarStatus(reader, id);
  return client.mutation(api.calendars.transitionCalendar, {
    id,
    from: status,
    statusRevision,
    action,
    ...extra,
  });
}

/** Saves a review of the current submission with every criterion confirmed. */
export async function saveReview(
  reviewer: Client,
  id: Id<'calendars'>,
  options: { status?: 'ATENDIDO' | 'NAO_ATENDIDO' | 'PENDENTE'; acknowledgeStale?: boolean } = {},
) {
  const support = await reviewer.query(api.reviews.review, { id });
  const status = options.status ?? 'ATENDIDO';
  return reviewer.mutation(api.reviews.saveReview, {
    id,
    body: {
      rulesetVersion: support.rulesetVersion,
      baseIdentity: support.baseIdentity,
      revision: support.review?.revision ?? 0,
      calendarVersion: support.calendar.version,
      catalogueRevision: support.catalogueRevision,
      conclusion: support.initialConclusion,
      applicableNorm: 'Resolução sintética',
      processNumber: '23411.000001/2027-11',
      submissionId: support.submission?.id,
      ...((options.acknowledgeStale ?? support.stale) ? { acknowledgeStale: true } : {}),
      entries: reviewCriteriaFor(2027).map((criterion) => ({
        id: criterion.id,
        status,
        notes: '',
        reviewed: status !== 'PENDENTE',
      })),
    },
  });
}

/** Seeds the courses a calendar needs to be submitted, without an identity audit entry. */
export async function seedCourses(
  fixture: Pick<Awaited<ReturnType<typeof createNativeFixture>>, 'client'>,
  id: Id<'calendars'>,
  courses = 'Curso sintético',
) {
  await fixture.client.run(async (ctx) => {
    if (!(await ctx.db.get(id))?.courses) await ctx.db.patch(id, { courses });
  });
}

/**
 * Submits and returns a calendar so it stays editable while its submission keeps the content as
 * evidence. Returns a reader for that preserved copy, shaped like a calendar state.
 */
export async function preserveSubmission(
  fixture: Pick<Awaited<ReturnType<typeof createNativeFixture>>, 'client' | 'asClient'>,
  id: Id<'calendars'>,
) {
  const admin = fixture.asClient('admin');
  await seedCourses(fixture, id);
  await act(admin, id, 'submit');
  await act(admin, id, 'return', { note: 'Evidência preservada.' });
  return async () => {
    const rows = await fixture.client.run((ctx) =>
      ctx.db
        .query('calendarSubmissions')
        .withIndex('by_calendarId_and_sequence', (q) => q.eq('calendarId', id))
        .collect(),
    );
    const calendar = await fixture.client.run((ctx) => ctx.db.get(id));
    const submission = rows.at(-1)!;
    return {
      ...submission,
      state: { ...submission.state, year: calendar!.year, campus: submission.campusName },
    };
  };
}
