import { calendarRecordDates, calendarSaveDates } from '../../web/shared/convex/calendar-dates.ts';
import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import { createNativeFixture } from '../helpers/native-database';
import { initialCatalogue } from '../../src/domain/institution/catalogue';
import { publicServantDayId } from '../fixtures/observances';

test('server saves Servidor choices in snapshots, rejects other dates and protects catalogue identity', async () => {
  const fixture = await createNativeFixture({
    catalogue: {
      ...initialCatalogue(),
      events: initialCatalogue().events.map((event) => ({ ...event })),
    },
  });
  const actor = fixture.asClient('admin');
  const record = await actor
    .mutation(api.calendars.createCalendar, {
      body: {
        campusId: fixture.ids.campuses.a,
        year: 2027,
        offers: [{ kind: 'integrado', organization: 'anual' }],
      },
    })
    .then(calendarRecordDates);
  const saved = await actor
    .mutation(api.calendars.saveCalendar, {
      id: record.id,
      body: {
        version: record.version,
        catalogueRevision: record.catalogueRevision,
        state: { ...record.state, observanceDates: { 'public-servant-day': '2027-10-29' } },
      },
    })
    .then(calendarSaveDates);
  expect(saved.version).toBe(record.version + 1);
  expect(saved.base.events.find((event) => event.id === publicServantDayId)).toMatchObject({
    start: '2027-10-29',
    originalStart: '2027-10-28',
  });
  for (const date of ['2027-10-27', '2027-10-30', '2027-11-01', '2027-11-02'])
    await expect(
      actor
        .mutation(api.calendars.saveCalendar, {
          id: record.id,
          body: {
            version: saved.version,
            catalogueRevision: record.catalogueRevision,
            state: { ...saved.state, observanceDates: { 'public-servant-day': date } },
          },
        })
        .then(calendarSaveDates),
    ).rejects.toThrow('permitidas');
  await expect(
    actor.mutation(api.catalogue.saveCatalogue, {
      body: {
        id: publicServantDayId.slice(5),
        revision: record.catalogueRevision,
        name: 'Dia do Servidor Público',
        start: '2028-10-28',
        end: '2028-10-28',
        effect: 'exclude',
        category: 'recesso',
        evidence: 'Teste',
        modalities: ['integrado'],
        active: true,
      },
    }),
  ).rejects.toThrow('permitidas');
});
