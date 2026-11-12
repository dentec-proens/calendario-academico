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
    },
  });
  return { ...fixture, actor, record };
}

test.each([2, 3, 4])(
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
    expect((await actor.query(api.calendars.calendar, { id: record.id })).state).toEqual(
      record.state,
    );
  },
);

test('calendar storage requires offerKinds', async () => {
  const { client, record } = await setup();
  const fields = await client.run(async (ctx) => {
    const { _id, _creationTime: _created, ...fields } = (await ctx.db.get(record.id))!;
    return fields;
  });
  const { offerKinds: _offerKinds, ...withoutKinds } = fields;
  await expect(
    client.run((ctx) => ctx.db.insert('calendars', withoutKinds as never)),
  ).rejects.toThrow(/Missing required field.*offerKinds/);
  expect(await client.run((ctx) => ctx.db.query('calendars').take(10))).toHaveLength(1);
});

test('the offers storage never reruns the old backfill during maintenance', async () => {
  const { client } = await createNativeFixture();
  expect(await client.mutation(internal.migrations.start, {})).toBeNull();
  expect(await client.query(internal.migrations.status, {})).toEqual([]);
  expect(await client.run((ctx) => ctx.db.query('audit').take(10))).toEqual([]);
});
