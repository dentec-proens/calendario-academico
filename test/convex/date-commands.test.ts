import { expect, test } from 'vitest';
import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { api } from '../../convex/_generated/api.js';
import type { ContentState } from '../../convex/validators.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { rowLink } from '../helpers/activity-links.ts';
import { offerCalendarContent } from '../../src/domain/calendar/normalization/normalize.ts';
import {
  createCampusDate,
  planActivityDate,
  updateDate,
  type DateInput,
} from '../../src/domain/calendar/commands/events.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';
import { ivaiporaDraft } from '../fixtures/pending-links-2027.ts';

/**
 * Date commands at the Convex save boundary: `saveCalendar`
 * receives the whole state, so it keeps the contracts of `planActivityDate`, `createCampusDate` and
 * `updateDate` by date ID against the stored state.
 */
async function stored() {
  const fixture = ivaiporaDraft();
  const native = await createNativeFixture();
  const actor = native.asClient('campus-a');
  const created = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: native.ids.campuses.a,
        year: 2027,
        offers: fixture.offers.map(({ kind }) => ({
          kind,
          organization: 'anual' as const,
        })),
      },
    })
    .then(calendarRecordDates);
  await native.client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', created.id))
      .unique();
    if (!content) throw Error('Conteúdo esperado.');
    const state = offerCalendarContent({ ...fixture, rulesetVersion: rulesetVersion(fixture) });
    await ctx.db.patch(content._id, { state: state as ContentState });
  });
  const current = () =>
    actor.query(api.calendars.calendar, { id: created.id }).then(calendarRecordDates);
  const record = await current();
  const save = (state: typeof record.state, version: number) =>
    actor
      .mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version,
          catalogueRevision: record.catalogueRevision,
          // Match the HTTP JSON boundary, which omits undefined optional fields.
          state: JSON.parse(JSON.stringify(state)) as typeof state,
        },
      })
      .then(calendarSaveDates);
  return { record, save, current };
}

type Input = DateInput<Awaited<ReturnType<typeof stored>>['record']['state']>;

const campusDate = (changes: Partial<Input> = {}): Input => ({
  id: 'campus-meeting',
  name: 'Reunião do campus',
  start: civilDate('2027-05-04'),
  end: civilDate('2027-05-04'),
  effect: 'note',
  category: 'evento',
  scope: { offers: ['integrado'], confirmed: true },
  ...changes,
});

test('dates created and planned by the commands are saved with the link of their command', async () => {
  const { record, save } = await stored();
  const year = { ...record.state, year: 2027 };
  const activity = rowLink(year, 'family-meeting');
  const planned = planActivityDate(
    createCampusDate(record.state, campusDate(), []),
    activity,
    campusDate({ id: 'family-meeting-date', name: 'Encontro com as famílias' }),
    [],
  );
  const saved = await save(planned, record.version);
  const byId = (id: string) => saved.state.events.find((event) => event.id === id);
  expect(byId('campus-meeting')).not.toHaveProperty('activity');
  expect(byId('family-meeting-date')?.activity).toEqual(activity);
});

test('a saved date of the campus does not gain an activity by a save; updateDate keeps it unlinked', async () => {
  const { record, save, current } = await stored();
  const first = await save(createCampusDate(record.state, campusDate(), []), record.version);
  const activity = rowLink({ ...first.state, year: 2027 }, 'family-meeting');
  await expect(
    save(
      {
        ...first.state,
        events: first.state.events.map((event) =>
          event.id === 'campus-meeting' ? { ...event, activity } : event,
        ),
      },
      first.version,
    ),
  ).rejects.toThrow('Uma data do campus não passa a ter atividade vinculada');
  expect((await current()).state).toEqual(first.state);
  const renamed = await save(
    updateDate(first.state, campusDate({ name: 'Reunião revisada' }), []),
    first.version,
  );
  expect(renamed.state.events.find((event) => event.id === 'campus-meeting')).toEqual(
    expect.not.objectContaining({ activity: expect.anything() }),
  );
});

test('updateDate saves a date without generated activity with its recorded link', async () => {
  const { record, save } = await stored();
  const pending = record.state.events.find((event) => event.id === 'ivaipora-final-1')!;
  const { activity, ...fields } = pending;
  const saved = await save(
    updateDate(record.state, { ...fields, name: 'Resultado final revisado' }, []),
    record.version,
  );
  const date = saved.state.events.find((event) => event.id === pending.id)!;
  expect(date).toMatchObject({ name: 'Resultado final revisado', activity });
  expect(linksToReview({ ...saved.state, year: 2027 }).get(pending.id)).toBe('unclassified');
});
