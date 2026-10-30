import { expect, test } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { api, internal } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel';
import { createNativeFixture } from '../helpers/native-database.ts';

async function setup() {
  const fixture = await createNativeFixture();
  const actor = fixture.asClient('campus-a');
  const record = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
      courses: 'Sintético',
    },
  });
  return { ...fixture, actor, record };
}

test.each([2, 3])(
  'storage and the public save reject schema v%i before writing',
  async (schemaVersion) => {
    const { client, actor, record } = await setup();
    const unsupported = { ...record.state, schemaVersion };
    const rawSave = makeFunctionReference<
      'mutation',
      { id: Id<'calendars'>; body: Record<string, unknown> },
      unknown
    >('calendars:saveCalendar');
    await expect(
      actor.mutation(rawSave, {
        id: record.id,
        body: {
          version: record.version,
          catalogueRevision: record.catalogueRevision,
          state: unsupported,
        },
      }),
    ).rejects.toThrow(/Expected|Validation/);
    await expect(
      client.run(async (ctx) => {
        const content = (await ctx.db
          .query('calendarContents')
          .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
          .unique())!;
        await ctx.db.patch(content._id, { state: unsupported as never });
      }),
    ).rejects.toThrow(/Expected|Validation/);
    await expect(
      client.run((ctx) =>
        ctx.db.insert('calendarSnapshots', {
          state: unsupported as never,
          at: 1,
          catalogueRevision: record.catalogueRevision,
          institutionalEvents: record.institutionalSnapshot,
          documentSnapshot: [],
        }),
      ),
    ).rejects.toThrow(/Expected|Validation/);
    expect((await actor.query(api.calendars.calendar, { id: record.id })).state).toEqual(
      record.state,
    );
    expect(await client.run((ctx) => ctx.db.query('calendarSnapshots').take(10))).toEqual([]);
  },
);

test('calendar storage requires offerKinds and refuses the retired modalities field', async () => {
  const { client, record } = await setup();
  const fields = await client.run(async (ctx) => {
    const { _id, _creationTime: _created, ...fields } = (await ctx.db.get(record.id))!;
    return fields;
  });
  const { offerKinds, ...withoutKinds } = fields;
  for (const [unsupported, error] of [
    [withoutKinds, /Missing required field.*offerKinds/],
    [{ ...fields, modalities: offerKinds }, /Unexpected field.*modalities/],
  ] as const)
    await expect(
      client.run((ctx) => ctx.db.insert('calendars', unsupported as never)),
    ).rejects.toThrow(error);
  expect(await client.run((ctx) => ctx.db.query('calendars').take(10))).toHaveLength(1);
});

test('strict v4 storage never reruns the old backfill during maintenance', async () => {
  const { client } = await createNativeFixture();
  expect(await client.mutation(internal.migrations.start, {})).toBeNull();
  expect(await client.query(internal.migrations.status, {})).toEqual([
    {
      name: 'migrations:initializePresencialAndPurgeTrash20261030',
      state: 'success',
      processed: 0,
      error: null,
    },
  ]);
  expect(await client.run((ctx) => ctx.db.query('migrationReports').take(10))).toEqual([]);
  expect(await client.run((ctx) => ctx.db.query('migrationResults').take(10))).toEqual([]);
  expect(await client.run((ctx) => ctx.db.query('audit').take(10))).toEqual([]);
});
