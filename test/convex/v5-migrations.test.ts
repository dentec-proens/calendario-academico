import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import type { Doc, Id } from '../../convex/_generated/dataModel.js';
import type { MutationCtx } from '../../convex/_generated/server';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { migrateCatalogueRow, migrateContent, migrateSubmission } from '../../convex/migrations.ts';
import { currentCatalogueRow, currentFormat } from '../../convex/lib/storageFormat.ts';
import {
  convertCatalogueEventV5,
  convertContentV5,
  provenScopeIds,
  provenScopesOfConverted,
} from '../../src/domain/calendar/migration/convert-v5.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { act, saveReview, seedCourses } from '../helpers/lifecycle.ts';
import { bindIds } from '../helpers/v4-storage.ts';
import { readOracle, v4CatalogueRows, v4Cases, type V4Case } from '../helpers/v4-fixtures.ts';

/**
 * Phase 2, step 17b of `docs/plans/2026-11-02-atividades-e-datas.md`: the migrations convert the
 * catalogue, the contents and the submissions, in that order, through the pure converter; a
 * submission converts state, snapshot and `contentHash` in one write. Clients built for format 4
 * are refused by `saveCalendar` and `saveReview`.
 */
type Fixture = Awaited<ReturnType<typeof createNativeFixture>>;
type Json = Record<string, unknown>;
type Table = 'institutionalEvents' | 'calendarContents' | 'calendarSubmissions';

const migrationNames = [
  'migrations:catalogueToV5',
  'migrations:contentsToV5',
  'migrations:submissionsToV5',
];

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

async function runMigrations(fixture: Fixture) {
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  return fixture.client.query(internal.migrations.status, {});
}

const withoutSystem = ({ _id, _creationTime, ...fields }: Json) => fields;
const offerKinds = (item: V4Case) =>
  [
    ...new Set(item.content.state.offers.map((offer) => offer.kind)),
  ] as Doc<'calendars'>['offerKinds'];

/**
 * Stores every frozen v4 document as a deployment before the migration has it, each calendar in
 * its own year, with the fingerprint each submission had when it was sent (computed over the
 * bound IDs). Returns what each document must become: the converter's result over the stored
 * document, with the submission's proven lists read from the content manifest.
 */
async function storeV4(fixture: Fixture, cases = v4Cases()) {
  return fixture.client.run(async (ctx) => {
    const bind = await bindIds(ctx, fixture.ids.campuses.a, fixture.ids.users.admin);
    const expected: { table: Table; id: string; value: Json }[] = [];
    for (const item of cases) {
      const calendar = { year: item.year, offerKinds: offerKinds(item), version: 7, updatedAt: 9 };
      const content = await bind(item.content, calendar);
      const submissions = [];
      for (const submission of item.submissions) {
        const copy = await bind(submission, calendar);
        submissions.push({ ...copy, contentHash: contentHash(copy as never) });
      }
      const conversion = convertContentV5(content, { year: item.year, submissions })!;
      expected.push({
        table: 'calendarContents',
        id: await ctx.db.insert('calendarContents', content as never),
        value: conversion.document,
      });
      for (const copy of submissions) {
        const converted = convertContentV5(copy, {
          year: item.year,
          source: 'submission',
          provenScopes: provenScopeIds(conversion.manifest, copy.sequence),
        })!.document;
        expected.push({
          table: 'calendarSubmissions',
          id: await ctx.db.insert('calendarSubmissions', copy as never),
          value: { ...converted, contentHash: contentHash(converted as never) },
        });
      }
    }
    for (const row of v4CatalogueRows())
      expected.push({
        table: 'institutionalEvents',
        id: await ctx.db.insert('institutionalEvents', row as never),
        value: convertCatalogueEventV5(row)!.document,
      });
    return expected;
  });
}

const readAll = (fixture: Fixture) =>
  fixture.client.run(async (ctx) => ({
    calendars: await ctx.db.query('calendars').take(200),
    contents: await ctx.db.query('calendarContents').take(200),
    submissions: await ctx.db.query('calendarSubmissions').take(200),
    catalogue: await ctx.db.query('institutionalEvents').take(200),
    reviews: await ctx.db.query('reviews').take(200),
    audit: await ctx.db.query('audit').take(200),
  }));

