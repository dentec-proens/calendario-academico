import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { expect, test } from 'vitest';
import { definedStage } from '../helpers/activity-links.ts';
import { api } from '../../convex/_generated/api.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { preserveSubmission } from '../helpers/lifecycle.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';

test('Convex includes a complete new offer atomically and preserves the earlier version scope', async () => {
  const fixture = await createNativeFixture(),
    actor = fixture.asClient('campus-a');
  const record = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'posgraduacao', organization: 'anual' }],
      },
    })
    .then(calendarRecordDates);
  const submitted = await preserveSubmission(fixture, record.id);
  const offers: typeof record.state.offers = [
    ...record.state.offers,
    {
      id: 'integrado',
      kind: 'integrado',
      delivery: 'a-conferir',
      organization: 'anual',
      stages: { status: 'defined', perTerm: 2 },
    },
  ];
  const state = {
    ...record.state,
    offers,
    rulesetVersion: rulesetVersion({ year: 2027, offers }),
    periods: [
      {
        id: 'integrated',
        name: 'Anual integrado',
        start: '2027-03-01',
        end: '2027-03-26',
        association: {
          status: 'defined' as const,
          offers: ['integrado'],
          term: 'annual' as const,
        },
      },
    ],
    events: [0, 1].map((index) => ({
      id: `stage-${index + 1}`,
      name: `${index + 1}ª etapa`,
      activity: definedStage('stage', 'integrado', 'annual', index + 1),
      offers: ['integrado'],
      start: index ? '2027-03-15' : '2027-03-01',
      end: index ? '2027-03-26' : '2027-03-12',
      effect: 'note' as const,
    })),
  };
  const saved = await actor
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: { version: record.version, catalogueRevision: record.catalogueRevision, state },
    })
    .then(calendarSaveDates);
  const loaded = await actor
    .query(api.calendars.calendar, { id: record.id })
    .then(calendarRecordDates);
  expect(saved.version).toBe(record.version + 1);
  expect(loaded.offerKinds).toEqual(['integrado', 'posgraduacao']);
  expect(loaded.state.offers).toEqual(offers);
  expect(loaded.state.periods).toEqual(saved.state.periods);
  expect(loaded.state.events).toEqual(saved.state.events);
  const previous = await submitted();
  expect(previous.state.schemaVersion).toBe(7);
  if (previous.state.schemaVersion !== 7) throw Error('Snapshot esperado.');
  expect(previous.state.offers.map((offer) => offer.id)).toEqual(['posgraduacao']);
  expect(previous.state.periods).toEqual([]);
  for (const changed of [
    { ...loaded.state, offers: loaded.state.offers.filter((offer) => offer.id === 'integrado') },
    {
      ...loaded.state,
      offers: [
        ...offers,
        {
          id: 'graduacao',
          kind: 'graduacao' as const,
          delivery: 'a-conferir' as const,
          organization: 'anual' as const,
        },
      ],
    },
    { ...loaded.state, year: 2028 },
  ]) {
    await expect(
      actor
        .mutation(api.calendars.saveCalendar, {
          id: record.id,
          body: {
            version: loaded.version,
            catalogueRevision: loaded.catalogueRevision,
            state: changed,
          },
        })
        .then(calendarSaveDates),
    ).rejects.toThrow();
    expect(
      (await actor.query(api.calendars.calendar, { id: record.id }).then(calendarRecordDates))
        .version,
    ).toBe(loaded.version);
  }
});
