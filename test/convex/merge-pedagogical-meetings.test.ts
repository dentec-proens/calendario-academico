import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel';
import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { readyContent } from '../helpers/lifecycle.ts';

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
  await fixture.client.run(async (ctx) => {
    const row = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique())!;
    await ctx.db.patch(row._id, { state: readyContent() as never });
  });
  return { campus, id };
}

test('saving moves old meeting links to the council of the stage', async () => {
  const { campus, id } = await draftWithMeetings();
  const opened = calendarRecordDates(await campus.query(api.calendars.calendar, { id }));
  expect(meetingIds(opened.state).length).toBeGreaterThan(0);
  // A calendar back in editing, or a tab opened earlier, still sends the meeting links.
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
        version: opened.version,
        catalogueRevision: opened.catalogueRevision,
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