test('migrations:start converts catalogue, contents and submissions, and migrations:status concludes', async () => {
  const fixture = await createNativeFixture();
  const expected = await storeV4(fixture);
  const before = await readAll(fixture);
  expect(await fixture.client.query(internal.migrations.status, {})).toEqual(
    migrationNames.map((name) => expect.objectContaining({ name, state: 'unknown' })),
  );

  const statuses = await runMigrations(fixture);
  expect(statuses).toEqual(
    migrationNames.map((name, index) => ({
      name,
      state: 'success',
      processed: [before.catalogue, before.contents, before.submissions][index].length,
      error: null,
    })),
  );

  const after = await readAll(fixture);
  // Every document is exactly the converter's result, in place (same ID), with nothing removed.
  for (const { table, id, value } of expected) {
    const rows: Json[] =
      table === 'calendarContents'
        ? after.contents
        : table === 'calendarSubmissions'
          ? after.submissions
          : after.catalogue;
    expect(withoutSystem(rows.find((row) => row._id === id)!), `${table} ${id}`).toEqual(
      withoutSystem(value),
    );
  }
  expect(after.contents.map((row) => row._id)).toEqual(before.contents.map((row) => row._id));
  expect(after.submissions.map((row) => row._id)).toEqual(before.submissions.map((row) => row._id));
  // Every reader accepts the stored documents as format 5.
  for (const row of [...after.contents, ...after.submissions])
    expect(currentFormat(row).state.schemaVersion).toBe(5);
  for (const row of after.catalogue) expect(currentCatalogueRow(row)).not.toHaveProperty('kind');
  // The fingerprint of each submission is its own converted content, recalculated in the same
  // write, and keeps the relation with the current content: two equal, one different.
  const content = (calendarId: Id<'calendars'>) =>
    after.contents.find((row) => row.calendarId === calendarId)!;
  expect(after.submissions.map((row) => row.contentHash)).toEqual(
    after.submissions.map((row) => contentHash(row)),
  );
  expect(
    after.submissions.map((row) => row.contentHash === contentHash(content(row.calendarId))),
  ).toEqual(
    before.submissions.map(
      (row) =>
        row.contentHash ===
        contentHash(before.contents.find((c) => c.calendarId === row.calendarId)!),
    ),
  );
  expect(
    after.submissions.map((row) => row.contentHash === contentHash(content(row.calendarId))),
  ).toEqual([true, false, true]);
  // Representation only: calendars (version, `updatedAt`, status), submission versions and
  // decisions, reviews and audit are untouched.
  expect(after.calendars).toEqual(before.calendars);
  expect(
    after.submissions.map(({ contentVersion, decisions, sequence }) => ({
      contentVersion,
      decisions,
      sequence,
    })),
  ).toEqual(
    before.submissions.map(({ contentVersion, decisions, sequence }) => ({
      contentVersion,
      decisions,
      sequence,
    })),
  );
  expect(after.reviews).toEqual(before.reviews);
  expect(after.audit).toEqual(before.audit);
});

test('the submission migration reads the proven lists from the converted content', () => {
  // The manifest of the content conversion is gone when submissions convert; the converted
  // content gives the same lists, including the one proven by a submission (section 5.3).
  const proofs = v4Cases().flatMap((item) => {
    const conversion = convertContentV5(item.content, {
      year: item.year,
      submissions: item.submissions,
    })!;
    return item.submissions.map((submission) => ({
      manifest: provenScopeIds(conversion.manifest, submission.sequence),
      converted: provenScopesOfConverted(conversion.document, submission),
    }));
  });
  for (const { manifest, converted } of proofs) expect(converted).toEqual(manifest);
  expect(proofs.filter(({ manifest }) => manifest.length)).toHaveLength(1);
});

/** A database context whose writes fail, to prove a migration step only reads. */
function readOnly(ctx: MutationCtx): MutationCtx {
  const refuse = () => {
    throw new Error('escrita inesperada');
  };
  const db = new Proxy(ctx.db, {
    get: (target, key, receiver) =>
      ['insert', 'patch', 'replace', 'delete'].includes(String(key))
        ? refuse
        : Reflect.get(target, key, receiver),
  });
  return { ...ctx, db } as MutationCtx;
}

test('a rerun rewrites nothing: converted documents yield no write', async () => {
  const fixture = await createNativeFixture();
  await storeV4(fixture);
  await runMigrations(fixture);
  const converted = await readAll(fixture);

  // Starting again is a no-op, and so is restarting each migration from the beginning.
  expect((await runMigrations(fixture)).map(({ state }) => state)).toEqual(
    migrationNames.map(() => 'success'),
  );
  for (const migration of [
    internal.migrations.catalogueToV5,
    internal.migrations.contentsToV5,
    internal.migrations.submissionsToV5,
  ])
    await fixture.client.mutation(migration, { reset: true });
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await readAll(fixture)).toEqual(converted);

  // Each step over a converted document reads and never writes.
  await fixture.client.run(async (ctx) => {
    const reader = readOnly(ctx);
    for (const row of converted.catalogue) await migrateCatalogueRow(reader, row);
    for (const row of converted.contents) await migrateContent(reader, row);
    for (const row of converted.submissions) await migrateSubmission(reader, row);
  });
});

