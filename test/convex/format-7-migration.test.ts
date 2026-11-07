import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { migrateContent, migrateSubmission } from '../../convex/migrations.ts';
import {
  convertToFormat7,
  type Format6Document,
} from '../../src/domain/calendar/normalization/convert-format-7.ts';
import { createNativeFixture } from '../helpers/native-database.ts';

/**
 * The format 7 migration runs the pure converter over every stored document, in every status. Only
 * contents and submissions change: calendars and reviews stay as they were.
 */
type Json = Record<string, unknown>;
type Fixture = Awaited<ReturnType<typeof createNativeFixture>>;
interface Case {
  name: string;
  year: number;
  content: Json & { state: Json & { events: Json[]; offers: { id: string }[] } };
  submissions: (Json & { state: Json })[];
}

const frozen = (
  JSON.parse(
    readFileSync(new URL('../fixtures/stored/contents-format-6.json', import.meta.url), 'utf8'),
  ) as { cases: Case[] }
).cases;

/** Valid derived dates: the frozen documents hold only one, with a link of its own. */
function withVacations(item: Case): Case {
  const add = <S extends Json & { state: Json }>(document: S) => {
    const state = document.state as Case['content']['state'];
    return {
      ...document,
      state: {
        ...state,
        teacherVacations: { firstStart: '2027-01-04', firstEnd: '2027-01-18' },
        events: [
          ...state.events,
          {
            id: 'teacher-vacation-january',
            name: 'Férias docentes — 15 dias',
            start: '2027-01-04',
            end: '2027-01-18',
            effect: 'exclude',
            category: 'ferias',
            offers: state.offers.map((offer) => offer.id),
          },
        ],
      },
    };
  };
  return {
    ...item,
    content: add(item.content),
    submissions: item.submissions.map(add),
  };
}

const cases = frozen.filter(({ content }) => !content.state.teacherVacations).map(withVacations);
const withSubmission = cases.find((item) => item.submissions.length > 0)!;
const names = ['migrations:contentsToFormat7', 'migrations:submissionsToFormat7'];

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

async function run(fixture: Fixture) {
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  return fixture.client.query(internal.migrations.status, {});
}

/** Stores the frozen format 6 documents of `items`, each in its calendar, without documents. */
async function store(fixture: Fixture, items: readonly Case[], status = 'rascunho') {
  const campusId = fixture.ids.campuses.a! as Id<'campuses'>;
  const admin = { id: fixture.ids.users.admin! as Id<'users'>, name: 'Admin' };
  return fixture.client.run(async (ctx) => {
    const stored: { id: string; table: string; expected: Json; calendarId: string }[] = [];
    for (const item of items) {
      const calendarId = await ctx.db.insert('calendars', {
        campusId,
        year: item.year,
        offerKinds: ['integrado'],
        status,
        statusRevision: 0,
        courses: '',
        classes: '',
        shifts: '',
        version: 7,
        updatedAt: 9,
      } as never);
      const bound = (document: Json) => ({ ...document, calendarId, documentSnapshot: [] });
      const content = bound(item.content);
      const id = await ctx.db.insert('calendarContents', content as never);
      const convert = (document: Json) =>
        convertToFormat7(document as unknown as Format6Document).document as unknown as Json;
      stored.push({ id, table: 'calendarContents', expected: convert(content), calendarId });
      for (const submission of item.submissions) {
        const copy = {
          sequence: submission.sequence,
          submittedAt: 1,
          submittedBy: admin,
          submittedFrom: 'rascunho',
          contentVersion: submission.contentVersion,
          state: submission.state,
          catalogueRevision: submission.catalogueRevision,
          institutionalSnapshot: submission.institutionalSnapshot,
          offerKinds: ['integrado'],
          campusName: 'Campus A',
          decisions: [],
          ...bound({}),
        };
        const signed = { ...copy, contentHash: contentHash(copy as never) };
        const next = convert(signed);
        stored.push({
          id: await ctx.db.insert('calendarSubmissions', signed as never),
          table: 'calendarSubmissions',
          expected: { ...next, contentHash: contentHash(next as never) },
          calendarId,
        });
      }
    }
    return stored;
  });
}

const read = (fixture: Fixture, id: string) =>
  fixture.client.run(async (ctx) => {
    const { _id, _creationTime, ...fields } = (await ctx.db.get(id as never)) as unknown as Json;
    return fields;
  });

const insertReview = (fixture: Fixture, calendarId: string) =>
  fixture.client.run(async (ctx) => {
    const review = await ctx.db.insert('reviews', {
      calendarId,
      calendarVersion: 7,
      catalogueRevision: 1,
      revision: 1,
      source: 'x',
      documentSnapshot: [],
      entries: [],
      conclusion: '',
      processNumber: '',
      applicableNorm: '',
      reviewer: { id: fixture.ids.users.admin, name: 'Admin' },
      updatedAt: 1,
    } as never);
    const { _id, _creationTime, ...fields } = (await ctx.db.get(review))!;
    const version = await ctx.db.insert('reviewVersions', { ...fields, reviewId: review });
    return [review, version] as string[];
  });

