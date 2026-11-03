import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api.js';
import type { Doc, Id } from '../../convex/_generated/dataModel.js';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { migrations } from '../../convex/migrations.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';
import type { AssessmentSettings } from '../../src/domain/calendar/model.ts';
import { act } from '../helpers/lifecycle.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { v4Cases, type V4Case, type V4Content } from '../helpers/v4-fixtures.ts';
import { expectedOracle, oracleValues, recordedOracle } from '../helpers/v4-oracle.ts';
import {
  migrationNames,
  readAll,
  runMigrations,
  storeV4,
  withoutSystem,
  type Fixture,
} from '../helpers/v5-migration.ts';

/**
 * Phase 2, step 18 of `docs/plans/2026-11-02-atividades-e-datas.md` (section 6, “Provas”, and
 * section 9, “Conversão”): local proofs of the migration over the frozen v4 documents, in
 * `convex-test`. Step 17b already proves the full run, the rerun without writes, the blocking
 * shape and the foreign `contentHash` (`v5-migrations.test.ts`); these prove the interruption and
 * resumption of the batches, the refusal of writes while the conversion runs, the representation
 * kept (versions, authorship, reviews and their currency, statuses, base identity), the one to one
 * correspondence of the dates and the oracle values over the documents the migration stored.
 */
type Json = Record<string, unknown>;
const commit = 'f'.repeat(40);

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

const status = (fixture: Fixture) => fixture.client.query(internal.migrations.status, {});

/** Runs the scheduled batches one at a time until `stop` holds for the statuses. */
async function advanceUntil(
  fixture: Fixture,
  stop: (statuses: Awaited<ReturnType<typeof status>>) => boolean,
) {
  for (let step = 0; step < 100; step++) {
    const statuses = await status(fixture);
    if (stop(statuses)) return statuses;
    vi.runOnlyPendingTimers();
    await fixture.client.finishInProgressScheduledFunctions();
  }
  throw new Error('A migração não chegou ao ponto esperado.');
}

type Stored = Awaited<ReturnType<typeof readAll>>;
const rowsOf = (all: Stored, table: string): Json[] =>
  table === 'calendarContents'
    ? all.contents
    : table === 'calendarSubmissions'
      ? all.submissions
      : all.catalogue;

function expectConverted(after: Stored, expected: Awaited<ReturnType<typeof storeV4>>) {
  for (const { table, id, value } of expected)
    expect(
      withoutSystem(rowsOf(after, table).find((row) => row._id === id)!),
      `${table} ${id}`,
    ).toEqual(withoutSystem(value));
}

const isV5 = (row: { state: { schemaVersion: number } }) => row.state.schemaVersion === 5;

test('batches canceled between documents resume where they stopped, converting each once', async () => {
  const fixture = await createNativeFixture();
  const expected = await storeV4(fixture);
  const before = await readAll(fixture);
  await fixture.client.mutation(internal.migrations.start, {});
  const reached = await advanceUntil(fixture, (statuses) => statuses[1]!.processed >= 5);
  await fixture.client.run((ctx) => migrations.cancel(ctx, internal.migrations.contentsToV5));
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);

  // Interrupted between batches of one document: the converted contents are exactly the
  // processed ones, each the converter's result; the others are still the stored v4 documents,
  // and the submissions never started.
  const interrupted = await status(fixture);
  const processed = interrupted[1]!.processed;
  expect(processed).toBeGreaterThanOrEqual(reached[1]!.processed);
  expect(processed).toBeLessThan(before.contents.length);
  expect(interrupted.map(({ state }) => state)).toEqual(['success', 'canceled', 'unknown']);
  const partial = await readAll(fixture);
  expect(partial.contents.filter(isV5)).toHaveLength(processed);
  for (const row of partial.contents) {
    const stored = isV5(row)
      ? expected.find(({ id }) => id === row._id)!.value
      : before.contents.find(({ _id }) => _id === row._id)!;
    expect(withoutSystem(row)).toEqual(withoutSystem(stored));
  }
  expect(partial.submissions).toEqual(before.submissions);

  // Starting the series again resumes from the cursor: the processed count reaches the number
  // of contents instead of counting the converted ones twice.
  const resumed = await runMigrations(fixture);
  expect(resumed).toEqual(
    migrationNames.map((name, index) => ({
      name,
      state: 'success',
      processed: [before.catalogue, before.contents, before.submissions][index]!.length,
      error: null,
    })),
  );
  expectConverted(await readAll(fixture), expected);
});