test('a blocking shape stops the migration with nothing written over it', async () => {
  const fixture = await createNativeFixture();
  const [item] = v4Cases().filter(
    (entry) => entry.submissions.length && entry.content.institutionalSnapshot.length,
  );
  const [first, ...rest] = item.content.institutionalSnapshot;
  // No path writes a link in a snapshot (section 6): a known shape that needs a decision.
  const blocked = {
    ...item,
    content: {
      ...item.content,
      institutionalSnapshot: [{ ...first, requirementId: 'stage-1:integrado' }, ...rest],
    },
  };
  const stored = await fixture.client.run(async (ctx) => {
    const bind = await bindIds(ctx, fixture.ids.campuses.a, fixture.ids.users.admin);
    const content = await bind(blocked.content, { year: blocked.year });
    return ctx.db.insert('calendarContents', content as never);
  });
  const before = await readAll(fixture);
  const statuses = await runMigrations(fixture);
  expect(statuses[1]).toMatchObject({ name: 'migrations:contentsToV5', state: 'failed' });
  expect(statuses[1].error).toMatch(/snapshot\.requirementId:present/);
  // The series stops there: the submissions migration never starts.
  expect(statuses[2].state).toBe('unknown');
  const after = await readAll(fixture);
  expect(after.contents.find((row) => row._id === stored)).toEqual(
    before.contents.find((row) => row._id === stored),
  );
  expect(after.submissions).toEqual(before.submissions);
});

test('a submission whose fingerprint is not its own content stops the migration', async () => {
  const fixture = await createNativeFixture();
  const [item] = v4Cases().filter((entry) => entry.submissions.length);
  const expected = await storeV4(fixture, [item]);
  const submissionId = expected.find(({ table }) => table === 'calendarSubmissions')!
    .id as Id<'calendarSubmissions'>;
  await fixture.client.run((ctx) => ctx.db.patch(submissionId, { contentHash: 'outro' }));
  const statuses = await runMigrations(fixture);
  expect(statuses[2]).toMatchObject({ name: 'migrations:submissionsToV5', state: 'failed' });
  expect(statuses[2].error).toMatch(/contentHash/);
  const stored = await fixture.client.run((ctx) => ctx.db.get(submissionId));
  expect(stored?.state.schemaVersion).toBe(4);
});

test('synchronizeBase and the identification keep their comparisons after the migration', async () => {
  const fixture = await createNativeFixture();
  const name = 'Ofertas independentes com base institucional';
  const item = v4Cases().find((entry) => entry.name === name)!;
  const expected = await storeV4(fixture, [item]);
  const contentId = expected.find(({ table }) => table === 'calendarContents')!.id;
  await runMigrations(fixture);
  const before = await readAll(fixture);
  const [calendar] = before.calendars;
  const campus = fixture.asClient('campus-a');
  const admin = fixture.asClient('admin');

  // The base identity is the one of the v4 oracle: reviews keep their currency.
  const oracle = readOracle<{ cases: { name: string; baseIdentity: string }[] }>().cases.find(
    (entry) => entry.name === name,
  )!;
  expect((await admin.query(api.reviews.review, { id: calendar._id })).baseIdentity).toBe(
    oracle.baseIdentity,
  );
  // The converted snapshot and catalogue still compare equal: nothing to synchronize.
  const record = await campus.query(api.calendars.calendar, { id: calendar._id });
  expect(record.catalogueRevision).toBe(record.currentCatalogueRevision);
  expect(record.institutionalEvents).toEqual(record.institutionalSnapshot);
  await campus.mutation(api.calendars.synchronizeBase, {
    id: calendar._id,
    version: calendar.version,
  });
  // The same identification keeps the content version and is not a change.
  const identity = { courses: '', classes: '', shifts: '', label: '' };
  await campus.mutation(api.calendars.updateCalendarIdentity, {
    id: calendar._id,
    expected: identity,
    body: identity,
  });
  const after = await readAll(fixture);
  expect(after.calendars).toEqual(before.calendars);
  expect(after.contents.find((row) => row._id === contentId)).toEqual(
    before.contents.find((row) => row._id === contentId),
  );
});

test('a client built for format 4 is refused by saveCalendar and saveReview', async () => {
  const fixture = await createNativeFixture();
  const campus = fixture.asClient('campus-a');
  const reviewer = fixture.asClient('admin');
  const record = await campus.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
    },
  });
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
  expect((await readAll(fixture)).reviews).toEqual([]);
  // The current client sends the marker (`schemaVersion: 5`) and saves.
  expect(await saveReview(reviewer, record.id)).toEqual({ revision: 1 });
});