test('the migration converts every document and keeps calendars and reviews', async () => {
  const fixture = await createNativeFixture();
  const stored = await store(fixture, cases);
  const calendarId = stored[0].calendarId;
  const before = await read(fixture, calendarId);
  const reviews = await insertReview(fixture, calendarId);
  const reviewsBefore = await Promise.all(reviews.map((id) => read(fixture, id)));

  const statuses = await run(fixture);
  expect(statuses.map(({ name, state, error }) => [name, state, error])).toEqual(
    names.map((name) => [name, 'success', null]),
  );
  for (const { id, expected } of stored) expect(await read(fixture, id)).toEqual(expected);
  expect(await read(fixture, calendarId)).toEqual(before);
  expect(await Promise.all(reviews.map((id) => read(fixture, id)))).toEqual(reviewsBefore);
});

test('the derived dates become linked dates, with nothing else changed in the date', async () => {
  const fixture = await createNativeFixture();
  const [content] = await store(fixture, [withSubmission]);
  const before = (await read(fixture, content.id)) as Case['content'];
  await run(fixture);
  const after = (await read(fixture, content.id)) as Case['content'];
  expect(after.state.schemaVersion).toBe(7);
  expect(after.state).not.toHaveProperty('teacherVacations');
  const id = 'teacher-vacation-january';
  const { activity, ...date } = after.state.events.find((event) => event.id === id)!;
  expect(activity).toEqual({ activityId: 'teacher-vacation' });
  expect(date).toEqual(before.state.events.find((event) => event.id === id));
});

test('a content and its submission that were the same keep the same fingerprint', async () => {
  const fixture = await createNativeFixture();
  const item = withSubmission;
  const stored = await store(fixture, [
    { ...item, submissions: [{ ...item.submissions[0], state: item.content.state }] },
  ]);
  const [content, submission] = stored;
  await fixture.client.run((ctx) =>
    ctx.db.patch(
      submission.id as never,
      {
        catalogueRevision: item.content.catalogueRevision,
        institutionalSnapshot: item.content.institutionalSnapshot,
        contentHash: contentHash({
          state: item.content.state,
          catalogueRevision: item.content.catalogueRevision,
          institutionalSnapshot: item.content.institutionalSnapshot,
          documentSnapshot: [],
        } as never),
      } as never,
    ),
  );
  await run(fixture);
  const hash = (await read(fixture, submission.id)).contentHash;
  expect(hash).toBe(contentHash((await read(fixture, content.id)) as never));
  expect(hash).toBe(contentHash((await read(fixture, submission.id)) as never));
});

test.each(['enviado', 'revisado', 'vigente', 'arquivado'])(
  'a calendar in %s converts too, with its status and versions as they were',
  async (status) => {
    const fixture = await createNativeFixture();
    const stored = await store(fixture, [withSubmission], status);
    const { calendarId } = stored[0];
    const before = await read(fixture, calendarId);
    const submission = stored.find((item) => item.table === 'calendarSubmissions')!;
    const contentVersion = (await read(fixture, submission.id)).contentVersion;
    await run(fixture);
    for (const { id, expected } of stored) expect(await read(fixture, id)).toEqual(expected);
    expect(await read(fixture, calendarId)).toEqual(before);
    expect((await read(fixture, submission.id)).contentVersion).toBe(contentVersion);
  },
);

test('a document already converted is not written again', async () => {
  const fixture = await createNativeFixture();
  const stored = await store(fixture, [withSubmission]);
  await run(fixture);
  await fixture.client.run(async (ctx) => {
    const patch = vi.spyOn(ctx.db, 'patch');
    for (const row of await ctx.db.query('calendarContents').collect())
      await migrateContent(ctx, row);
    for (const row of await ctx.db.query('calendarSubmissions').collect())
      await migrateSubmission(ctx, row);
    expect(patch).not.toHaveBeenCalled();
  });
  expect(stored.length).toBeGreaterThan(1);
});

test('intervals that diverge from the dates stop the migration with nothing written', async () => {
  const fixture = await createNativeFixture();
  const item = withSubmission;
  const [content] = await store(fixture, [{ ...item, submissions: [] }]);
  await fixture.client.run((ctx) =>
    ctx.db.patch(
      content.id as never,
      {
        state: {
          ...item.content.state,
          teacherVacations: { firstStart: '2027-01-05', firstEnd: '2027-01-18' },
        },
      } as never,
    ),
  );
  const before = await read(fixture, content.id);
  const [first] = await run(fixture);
  expect(first.state).toBe('failed');
  expect(first.error).toContain(content.id);
  expect(await read(fixture, content.id)).toEqual(before);
});

test('a submission whose stored hash is not its own stops with nothing written', async () => {
  const fixture = await createNativeFixture();
  const stored = await store(fixture, [withSubmission]);
  const submission = stored.find((item) => item.table === 'calendarSubmissions')!;
  await fixture.client.run((ctx) =>
    ctx.db.patch(submission.id as never, { contentHash: 'alheio' } as never),
  );
  const before = await read(fixture, submission.id);
  const statuses = await run(fixture);
  expect(statuses.find((item) => item.name === names[1])?.state).toBe('failed');
  expect(await read(fixture, submission.id)).toEqual(before);
});

test('a calendar still in format 6 is refused by the readers while the migration runs', async () => {
  const fixture = await createNativeFixture();
  const [content] = await store(fixture, [withSubmission]);
  const account = fixture.asClient('admin');
  await expect(
    account.query(api.calendars.calendar, { id: content.calendarId as Id<'calendars'> }),
  ).rejects.toThrow('O calendário está em atualização');
});
