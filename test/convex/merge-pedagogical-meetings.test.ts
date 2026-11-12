import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel';
import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { readyContent } from '../helpers/lifecycle.ts';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

type Fixture = Awaited<ReturnType<typeof createNativeFixture>>;
const meetingIds = (state: { events: { id: string; activity?: { activityId: string } }[] }) =>
  state.events.filter((e) => e.activity?.activityId === 'pedagogical-meeting').map((e) => e.id);

/** A 2027 draft saved before v11, with the meeting of each stage linked on its own. */
async function draftWithMeetings() {
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
  const content = await fixture.client.run(async (ctx) => {
    const row = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique())!;
    await ctx.db.patch(row._id, { state: readyContent() as never });
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
  const statuses = await fixture.client.query(internal.migrations.status, {});
  expect(
    statuses.find(({ name }) => name === 'migrations:mergePedagogicalMeetingLinks'),
  ).toMatchObject({ state: 'success', error: null });
}

test('a draft moves its meeting dates to the council of the stage, with no new version', async () => {
  const { fixture, read } = await draftWithMeetings();
  const before = await read();
  const moved = meetingIds(before.content.state);
  expect(moved.length).toBeGreaterThan(0);
  await migrate(fixture);
  const after = await read();
  expect(meetingIds(after.content.state)).toEqual([]);
  for (const id of moved) {
    const old = before.content.state.events.find((e) => e.id === id)!;
    expect(after.content.state.events.find((e) => e.id === id)).toEqual({
      ...old,
      activity: { ...old.activity!, activityId: 'council' },
    });
  }
  // Only the links change: the campus still hears about v11 and no version is created.
  expect(after.content.state.rulesetVersion).toBe(before.content.state.rulesetVersion);
  expect(after.calendar).toEqual(before.calendar);
});

test('a calendar out of editing and its submission stay as sent', async () => {
  const { fixture, id, read } = await draftWithMeetings();
  await fixture.client.run((ctx) => ctx.db.patch(id, { status: 'enviado' }));
  const before = await read();
  await migrate(fixture);
  expect(await read()).toEqual(before);
});

test('a tab opened before the migration saves its old links, moved to the council', async () => {
  const { fixture, campus, id } = await draftWithMeetings();
  const opened = calendarRecordDates(await campus.query(api.calendars.calendar, { id }));
  expect(meetingIds(opened.state).length).toBeGreaterThan(0);
  await migrate(fixture);
  const fresh = calendarRecordDates(await campus.query(api.calendars.calendar, { id }));
  // The old tab still sends the meeting links, with a change of its own.
  const edited = {
    ...opened.state,
    events: opened.state.events.map((e) =>
      e.id === meetingIds(opened.state)[0] ? { ...e, name: 'Reunião do 1º bimestre' } : e,
    ),
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
  expect(meetingIds(saved.state)).toEqual([]);
  expect(
    saved.state.events.find((e) => e.name === 'Reunião do 1º bimestre')?.activity,
  ).toMatchObject({
    activityId: 'council',
  });
});
