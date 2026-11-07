import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import type { MutationCtx } from '../../convex/_generated/server.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, saveReview, seedCourses } from '../helpers/lifecycle.ts';
import {
  storedCases,
  storedCatalogueRows,
  type StoredCase,
  type StoredSubmission,
} from '../helpers/stored-fixtures.ts';
import { retiredDateFields } from '../helpers/retired-fields.ts';

/**
 * A document of format 4 is refused by the storage validators, and clients built for an earlier
 * format are refused by `saveCalendar` and `saveReview`.
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

/**
 * The stored documents use synthetic names where the schema holds native IDs (users, documents,
 * files, the calendar). Those references become rows of the test database; everything else is the
 * stored value, unchanged.
 */
async function nativeReferences(
  ctx: MutationCtx,
  calendarId: Id<'calendars'>,
  userId: Id<'users'>,
  item: StoredCase,
) {
  const documentSnapshot = async (rows: Record<string, unknown>[]) => {
    const result = [];
    for (const { id: _id, storageId, createdBy, publishedBy, ...row } of rows) {
      const id = await ctx.db.insert('documents', {
        year: row.year,
        type: row.type,
        title: row.title,
        source: row.source,
        hash: row.hash,
        filename: row.filename,
        status: row.status,
        version: row.version,
        createdAt: row.createdAt,
      } as never);
      result.push({
        ...row,
        id,
        ...(storageId ? { storageId: await ctx.storage.store(new Blob(['pdf'])) } : {}),
        ...(createdBy ? { createdBy: userId } : {}),
        ...(publishedBy ? { publishedBy: userId } : {}),
      });
    }
    return result;
  };
  const submission = async ({ calendarId: _calendar, ...stored }: StoredSubmission) => ({
    ...stored,
    calendarId,
    submittedBy: { ...(stored.submittedBy as object), id: userId },
    documentSnapshot: await documentSnapshot(stored.documentSnapshot),
  });
  return {
    documentSnapshot: await documentSnapshot(item.content.documentSnapshot),
    submissions: await Promise.all(item.submissions.map(submission)),
  };
}

test('the stored fixtures are accepted by the schema', async () => {
  const { fixture, record, contentId } = await calendar();
  const calendarId = record.id as Id<'calendars'>;
  const userId = fixture.ids.users.admin!;
  const submissions = await fixture.client.run(async (ctx) => {
    let count = 0;
    for (const item of storedCases()) {
      const native = await nativeReferences(ctx, calendarId, userId, item);
      await ctx.db.patch(contentId, {
        state: item.content.state as never,
        catalogueRevision: item.content.catalogueRevision,
        institutionalSnapshot: item.content.institutionalSnapshot as never,
        documentSnapshot: native.documentSnapshot as never,
      });
      for (const submission of native.submissions) {
        await ctx.db.insert('calendarSubmissions', submission as never);
        count += 1;
      }
    }
    for (const row of storedCatalogueRows())
      await ctx.db.insert('institutionalEvents', row as never);
    return count;
  });
  expect(submissions).toBe(storedCases().flatMap((item) => item.submissions).length);
  expect(submissions).toBeGreaterThan(0);
});

test('the schema refuses documents of format 4', async () => {
  const { fixture, record, contentId } = await calendar();
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
  // A submission keeps a copy of the content: the same format 4 markers are refused there.
  const item = storedCases().find((stored) => stored.submissions.length > 0)!;
  const [submission] = await fixture.client.run(
    async (ctx) =>
      (await nativeReferences(ctx, record.id as Id<'calendars'>, fixture.ids.users.admin!, item))
        .submissions,
  );
  const [storedEvent] = submission!.state.events;
  const v4Submissions = [
    { ...submission, state: { ...submission!.state, schemaVersion: 4 } },
    ...retiredDateFields.map((field) => ({
      ...submission,
      state: { ...submission!.state, events: [{ ...storedEvent, [field]: 'include' }] },
    })),
  ];
  for (const document of v4Submissions)
    await expect(
      fixture.client.run((ctx) => ctx.db.insert('calendarSubmissions', document as never)),
    ).rejects.toThrow(/does not match|Validator|validator/);
  expect(await fixture.client.run((ctx) => ctx.db.get(contentId))).toEqual(before);
  expect(await fixture.client.run((ctx) => ctx.db.query('institutionalEvents').take(10))).toEqual(
    [],
  );
  expect(await fixture.client.run((ctx) => ctx.db.query('calendarSubmissions').take(10))).toEqual(
    [],
  );
});

test('a client built for an earlier format is refused by saveCalendar and saveReview', async () => {
  const { fixture, campus, record } = await calendar();
  const reviewer = fixture.asClient('admin');
  const earlier = {
    ...record.state,
    schemaVersion: 5,
    events: record.state.events.map(({ offers, ...event }) => ({
      ...event,
      scope: { offers, confirmed: true },
    })),
  };
  const body = (state: unknown) => ({
    version: record.version,
    catalogueRevision: record.catalogueRevision,
    state: state as typeof record.state & { year: number; campus: string },
  });
  await expect(
    campus.mutation(api.calendars.saveCalendar, { id: record.id, body: body(earlier) }),
  ).rejects.toThrow(/schemaVersion|Validator|validator/);
  const unchanged = await campus.query(api.calendars.calendar, { id: record.id });
  expect(unchanged.version).toBe(record.version);
  // The same content in the current format is accepted.
  await campus.mutation(api.calendars.saveCalendar, { id: record.id, body: body(record.state) });

  await seedCourses(fixture, record.id);
  await act(campus, record.id, 'submit');
  const support = await reviewer.query(api.reviews.review, { id: record.id });
  const { schemaVersion: _marker, ...oldBody } = {
    schemaVersion: 7 as const,
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
      body: { ...oldBody, schemaVersion: 5 } as never,
    }),
  ).rejects.toThrow(/schemaVersion|Validator|validator/);
  expect(await fixture.client.run((ctx) => ctx.db.query('reviews').take(10))).toEqual([]);
  // The current client sends the marker and saves.
  expect(await saveReview(reviewer, record.id)).toEqual({ revision: 1 });
});
