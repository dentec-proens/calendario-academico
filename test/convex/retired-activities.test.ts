import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel';
import { civilDate } from '../../src/domain/civil-date.ts';
import type { CalendarEvent } from '../../src/domain/calendar/model.ts';
import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { onceLink } from '../helpers/activity-links.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { readyContent } from '../helpers/lifecycle.ts';

const retiredIds = (state: { events: { id: string; activity?: { activityId: string } }[] }) =>
  state.events
    .filter((e) => e.activity?.activityId === 'regular-admission-notice')
    .map((e) => e.id);

/** The regular notice a campus registered before v13. */
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
};

/** A 2027 draft saved before v13, with the regular notice of the Processo Seletivo linked. */
async function draftWithRegularNotice() {
  const fixture = await createNativeFixture();
  const campus = fixture.asClient('campus-a');
  const created = await campus.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a!,
      year: 2027,
      label: 'Cursos integrados',
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
  return { campus, id, content };
}

test('a saved date of a retired activity leaves with the next save', async () => {
  const { campus, id } = await draftWithRegularNotice();
  const opened = calendarRecordDates(await campus.query(api.calendars.calendar, { id }));
  expect(retiredIds(opened.state)).toEqual(['regular-notice']);
  // A calendar back in editing, or a tab opened before the migration, still holds the date.
  const edited = {
    ...opened.state,
    events: opened.state.events.map((e, index) => (index === 0 ? { ...e, name: 'Renomeada' } : e)),
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
  expect(retiredIds(saved.state)).toEqual([]);
  expect(saved.state.events[0]?.name).toBe('Renomeada');
});
