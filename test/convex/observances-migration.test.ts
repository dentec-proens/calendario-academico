import { expect, test } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import { migrateObservanceState } from '../../convex/migrations';
import { archive } from '../../convex/calendars/record';
import { createNativeFixture } from '../helpers/native-database';
import { initialCatalogue } from '../../src/domain/institution/catalogue';
import { reviewIsCurrent } from '../../src/domain/calendar/base';
import { publicServantDayId } from '../fixtures/observances';

test('production migration converts contents, trash and snapshots without changing calendar/review identity', async () => {
  const fixture = await createNativeFixture({
    catalogue: {
      ...initialCatalogue(),
      events: initialCatalogue().events.map((event) => ({ ...event })),
    },
  });
  const actor = fixture.asClient('campus-a');
  const record = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
      courses: 'Migração sintética',
    },
  });
  const before = await fixture.client.run(async (ctx) => {
    const row = (await ctx.db.get(record.id))!;
    const content = (await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', row._id))
      .unique())!;
    const { observanceDates: _new, ...state } = content.state;
    await ctx.db.patch(content._id, { state: { ...state, teacherDayDate: '2027-10-15' } });
    await archive(ctx, row, (await ctx.db.get(content._id))!);
    await ctx.db.patch(row._id, { deletedAt: 123 });
    return {
      row: await ctx.db.get(row._id),
      content: await ctx.db.get(content._id),
      snapshot: (await ctx.db.query('calendarSnapshots').take(10))[0],
      versions: await ctx.db.query('calendarVersions').take(10),
    };
  });
  for (let pass = 0; pass < 2; pass++) {
    await fixture.client.mutation(internal.migrations.migrateContentObservances20261030, {
      cursor: null,
      dryRun: false,
    });
    await fixture.client.mutation(internal.migrations.migrateSnapshotObservances20261030, {
      cursor: null,
      dryRun: false,
    });
  }
  const after = await fixture.client.run(async (ctx) => ({
    row: await ctx.db.get(record.id),
    content: await ctx.db.get(before.content!._id),
    snapshot: await ctx.db.get(before.snapshot._id),
    versions: await ctx.db.query('calendarVersions').take(10),
  }));
  expect(after.row).toEqual(before.row);
  expect(after.versions).toEqual(before.versions);
  expect(after.content).toEqual({
    ...before.content,
    state: { ...migrateObservanceState(before.content!.state) },
  });
  expect(after.snapshot).toEqual({
    ...before.snapshot,
    state: { ...migrateObservanceState(before.snapshot.state) },
  });
  expect(after.content?.state).not.toHaveProperty('teacherDayDate');
  expect(after.content?.state.observanceDates).toEqual({ 'teacher-day': '2027-10-15' });
  const review = {
    calendarVersion: before.row!.version,
    catalogueRevision: before.content!.catalogueRevision,
    rulesetVersion: before.content!.state.rulesetVersion,
  };
  expect(
    reviewIsCurrent(review, after.row!.version, {
      revision: after.content!.catalogueRevision,
      rulesetVersion: after.content!.state.rulesetVersion,
    }),
  ).toBe(true);
});

test('representation converter is idempotent and refuses conflicting dual fields', () => {
  expect(migrateObservanceState({ observanceDates: { 'teacher-day': '2027-10-13' } })).toBeNull();
  expect(() =>
    migrateObservanceState({
      teacherDayDate: '2027-10-13',
      observanceDates: { 'teacher-day': '2027-10-14' },
    }),
  ).toThrow('divergentes');
});

test('server saves Servidor choices in snapshots, rejects other dates and protects catalogue identity', async () => {
  const fixture = await createNativeFixture({
    catalogue: {
      ...initialCatalogue(),
      events: initialCatalogue().events.map((event) => ({ ...event })),
    },
  });
  const actor = fixture.asClient('admin');
  const record = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
      courses: 'Observâncias sintéticas',
    },
  });
  const saved = await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: record.version,
      catalogueRevision: record.catalogueRevision,
      state: { ...record.state, observanceDates: { 'public-servant-day': '2027-10-29' } },
    },
  });
  expect(saved.version).toBe(record.version + 1);
  expect(saved.base.events.find((event) => event.id === publicServantDayId)).toMatchObject({
    start: '2027-10-29',
    originalStart: '2027-10-28',
  });
  for (const date of ['2027-10-27', '2027-10-30', '2027-11-01', '2027-11-02'])
    await expect(
      actor.mutation(api.calendars.saveCalendar, {
        id: record.id,
        body: {
          version: saved.version,
          catalogueRevision: record.catalogueRevision,
          state: { ...saved.state, observanceDates: { 'public-servant-day': date } },
        },
      }),
    ).rejects.toThrow('permitidas');
  await expect(
    actor.mutation(api.catalogue.saveCatalogue, {
      body: {
        id: publicServantDayId.slice(5),
        revision: record.catalogueRevision,
        name: 'Dia do Servidor Público',
        start: '2028-10-28',
        end: '2028-10-28',
        kind: 'exclude',
        category: 'recesso',
        evidence: 'Teste',
        modalities: ['integrado'],
        active: true,
      },
    }),
  ).rejects.toThrow('permitidas');
});
