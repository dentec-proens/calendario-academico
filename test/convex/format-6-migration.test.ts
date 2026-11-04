import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { internal } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { migrateContent, migrateSubmission } from '../../convex/migrations.ts';
import {
  convertToFormat6,
  type Format5Document,
} from '../../src/domain/calendar/normalization/convert-format-6.ts';
import { createNativeFixture } from '../helpers/native-database.ts';

/**
 * The format 6 migration runs the pure converter over every stored document, with the status guard
 * first and the reviews cleared last. Only contents and submissions change in `calendars` terms.
 */
type Json = Record<string, unknown>;
type Fixture = Awaited<ReturnType<typeof createNativeFixture>>;
interface Case {
  name: string;
  year: number;
  content: Json;
  submissions: Json[];
}

const cases = (
  JSON.parse(
    readFileSync(new URL('../fixtures/stored/contents-format-5.json', import.meta.url), 'utf8'),
  ) as { cases: Case[] }
).cases;

const names = [
  'migrations:format6StatusGuard',
  'migrations:contentsToFormat6',
  'migrations:submissionsToFormat6',
  'migrations:clearReviewVersions',
  'migrations:clearReviews',
];

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

async function run(fixture: Fixture) {
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  return fixture.client.query(internal.migrations.status, {});
}

/** Stores the frozen format 5 documents of `items`, each in its calendar, without documents. */
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
        convertToFormat6(document as unknown as Format5Document, item.year).document;
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

test('the migration converts every document, keeps calendars and clears the reviews', async () => {
  const fixture = await createNativeFixture();
  const stored = await store(fixture, cases);
  const calendarId = stored[0].calendarId;
  const before = await read(fixture, calendarId);
  await fixture.client.run(async (ctx) => {
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
    await ctx.db.insert('reviewVersions', { ...fields, reviewId: review });
  });

  const statuses = await run(fixture);
  expect(statuses.map(({ name, state, error }) => [name, state, error])).toEqual(
    names.map((name) => [name, 'success', null]),
  );
  for (const { id, expected } of stored) expect(await read(fixture, id)).toEqual(expected);
  expect(await read(fixture, calendarId)).toEqual(before);
  await fixture.client.run(async (ctx) => {
    expect(await ctx.db.query('reviews').take(1)).toEqual([]);
    expect(await ctx.db.query('reviewVersions').take(1)).toEqual([]);
  });
});

test('a document already converted is not written again', async () => {
  const fixture = await createNativeFixture();
  const stored = await store(fixture, cases.slice(0, 1));
  await run(fixture);
  await fixture.client.run(async (ctx) => {
    const replace = vi.spyOn(ctx.db, 'patch');
    for (const row of await ctx.db.query('calendarContents').collect())
      await migrateContent(ctx, row);
    for (const row of await ctx.db.query('calendarSubmissions').collect())
      await migrateSubmission(ctx, row);
    expect(replace).not.toHaveBeenCalled();
  });
  expect(stored.length).toBeGreaterThan(1);
});

test.each(['revisado', 'vigente', 'arquivado'])(
  'a calendar in %s stops the migration with nothing written',
  async (status) => {
    const fixture = await createNativeFixture();
    const [content] = await store(fixture, cases.slice(0, 1), status);
    const before = await read(fixture, content.id);
    const [guard] = await run(fixture);
    expect(guard.state).toBe('failed');
    expect(guard.error).toContain(status);
    expect(await read(fixture, content.id)).toEqual(before);
  },
);

test('a submission whose stored hash is not its own stops with nothing written', async () => {
  const fixture = await createNativeFixture();
  const stored = await store(fixture, cases.slice(0, 1));
  const submission = stored.find((item) => item.table === 'calendarSubmissions')!;
  await fixture.client.run((ctx) =>
    ctx.db.patch(submission.id as never, { contentHash: 'alheio' } as never),
  );
  const before = await read(fixture, submission.id);
  const statuses = await run(fixture);
  expect(statuses.find((item) => item.name === names[2])?.state).toBe('failed');
  expect(await read(fixture, submission.id)).toEqual(before);
});
