import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import { inspectCalendar } from '../../src/domain/calendar/base.ts';
import { reviewCriteriaFor } from '../../src/domain/reviews/criteria.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, seedCourses } from '../helpers/lifecycle.ts';
import type { Id } from '../../convex/_generated/dataModel';

async function opened() {
  const fixture = await createNativeFixture({
    catalogue: {
      revision: 1,
      events: [
        {
          id: 'holiday',
          name: 'Feriado',
          start: civilDate('2027-03-02'),
          end: civilDate('2027-03-02'),
          effect: 'exclude',
          category: 'feriado',
          evidence: 'Portaria',
          modalities: ['integrado'],
          active: true,
        },
      ],
    },
  });
  const account = fixture.asClient('admin');
  const record = await account
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a!,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
    .then(calendarRecordDates);
  await seedCourses(fixture, record.id);
  return { ...fixture, account, record };
}

test('an equivalent base writes nothing and keeps the review evidence', async () => {
  const { account, record } = await opened();
  await act(account, record.id, 'submit');
  const review = await account.query(api.reviews.review, { id: record.id });
  await account.mutation(api.reviews.saveReview, {
    id: record.id,
    body: {
      schemaVersion: 6 as const,
      submissionId: review.submission!.id,
      revision: 0,
      calendarVersion: record.version,
      catalogueRevision: review.catalogueRevision,
      baseIdentity: review.baseIdentity,
      rulesetVersion: review.rulesetVersion,
      conclusion: '',
      entries: reviewCriteriaFor(2027).map(({ id }) => ({
        id,
        status: 'PENDENTE' as const,
        reviewed: false,
        notes: '',
      })),
    },
  });
  // The campus reconciles the base only after a return; the returned review stays bound.
  await act(account, record.id, 'return', { note: 'Confira a base.' });
  // An event for another offer increments this year's revision but cannot affect this calendar.
  await account.mutation(api.catalogue.saveCatalogue, {
    body: {
      revision: 1,
      name: 'Outra oferta',
      start: civilDate('2027-04-01'),
      end: civilDate('2027-04-01'),
      effect: 'exclude',
      category: 'feriado',
      evidence: 'Norma',
      modalities: ['graduacao'],
      active: true,
    },
  });
  const fresh = await account
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  expect(inspectCalendar(fresh, fresh).kind).toBe('equivalent');
  expect((await account.query(api.reviews.review, { id: record.id })).stale).toBe(false);
  expect(fresh).toMatchObject({
    version: 1,
    updatedAt: record.updatedAt,
    catalogueRevision: 1,
    state: record.state,
    institutionalSnapshot: record.institutionalSnapshot,
  });
});

test('real changes require the displayed content acceptance and events recalculate teaching-day targets atomically', async () => {
  const { account, record } = await opened();
  const initial = await account
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: 1,
        catalogueRevision: 1,
        state: {
          ...record.state,
          weekConfirmed: true,
          weekdays: [1, 2, 3, 4, 5],
          periods: [
            {
              id: 'p',
              name: 'Período',
              start: civilDate('2027-03-01'),
              end: civilDate('2027-03-03'),
              association: { status: 'defined', offers: ['integrado'], term: 'annual' },
            },
          ],
        },
      },
    })
    .then(calendarSaveDates);
  await account.mutation(api.catalogue.saveCatalogue, {
    body: {
      id: 'holiday',
      revision: 1,
      name: 'Feriado',
      start: civilDate('2027-03-04'),
      end: civilDate('2027-03-04'),
      effect: 'exclude',
      category: 'feriado',
      evidence: 'Portaria nova',
      modalities: ['integrado'],
      active: true,
    },
  });
  const fresh = await account
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  const saved = await account
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: initial.version,
        catalogueRevision: fresh.currentCatalogueRevision,
        state: fresh.state,
      },
    })
    .then(calendarSaveDates);
  expect(saved.version).toBe(initial.version + 1);
  expect(saved.state.periods[0]!.end).toBe('2027-03-03');
  expect(saved.base.revision).toBe(2);
  expect(saved.base.events[0]!.start).toBe('2027-03-04');
});

