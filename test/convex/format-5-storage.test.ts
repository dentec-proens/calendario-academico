import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, saveReview, seedCourses } from '../helpers/lifecycle.ts';
import { storedCases, storedCatalogueRows } from '../helpers/stored-fixtures.ts';
import { retiredDateFields } from '../helpers/retired-fields.ts';

/**
 * Contraction of the format 5 migration (plan `docs/plans/2026-11-02-atividades-e-datas.md`,
 * section 6, “Release”, step 7): the schema accepts only format 5. A document of format 4 is
 * refused by the storage validators, and clients built for format 4 are refused by `saveCalendar`
 * and `saveReview`.
 */
async function calendar() {
  const fixture = await createNativeFixture();
  const campus = fixture.asClient('campus-a');
  const record = await campus.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
    },
  });
  const contentId = await fixture.client.run(
    async (ctx) =>
      (await ctx.db
        .query('calendarContents')
        .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id as Id<'calendars'>))
        .unique())!._id,
  );
  return { fixture, campus, record, contentId };
}

test('the stored format 5 fixtures are accepted by the schema', async () => {
  const { fixture, contentId } = await calendar();
  await fixture.client.run(async (ctx) => {
    for (const item of storedCases())
      await ctx.db.patch(contentId, {
        state: item.content.state as never,
        institutionalSnapshot: item.content.institutionalSnapshot as never,
      });
    for (const row of storedCatalogueRows())
      await ctx.db.insert('institutionalEvents', row as never);
  });
});

test('the schema refuses documents of format 4', async () => {
  const { fixture, contentId } = await calendar();
  const before = await fixture.client.run((ctx) => ctx.db.get(contentId));
  const [event] = before!.state.events;
  const v4States = [
    { ...before!.state, schemaVersion: 4 },
    ...retiredDateFields.map((field) => ({
      ...before!.state,
      events: [{ ...event, [field]: 'include' }],
    })),
  ];
  for (const state of v4States)
    await expect(
      fixture.client.run((ctx) => ctx.db.patch(contentId, { state: state as never })),
    ).rejects.toThrow(/does not match|Validator|validator/);
  const [row] = storedCatalogueRows();
  const { effect, ...v4Row } = row;
  await expect(
    fixture.client.run((ctx) =>
      ctx.db.insert('institutionalEvents', { ...v4Row, kind: effect } as never),
    ),
  ).rejects.toThrow(/does not match|Validator|validator/);
  expect(await fixture.client.run((ctx) => ctx.db.get(contentId))).toEqual(before);
  expect(await fixture.client.run((ctx) => ctx.db.query('institutionalEvents').take(10))).toEqual(
    [],
  );
});

test('a client built for format 4 is refused by saveCalendar and saveReview', async () => {
  const { fixture, campus, record } = await calendar();
  const reviewer = fixture.asClient('admin');
  const v4State = {
    ...record.state,
    schemaVersion: 4,
    events: record.state.events.map(({ effect, scope, ...event }) => ({
      ...event,
      kind: effect,
      ...(scope.confirmed ? { offers: scope.offers } : {}),
    })),
  };
  const body = (state: unknown) => ({
    version: record.version,
    catalogueRevision: record.catalogueRevision,
    state: state as typeof record.state & { year: number; campus: string },
  });
  await expect(
    campus.mutation(api.calendars.saveCalendar, { id: record.id, body: body(v4State) }),
  ).rejects.toThrow(/schemaVersion|Validator|validator/);
  const unchanged = await campus.query(api.calendars.calendar, { id: record.id });
  expect(unchanged.version).toBe(record.version);
  // The same content in format 5 is accepted.
  await campus.mutation(api.calendars.saveCalendar, { id: record.id, body: body(record.state) });

  await seedCourses(fixture, record.id);
  await act(campus, record.id, 'submit');
  const support = await reviewer.query(api.reviews.review, { id: record.id });
  const { schemaVersion: _marker, ...oldBody } = {
    schemaVersion: 5 as const,
    rulesetVersion: support.rulesetVersion,
    baseIdentity: support.baseIdentity,
    revision: support.review?.revision ?? 0,
    calendarVersion: support.calendar.version,
    catalogueRevision: support.catalogueRevision,
    conclusion: support.initialConclusion,
    submissionId: support.submission?.id,
    entries: [],
  };
  // Without the format marker the review is refused before any rule, and nothing is written.
  await expect(
    reviewer.mutation(api.reviews.saveReview, { id: record.id, body: oldBody as never }),
  ).rejects.toThrow(/schemaVersion/);
  await expect(
    reviewer.mutation(api.reviews.saveReview, {
      id: record.id,
      body: { ...oldBody, schemaVersion: 4 } as never,
    }),
  ).rejects.toThrow(/schemaVersion|Validator|validator/);
  expect(await fixture.client.run((ctx) => ctx.db.query('reviews').take(10))).toEqual([]);
  // The current client sends the marker (`schemaVersion: 5`) and saves.
  expect(await saveReview(reviewer, record.id)).toEqual({ revision: 1 });
});