test('a batch that fails stops the series and resumes after the document is corrected', async () => {
  const fixture = await createNativeFixture();
  const expected = await storeV4(fixture);
  const submissions = expected.filter(({ table }) => table === 'calendarSubmissions');
  expect(submissions).toHaveLength(3);
  const failing = submissions[1]!.id as Id<'calendarSubmissions'>;
  const original = await fixture.client.run((ctx) => ctx.db.get(failing));
  await fixture.client.run((ctx) => ctx.db.patch(failing, { contentHash: 'outro' }));

  const stopped = await runMigrations(fixture);
  expect(stopped.map(({ state }) => state)).toEqual(['success', 'success', 'failed']);
  const partial = await readAll(fixture);
  // The submission before it is converted, the failing one and the next are untouched.
  expect(partial.submissions.map(isV5)).toEqual([true, false, false]);

  // The owner corrects the document outside the migration; the series resumes from it.
  await fixture.client.run((ctx) => ctx.db.patch(failing, { contentHash: original!.contentHash }));
  const resumed = await runMigrations(fixture);
  expect(resumed.map(({ state }) => state)).toEqual(['success', 'success', 'success']);
  expect(resumed[2]!.processed).toBe(submissions.length);
  expectConverted(await readAll(fixture), expected);
});

test('writes during the conversion are refused and nothing lands on a document', async () => {
  const fixture = await createNativeFixture();
  const expected = await storeV4(fixture);
  await fixture.client.mutation(internal.migrations.start, {});
  await advanceUntil(fixture, (statuses) => statuses[1]!.processed >= 2);
  await fixture.client.run((ctx) => migrations.cancel(ctx, internal.migrations.contentsToV5));
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  const partial = await readAll(fixture);
  const converted = partial.contents.find(isV5)!;
  const stored = partial.contents.find((row) => !isV5(row))!;
  const campus = fixture.asClient('campus-a');
  const body = (row: { calendarId: Id<'calendars'>; catalogueRevision: number }) => {
    const value = expected.find(
      ({ table, value }) => table === 'calendarContents' && value.calendarId === row.calendarId,
    )!;
    return {
      version: 7,
      catalogueRevision: row.catalogueRevision,
      state: {
        ...(value.value.state as Json),
        year: value.item!.year,
        campus: 'A',
      } as never,
    };
  };
  const save = (row: Doc<'calendarContents'>) =>
    campus.mutation(api.calendars.saveCalendar, { id: row.calendarId, body: body(row) });
  const identity = { courses: '', classes: '', shifts: '', label: '' };
  const identify = (row: Doc<'calendarContents'>) =>
    campus.mutation(api.calendars.updateCalendarIdentity, {
      id: row.calendarId,
      expected: identity,
      body: { ...identity, courses: 'Outro curso' },
    });

  // Even before the maintenance, a document still in format 4 refuses the writes that read it
  // with the maintenance answer (503) of the expansion.
  // (The identification lives in `calendars`, outside the converted documents, and only the
  // maintenance below refuses it.)
  await expect(save(stored)).rejects.toThrow(/manutenção/);
  await expect(act(campus, stored.calendarId, 'submit')).rejects.toThrow(/manutenção/);
  expect(await readAll(fixture)).toEqual(partial);

  // During the release window the maintenance refuses every write, converted or not, while the
  // migration (internal, outside the clients' path) goes on.
  await fixture.client.mutation(internal.operations.pause, { commit });
  for (const row of [converted, stored]) {
    await expect(save(row)).rejects.toThrow(/manutenção/);
    await expect(identify(row)).rejects.toThrow(/manutenção/);
    await expect(act(campus, row.calendarId, 'submit')).rejects.toThrow(/manutenção/);
  }
  expect(await readAll(fixture)).toEqual(partial);
  expect((await runMigrations(fixture)).map(({ state }) => state)).toEqual([
    'success',
    'success',
    'success',
  ]);
  expectConverted(await readAll(fixture), expected);
  await fixture.client.mutation(internal.operations.resume, { commit });
});

/** Cases with a submission, each given the status the release must keep. */
const reviewed: Record<string, Doc<'calendars'>['status']> = {
  'Rascunho Ivaiporã (seção 11)': 'revisado',
  'Acréscimo de oferta materializa a abrangência': 'vigente',
  'Vínculo semestral legado em 2027 só anual, com documentos': 'em_revisao',
};