test('a change in the documents table leaves a calendar under review and its parecer as they were', async () => {
  const { client, account, record, inspect } = await opened();
  // A calendar saved while documents were part of the base carries a stored list.
  const document = await client.run(async (ctx) => {
    const id = await ctx.db.insert('documents', {
      year: 2027,
      type: 'norma',
      title: 'Norma vigente',
      source: 'PROENS',
      hash: '1'.repeat(64),
      filename: 'norma.pdf',
      status: 'vigente',
      version: 1,
      createdAt: Date.now(),
    });
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id as Id<'calendars'>))
      .unique();
    const { _id, _creationTime, ...fields } = (await ctx.db.get(id))!;
    await ctx.db.patch(content!._id, { documentSnapshot: [{ id: _id, ...fields }] });
    return id;
  });
  await act(account, record.id, 'submit');
  const support = await account.query(api.reviews.review, { id: record.id });
  await account.mutation(api.reviews.saveReview, {
    id: record.id,
    body: {
      schemaVersion: 6 as const,
      submissionId: support.submission!.id,
      revision: 0,
      calendarVersion: 1,
      catalogueRevision: 1,
      baseIdentity: support.baseIdentity,
      rulesetVersion: support.rulesetVersion,
      conclusion: '',
      entries: reviewCriteriaFor(2027).map(({ id }) => ({
        id,
        status: 'PENDENTE' as const,
        notes: '',
        reviewed: false,
      })),
    },
  });
  await client.run((ctx) => ctx.db.patch(document, { status: 'arquivado' }));
  const fresh = await account
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  expect(fresh.currentCatalogueRevision).toBe(1);
  expect(inspectCalendar(fresh, fresh).compatible).toBe(true);
  const after = await account.query(api.reviews.review, { id: record.id });
  expect(after.stale).toBe(false);
  expect(after.baseCompatible).toBe(true);
  expect(after.baseIdentity).toBe(support.baseIdentity);
  const data = await inspect();
  const [submission] = await client.run((ctx) => ctx.db.query('calendarSubmissions').collect());
  expect(submission!.documentSnapshot.map((item) => item.id)).toEqual([document]);
  expect(data.reviews[0]!.documentSnapshot.map((item) => item.id)).toEqual([document]);
});

test('removing Teacher Day leaves its local adjustment inspectable and permits explicit resolution', async () => {
  const { teacherDayId } = await import('../fixtures/observances.ts');
  const fixture = await createNativeFixture({
    catalogue: {
      revision: 1,
      events: [
        {
          id: teacherDayId.slice(5),
          name: 'Dia do Professor',
          start: civilDate('2027-10-15'),
          end: civilDate('2027-10-15'),
          effect: 'exclude',
          category: 'feriado',
          evidence: 'Norma',
          modalities: ['integrado'],
          active: true,
        },
      ],
    },
  });
  const account = fixture.asClient('admin');
  const created = await account
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a!,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
    .then(calendarRecordDates);
  const adjusted = await account
    .mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: {
        version: 1,
        catalogueRevision: 1,
        state: { ...created.state, observanceDates: { 'teacher-day': civilDate('2027-10-14') } },
      },
    })
    .then(calendarSaveDates);
  await account.mutation(api.catalogue.saveCatalogue, {
    body: {
      id: teacherDayId.slice(5),
      revision: 1,
      name: 'Dia do Professor',
      start: civilDate('2027-10-15'),
      end: civilDate('2027-10-15'),
      effect: 'exclude',
      category: 'feriado',
      evidence: 'Norma',
      modalities: ['integrado'],
      active: false,
    },
  });
  const record = await account
    .query(api.calendars.calendar, { id: created.id })
    .then(calendarRecordDates);
  const assessment = inspectCalendar(record, record);
  expect(assessment.events.removed[0]!.id).toBe(teacherDayId);
  await expect(account.query(api.reviews.review, { id: created.id })).resolves.toMatchObject({
    calendar: { id: created.id },
  });
  const saved = await account
    .mutation(api.calendars.saveCalendar, {
      id: created.id,
      body: {
        version: adjusted.version,
        catalogueRevision: record.currentCatalogueRevision,
        state: { ...record.state, observanceDates: undefined },
      },
    })
    .then(calendarSaveDates);
  expect(saved.state.observanceDates?.['teacher-day']).toBeUndefined();
  expect(saved.base.events).toEqual([]);
});
