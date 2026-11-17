import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel';
import { civilDate } from '../../src/domain/civil-date.ts';
import type { CalendarEvent } from '../../src/domain/calendar/model.ts';
import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { onceLink } from '../helpers/activity-links.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { readyContent } from '../helpers/lifecycle.ts';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

type Fixture = Awaited<ReturnType<typeof createNativeFixture>>;
const retiredIds = (state: { events: { id: string; activity?: { activityId: string } }[] }) =>
  state.events
    .filter((e) => e.activity?.activityId === 'regular-admission-notice')
    .map((e) => e.id);

/** The regular notice a campus registered before v13, with a declared adjustment. */
const regularNotice: CalendarEvent = {
  id: 'regular-notice',
  name: 'Publicação dos editais do Processo Seletivo 2028',
  start: civilDate('2027-06-15'),
  end: civilDate('2027-06-15'),
  effect: 'note',
  category: 'prazo',
  offers: ['integrado'],
  activity: onceLink('regular-admission-notice'),
  notice: {
    publication: 'planned',
    admission: { type: 'regular', year: 2028, term: 'annual', destinations: [] },
  },
  deadlineAdjustment: { date: civilDate('2027-06-20') },
};

/** A 2027 draft saved before v13, with the regular notice of the Processo Seletivo linked. */
async function draftWithRegularNotice() {
  const fixture = await createNativeFixture();
  const campus = fixture.asClient('campus-a');
  const created = await campus.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a!,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
    },
  });
  const id = created.id as Id<'calendars'>;
  const ready = readyContent();
  const content = await fixture.client.run(async (ctx) => {
    const row = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique())!;
    await ctx.db.patch(row._id, {
      state: { ...ready, events: [...ready.events, regularNotice] } as never,
    });
    return row._id;
  });
  const read = () =>
    fixture.client.run(async (ctx) => ({
      content: (await ctx.db.get(content))!,
      calendar: (await ctx.db.get(id))!,
    }));
  return { fixture, campus, id, read };
}

async function migrate(fixture: Fixture) {
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await fixture.client.query(internal.migrations.status, {})).toMatchObject([
    { name: 'migrations:dropRetiredActivityLinks', state: 'success', error: null },
  ]);
}

test('a draft loses the dates of the retired regular notice, and nothing else, with no new version', async () => {
  const { fixture, read } = await draftWithRegularNotice();
  const before = await read();
  expect(retiredIds(before.content.state)).toEqual(['regular-notice']);
  await migrate(fixture);
  const after = await read();
  expect(after.content.state.events).toEqual(
    before.content.state.events.filter((event) => event.id !== 'regular-notice'),
  );
  expect(after.content.state.rulesetVersion).toBe(before.content.state.rulesetVersion);
  expect(after.calendar).toEqual(before.calendar);
  // Running it again changes nothing.
  await migrate(fixture);
  expect(await read()).toEqual(after);
});

test('a calendar out of editing keeps the date as sent', async () => {
  const { fixture, id, read } = await draftWithRegularNotice();
  await fixture.client.run((ctx) => ctx.db.patch(id, { status: 'enviado' }));
  const before = await read();
  await migrate(fixture);
  expect(await read()).toEqual(before);
});

test('a tab opened before the migration saves without bringing the date back', async () => {
  const { fixture, campus, id } = await draftWithRegularNotice();
  const opened = calendarRecordDates(await campus.query(api.calendars.calendar, { id }));
  expect(retiredIds(opened.state)).toEqual(['regular-notice']);
  await migrate(fixture);
  const fresh = calendarRecordDates(await campus.query(api.calendars.calendar, { id }));
  // The old tab still holds the date, with a change of its own elsewhere.
  const edited = {
    ...opened.state,
    events: opened.state.events.map((e, index) => (index === 0 ? { ...e, name: 'Renomeada' } : e)),
  };
  const saved = await campus
    .mutation(api.calendars.saveCalendar, {
      id,
      body: {
        version: fresh.version,
        catalogueRevision: fresh.catalogueRevision,
        state: JSON.parse(JSON.stringify(edited)) as typeof edited,
      },
    })
    .then(calendarSaveDates);
  expect(retiredIds(saved.state)).toEqual([]);
  expect(saved.state.events[0]?.name).toBe('Renomeada');
});