test('the conversion keeps versions, authorship, statuses, reviews and their currency', async () => {
  const fixture = await createNativeFixture();
  const cases = v4Cases().filter((item) => item.name in reviewed);
  expect(cases).toHaveLength(3);
  // Without the catalogue and with the bound documents archived, the current base of a calendar
  // not yet published is empty, as the snapshot of the frozen draft; a published one reads its
  // own snapshot. Either way the base of a current review is the one the oracle recorded the v4
  // identity of.
  const expected = await storeV4(
    fixture,
    cases,
    (item) => ({
      status: reviewed[item.name],
      statusRevision: 3,
      ...(reviewed[item.name] === 'vigente' ? { publishedAt: 11 } : {}),
    }),
    { catalogue: false },
  );
  const oracle = recordedOracle().cases;
  // Each calendar points at its submission, has a creation and a save in the audit, and a review
  // of that submission: current for the reviewed and published ones (version, revision, ruleset
  // and the base identity the v4 code computed), stale (older version) for the one in review.
  const reviews = await fixture.client.run(async (ctx) => {
    for (const document of await ctx.db.query('documents').take(20))
      await ctx.db.patch(document._id, { status: 'arquivado' });
    const ids: { name: string; calendarId: Id<'calendars'>; stale: boolean }[] = [];
    for (const item of cases) {
      const submission = expected.find(
        ({ table, item: from }) => table === 'calendarSubmissions' && from?.name === item.name,
      )!;
      const content = expected.find(
        ({ table, item: from }) => table === 'calendarContents' && from?.name === item.name,
      )!.value as unknown as V4Content & { calendarId: Id<'calendars'> };
      const calendarId = content.calendarId;
      await ctx.db.patch(calendarId, {
        currentSubmissionId: submission.id as Id<'calendarSubmissions'>,
        ...(reviewed[item.name] === 'vigente'
          ? {
              publishedSubmissionId: submission.id as Id<'calendarSubmissions'>,
              publishedBy: fixture.ids.users.admin,
            }
          : {}),
      });
      for (const [action, at, version] of [
        ['CREATE_CALENDAR', 1, 1],
        ['SAVE_CALENDAR', 9, 7],
      ] as const)
        await ctx.db.insert('audit', {
          at,
          action,
          actorId: fixture.ids.users.admin,
          target: { type: 'calendar', id: calendarId },
          campusId: fixture.ids.campuses.a,
          calendarId,
          version,
        });
      const stale = reviewed[item.name] === 'em_revisao';
      const fields = {
        rulesetVersion: rulesetVersion({
          ...(content.state as unknown as AssessmentSettings),
          year: item.year,
        }),
        submissionId: submission.id as Id<'calendarSubmissions'>,
        baseIdentity: oracle.find((entry) => entry.name === item.name)!.baseIdentity,
        calendarId,
        calendarVersion: stale ? 6 : 7,
        catalogueRevision: content.catalogueRevision,
        revision: 1,
        source: 'native',
        documentSnapshot: [],
        entries: [],
        conclusion: 'Sem ressalvas.',
        processNumber: '1',
        applicableNorm: 'Resolução 292/2026',
        reviewer: { id: fixture.ids.users.admin, name: 'Admin' },
        updatedAt: 10,
      };
      const reviewId = await ctx.db.insert('reviews', fields);
      await ctx.db.insert('reviewVersions', { reviewId, ...fields });
      ids.push({ name: item.name, calendarId, stale });
    }
    return ids;
  });
  const admin = fixture.asClient('admin');
  // What clients read without the documents (metadata), before and after.
  const metadata = async () => ({
    calendars: await admin.query(api.calendars.calendarPage, {
      paginationOpts: { numItems: 20, cursor: null },
    }),
    queues: await Promise.all(
      (['revisado', 'vigente', 'em_revisao'] as const).map((value) =>
        admin.query(api.reviews.reviewQueue, {
          status: value,
          paginationOpts: { numItems: 20, cursor: null },
        }),
      ),
    ),
  });
  const before = await readAll(fixture);
  const shown = await metadata();
  expect(
    shown.calendars.page.map((row) => [row.status, row.createdByName, row.updatedByName]),
  ).toEqual(cases.map(() => expect.arrayContaining([expect.any(String), 'Admin', 'Admin'])));

  await runMigrations(fixture);
  const after = await readAll(fixture);
  expect(after.calendars).toEqual(before.calendars);
  expect(after.reviews).toEqual(before.reviews);
  expect(after.reviewVersions).toEqual(before.reviewVersions);
  expect(after.audit).toEqual(before.audit);
  expect(
    after.submissions.map(({ contentVersion, decisions, submittedBy, submittedAt }) => ({
      contentVersion,
      decisions,
      submittedBy,
      submittedAt,
    })),
  ).toEqual(
    before.submissions.map(({ contentVersion, decisions, submittedBy, submittedAt }) => ({
      contentVersion,
      decisions,
      submittedBy,
      submittedAt,
    })),
  );
  expect(await metadata()).toEqual(shown);
  // The base identity is the one the v4 code computed, so a current review stays current and a
  // stale one is never promoted.
  for (const item of cases) {
    const { calendarId, stale } = reviews.find(({ name }) => name === item.name)!;
    const support = await admin.query(api.reviews.review, { id: calendarId });
    expect(support.status, item.name).toBe(reviewed[item.name]);
    if (!stale)
      expect(support.baseIdentity, item.name).toBe(
        oracle.find((entry) => entry.name === item.name)!.baseIdentity,
      );
    expect(support.stale, item.name).toBe(stale);
  }
});

