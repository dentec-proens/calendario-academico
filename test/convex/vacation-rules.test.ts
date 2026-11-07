import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { calendarRecordDates } from '../../web/shared/convex/calendar-dates.ts';
import { inspectCalendar } from '../../src/domain/calendar/base.ts';
import { rehearseCalendar } from '../../src/domain/calendar/rehearsal.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import type { CalendarContent, CalendarEvent } from '../../src/domain/calendar/model.ts';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, actAsIs, calendarStatus, readyContent, saveReview } from '../helpers/lifecycle.ts';

/** Consup 292 v10: vacations are required activities, and teachers have exactly 45 days. */
const sei = '23411.000001/2027-11';

const isActivity = (event: CalendarEvent, id: string) => event.activity?.activityId === id;

async function fixture(change: (state: CalendarContent) => CalendarContent = (state) => state) {
  const f = await createNativeFixture();
  const campus = f.asClient('campus-a');
  const admin = f.asClient('admin');
  const record = await campus
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: f.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' as const }],
      },
    })
    .then(calendarRecordDates);
  const id = record.id as Id<'calendars'>;
  await f.client.run(async (ctx) => {
    await ctx.db.patch(id, { courses: 'Curso sintético' });
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique();
    await ctx.db.patch(content!._id, { state: change(readyContent()) as never });
  });
  const stampRules = (version: string) =>
    f.client.run(async (ctx) => {
      const content = await ctx.db
        .query('calendarContents')
        .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
        .unique();
      await ctx.db.patch(content!._id, {
        state: { ...content!.state, rulesetVersion: version },
      });
    });
  return { ...f, campus, admin, id, stampRules };
}

const without = (activityId: string) => (state: CalendarContent) => ({
  ...state,
  events: state.events.filter((event) => !isActivity(event, activityId)),
});
const teacherEnd = (end: string) => (state: CalendarContent) => ({
  ...state,
  events: state.events.map((event) =>
    isActivity(event, 'teacher-vacation') ? { ...event, end: civilDate(end) } : event,
  ),
});

// Publication reads the content of the calendar, and readiness is the gate there.
test.each([
  ['44 dias', teacherEnd('2027-02-13')],
  ['sem férias escolares', without('school-vacation')],
])('a sent calendar with %s cannot be published', async (_name, change) => {
  const f = await fixture();
  await act(f.campus, f.id, 'submit');
  await saveReview(f.admin, f.id);
  await act(f.admin, f.id, 'conclude');
  await f.client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', f.id))
      .unique();
    const submission = await ctx.db
      .query('calendarSubmissions')
      .withIndex('by_calendarId_and_sequence', (q) => q.eq('calendarId', f.id))
      .unique();
    const state = change(content!.state as never);
    await ctx.db.patch(content!._id, { state } as never);
    const next = { ...content!, state };
    await ctx.db.patch(submission!._id, {
      state,
      contentHash: contentHash(next as never),
    } as never);
  });
  await expect(act(f.admin, f.id, 'publish', { sei })).rejects.toThrow(/pendências/);
  expect((await calendarStatus(f.admin, f.id)).status).toBe('revisado');
});

// Decision of 06/11/2026: the total must block the submission itself.
test.each([
  ['44 dias', teacherEnd('2027-02-13')],
  ['46 dias', teacherEnd('2027-02-15')],
])('a teacher total of %s cannot be submitted', async (_name, change) => {
  const f = await fixture(change);
  await expect(act(f.campus, f.id, 'submit')).rejects.toThrow(/45 dias/);
  expect((await calendarStatus(f.campus, f.id)).status).toBe('rascunho');
});

test.each([
  ['docentes', without('teacher-vacation'), /Férias docentes/],
  ['escolares', without('school-vacation'), /Férias escolares/],
])('a calendar without férias %s cannot be submitted', async (_name, change, message) => {
  const f = await fixture(change);
  await expect(actAsIs(f.campus, f.id, 'submit')).rejects.toThrow(message);
  expect((await calendarStatus(f.campus, f.id)).status).toBe('rascunho');
});

test('45 teacher days and a school period go from draft to published', async () => {
  const f = await fixture();
  await act(f.campus, f.id, 'submit');
  await saveReview(f.admin, f.id);
  await act(f.admin, f.id, 'conclude');
  await act(f.admin, f.id, 'publish', { sei });
  expect((await calendarStatus(f.admin, f.id)).status).toBe('vigente');
});

test('a calendar submitted under the rules before v10 needs a return', async () => {
  const f = await fixture();
  await act(f.campus, f.id, 'submit');
  await f.client.run((ctx) => ctx.db.patch(f.id, { status: 'em_revisao' }));
  await f.stampRules('consup-292-2027-v9');
  const record = await f.admin
    .query(api.calendars.calendar, { id: f.id })
    .then(calendarRecordDates);
  const assessment = inspectCalendar(record, record);
  expect(assessment.kind).toBe('rules');
  expect(assessment.compatible).toBe(false);
  await expect(act(f.admin, f.id, 'conclude')).rejects.toThrow('Devolva o calendário');
});

test('a published calendar under the rules before v10 stays as it was', async () => {
  const f = await fixture();
  await act(f.campus, f.id, 'submit');
  await saveReview(f.admin, f.id);
  await act(f.admin, f.id, 'conclude');
  await act(f.admin, f.id, 'publish', { sei });
  await f.stampRules('consup-292-2027-v9');
  const record = await f.admin
    .query(api.calendars.calendar, { id: f.id })
    .then(calendarRecordDates);
  expect(record.status).toBe('vigente');
  expect(record.state.rulesetVersion).toBe('consup-292-2027-v9');
  // Publishing froze the base: the release has nothing to return.
  expect(
    rehearseCalendar({ ...record, status: 'vigente', campus: 'A', year: 2027 } as never, {
      revision: 1,
      events: [],
    }),
  ).toEqual({ outcome: 'unaffected' });
});