/** Pairs of distinct dates of one document with the same start and end (section 11). */
function coincidingPairs(events: readonly Json[]) {
  return events.flatMap((event, index) =>
    events
      .slice(index + 1)
      .filter((other) => other.start === event.start && other.end === event.end)
      .map((other) => [String(event.id), String(other.id)]),
  );
}

test('dates convert one to one and the stored documents give the oracle values', async () => {
  const fixture = await createNativeFixture();
  const cases = v4Cases();
  const expected = await storeV4(fixture);
  await runMigrations(fixture);
  const after = await readAll(fixture);
  const oracle = recordedOracle().cases;
  const contentOf = (item: V4Case) =>
    after.contents.find(
      (row) =>
        row._id ===
        expected.find(
          ({ table, item: from }) => table === 'calendarContents' && from?.name === item.name,
        )!.id,
    )!;

  // One to one: every stored copy keeps the same dates, in the same order, nothing created,
  // removed, merged or moved; coinciding dates stay distinct.
  const pairs: string[][] = [];
  for (const { table, id, item } of expected) {
    if (table === 'institutionalEvents') continue;
    const source =
      table === 'calendarContents'
        ? item!.content
        : item!.submissions.find(
            (submission) =>
              submission.sequence === after.submissions.find((row) => row._id === id)!.sequence,
          )!;
    const row = rowsOf(after, table).find((entry) => entry._id === id) as unknown as V4Content;
    expect(row.state.events.map((event) => event.id)).toEqual(
      source.state.events.map((event) => event.id),
    );
    expect(row.institutionalSnapshot.map((event) => event.id)).toEqual(
      source.institutionalSnapshot.map((event) => event.id),
    );
    if (table === 'calendarContents') pairs.push(...coincidingPairs(row.state.events));
    expect(coincidingPairs(row.state.events)).toEqual(coincidingPairs(source.state.events));
  }
  // The six annual and semester pairs (five in Ivaiporã, one in Cascavel) and the two reviews of
  // results of Cascavel on the same day (section 11) are among them, never deduplicated.
  expect(pairs).toEqual(
    expect.arrayContaining([
      ['ivaipora-final-2', 'ivaipora-annual-final'],
      ['ivaipora-diary-2', 'ivaipora-annual-diary'],
      ['ivaipora-registration-1', 'ivaipora-annual-registration'],
      ['ivaipora-admission-notice-1', 'ivaipora-annual-admission-notice'],
      ['ivaipora-recognition-1', 'ivaipora-annual-recognition'],
      ['cascavel-diary-2', 'cascavel-annual-diary'],
      ['cascavel-final-appeal-1', 'cascavel-final-appeal-2'],
    ]),
  );
  const ivaipora = contentOf(cases[0]!).state.events;
  expect(ivaipora.find((event) => event.id === 'ivaipora-final-appeal-2')!.hours).toBe(28);

  // Counting, scope, hours, printing and coverage computed over the stored documents equal the
  // oracle, except the pending classification of the links without generated activity.
  for (const [index, item] of cases.entries()) {
    const row = contentOf(item);
    // Documents are copied without conversion; only their IDs were bound to real rows.
    const documents = row.documentSnapshot.map((document, position) => {
      const synthetic = item.content.documentSnapshot[position]!;
      const {
        id: _id,
        storageId: _storage,
        createdBy: _by,
        publishedBy: _published,
        ...rest
      } = document as Json;
      const {
        id: _syntheticId,
        storageId: _syntheticStorage,
        createdBy: _syntheticBy,
        publishedBy: _syntheticPublished,
        ...stored
      } = synthetic;
      expect(rest).toEqual(stored);
      return synthetic;
    });
    const content = {
      ...withoutSystem(row),
      calendarId: item.content.calendarId,
      documentSnapshot: documents,
    } as unknown as V4Content;
    expect(oracleValues(item, content), item.name).toEqual(expectedOracle(oracle[index]!, item));
  }
  // The submissions keep their relation of hash with the current content: two equal, one not.
  expect(
    after.submissions.map(
      (row) =>
        row.contentHash ===
        contentHash(after.contents.find((c) => c.calendarId === row.calendarId)!),
    ),
  ).toEqual([true, false, true]);
});
