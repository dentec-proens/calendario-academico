import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { internal } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel';
import type { ContentState, ReviewFields } from '../../convex/validators';
import schema from '../../convex/schema';

const modules = {
  '../../convex/_generated/server.js': () => import('../../convex/_generated/server.js'),
  '../../convex/releaseResidue.ts': () => import('../../convex/releaseResidue'),
};
const fixture = () => convexTest(schema, modules);
type Fixture = ReturnType<typeof fixture>;
const state = (): ContentState => ({
  schemaVersion: 4,
  offers: [{ id: 'integrado', kind: 'integrado', organization: 'anual', delivery: 'a-conferir' }],
  weekdays: [],
  weekConfirmed: false,
  periods: [],
  events: [],
});
const seed = async (t: Fixture) =>
  t.run(async (ctx) => {
    const campusId = await ctx.db.insert('campuses', {
      name: 'Operação de publicação release-sintética',
      archived: false,
    });
    const calendarId = await ctx.db.insert('calendars', {
      campusId,
      year: 8700,
      offerKinds: ['integrado'],
      purpose: 'test',
      courses: 'Curso sintético',
      classes: '',
      shifts: '',
      version: 7,
      updatedAt: 100,
    });
    const contentId = await ctx.db.insert('calendarContents', {
      calendarId,
      state: state(),
      catalogueRevision: 1,
      institutionalSnapshot: [],
      documentSnapshot: [],
    });
    return { campusId, calendarId, contentId, expectedVersion: 7, dryRun: false };
  });
const input = (ids: Awaited<ReturnType<typeof seed>>, dryRun = false) => ({
  campusId: ids.campusId,
  calendarId: ids.calendarId,
  expectedVersion: ids.expectedVersion,
  dryRun,
});
const rows = (t: Fixture) =>
  t.run(async (ctx) => ({
    campuses: await ctx.db.query('campuses').take(30),
    calendars: await ctx.db.query('calendars').take(30),
    contents: await ctx.db.query('calendarContents').take(30),
    audit: await ctx.db.query('audit').take(30),
    snapshots: await ctx.db.query('calendarSnapshots').take(30),
    versions: await ctx.db.query('calendarVersions').take(30),
    reviews: await ctx.db.query('reviews').take(30),
    reviewVersions: await ctx.db.query('reviewVersions').take(30),
  }));
const addUser = (t: Fixture, campusId?: Id<'campuses'>, active = true) =>
  t.run((ctx) =>
    ctx.db.insert('users', {
      name: 'Pessoa sintética',
      email: 'synthetic@example.invalid',
      role: 'CAMPUS',
      active,
      loginMethod: 'local',
      ...(campusId ? { campusId } : {}),
      ...(active ? {} : { removedAt: 1 }),
    }),
  );
const addHistory = (t: Fixture, calendarId: Id<'calendars'>, linked = true) =>
  t.run(async (ctx) => {
    const snapshotId = await ctx.db.insert('calendarSnapshots', {
      state: { ...state(), year: 8700, campus: 'Campus sintético' },
      purpose: 'test',
      at: 100,
      catalogueRevision: 1,
      institutionalEvents: [],
      documentSnapshot: [],
    });
    const versionId = linked
      ? await ctx.db.insert('calendarVersions', {
          calendarId,
          version: 6,
          at: 100,
          catalogueRevision: 1,
          snapshotId,
        })
      : null;
    return { snapshotId, versionId };
  });
async function addReview(t: Fixture, calendarId: Id<'calendars'>, withHistory: boolean) {
  const reviewerId = await addUser(t);
  return t.run(async (ctx) => {
    const review: ReviewFields = {
      rulesetVersion: 'unconfigured:8700',
      baseIdentity: 'synthetic-base',
      calendarId,
      calendarVersion: 7,
      catalogueRevision: 1,
      revision: 1,
      source: 'Fonte sintética',
      documentSnapshot: [],
      entries: [],
      conclusion: '',
      processNumber: '',
      applicableNorm: '',
      reviewer: { id: reviewerId, name: 'Pessoa sintética' },
      updatedAt: 100,
    };
    const reviewId = await ctx.db.insert('reviews', review);
    const reviewVersionId = withHistory
      ? await ctx.db.insert('reviewVersions', { ...review, reviewId })
      : null;
    return { reviewId, reviewVersionId };
  });
}
async function rejectsWithoutWrites(t: Fixture, args: ReturnType<typeof input>, message: RegExp) {
  const before = await rows(t);
  await expect(t.mutation(internal.releaseResidue.purge, args)).rejects.toThrow(message);
  expect(await rows(t)).toEqual(before);
}

test('dry run reports exact planned deletions without any writes, then explicit execution deletes only its targets', async () => {
  const t = fixture();
  const ids = await seed(t);
  const before = await rows(t);
  expect(await t.mutation(internal.releaseResidue.purge, input(ids, true))).toMatchObject({
    status: 'dry-run',
    dryRun: true,
    plannedDeletes: { calendars: 1, calendarContents: 1, campuses: 1 },
    deletedNow: { calendars: 0, calendarContents: 0, campuses: 0 },
    campusKeptReason: null,
    auditId: null,
  });
  expect(await rows(t)).toEqual(before);
  const result = await t.mutation(internal.releaseResidue.purge, input(ids));
  expect(result).toMatchObject({
    status: 'deleted',
    deletedNow: { calendars: 1, calendarContents: 1, campuses: 1 },
  });
  const after = await rows(t);
  expect(after.campuses).toEqual([]);
  expect(after.calendars).toEqual([]);
  expect(after.contents).toEqual([]);
  expect(after.audit).toHaveLength(1);
  expect(after.audit[0]).toMatchObject({
    action: 'PURGE_RELEASE_RESIDUE',
    campusId: ids.campusId,
    calendarId: ids.calendarId,
    version: 7,
    target: { type: 'archived', reference: result.reference },
  });
  expect(JSON.parse(after.audit[0].details!)).toMatchObject({
    contentId: ids.contentId,
    deleted: { calendars: 1, calendarContents: 1, campuses: 1 },
  });
  expect(JSON.stringify(after.audit)).not.toMatch(
    /Pessoa sintética|Curso sintético|release-sintética|example.invalid/,
  );
  expect(after.audit[0]).not.toHaveProperty('actorId');
});

test('existing audit, users, institutional data and Storage remain untouched', async () => {
  const t = fixture();
  const ids = await seed(t);
  const userId = await addUser(t);
  const preserved = await t.run(async (ctx) => ({
    auditId: await ctx.db.insert('audit', {
      at: 1,
      action: 'CREATE_CALENDAR',
      target: { type: 'calendar', id: ids.calendarId },
      calendarId: ids.calendarId,
      campusId: ids.campusId,
    }),
    eventId: await ctx.db.insert('institutionalEvents', {
      code: 'synthetic',
      year: 8700,
      name: 'Evento sintético',
      kind: 'note',
      start: '8700-02-01',
      end: '8700-02-01',
      category: 'evento',
      evidence: 'Fonte sintética',
      modalities: ['integrado'],
      active: true,
    }),
    revisionId: await ctx.db.insert('catalogueRevisions', { year: 8700, revision: 1 }),
    storageId: await ctx.storage.store(new Blob(['synthetic-storage'], { type: 'text/plain' })),
  }));
  await t.mutation(internal.releaseResidue.purge, input(ids));
  await t.run(async (ctx) => {
    expect(await ctx.db.get('audit', preserved.auditId)).toMatchObject({
      action: 'CREATE_CALENDAR',
    });
    expect(await ctx.db.get('users', userId)).not.toBeNull();
    expect(await ctx.db.get('institutionalEvents', preserved.eventId)).not.toBeNull();
    expect(await ctx.db.get('catalogueRevisions', preserved.revisionId)).not.toBeNull();
    expect(await (await ctx.storage.get(preserved.storageId))?.text()).toBe('synthetic-storage');
  });
});

test.each([true, false])(
  'any campus user guards the campus, including inactive/removed users (active=%s)',
  async (active) => {
    const t = fixture();
    const ids = await seed(t);
    const userId = await addUser(t, ids.campusId, active);
    const result = await t.mutation(internal.releaseResidue.purge, input(ids));
    expect(result).toMatchObject({
      status: 'deleted',
      campusKeptReason: 'has-users',
      deletedNow: { calendars: 1, calendarContents: 1, campuses: 0 },
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get('campuses', ids.campusId)).not.toBeNull();
      expect(await ctx.db.get('users', userId)).not.toBeNull();
    });
  },
);

test('another calendar, including trash, guards the campus', async () => {
  const t = fixture();
  const ids = await seed(t);
  const otherId = await t.run((ctx) =>
    ctx.db.insert('calendars', {
      campusId: ids.campusId,
      year: 2027,
      offerKinds: ['integrado'],
      purpose: 'test',
      courses: '',
      classes: '',
      shifts: '',
      version: 1,
      updatedAt: 1,
      deletedAt: 2,
    }),
  );
  const result = await t.mutation(internal.releaseResidue.purge, input(ids));
  expect(result.campusKeptReason).toBe('has-other-calendars');
  expect(result.deletedNow.campuses).toBe(0);
  expect(await t.run((ctx) => ctx.db.get('calendars', otherId))).not.toBeNull();
});

test('reports both reasons when users and another calendar guard the campus', async () => {
  const t = fixture();
  const ids = await seed(t);
  await addUser(t, ids.campusId);
  await t.run((ctx) =>
    ctx.db.insert('calendars', {
      campusId: ids.campusId,
      year: 2027,
      offerKinds: ['integrado'],
      purpose: 'test',
      courses: '',
      classes: '',
      shifts: '',
      version: 1,
      updatedAt: 1,
    }),
  );
  expect((await t.mutation(internal.releaseResidue.purge, input(ids))).campusKeptReason).toBe(
    'has-users-and-other-calendars',
  );
});

test.each(['Campus comum', 'operação de publicação release-sintética'])(
  'rejects a campus outside the exact prefix (%s)',
  async (name) => {
    const t = fixture();
    const ids = await seed(t);
    await t.run((ctx) => ctx.db.patch('campuses', ids.campusId, { name }));
    await rejectsWithoutWrites(t, input(ids), /campus não corresponde/);
  },
);

test('rejects a different year', async () => {
  const t = fixture();
  const ids = await seed(t);
  await t.run((ctx) => ctx.db.patch('calendars', ids.calendarId, { year: 2027 }));
  await rejectsWithoutWrites(t, input(ids), /ano 8700/);
});

test('rejects calendar membership in a different native campus ID', async () => {
  const t = fixture();
  const ids = await seed(t);
  const otherCampus = await t.run((ctx) =>
    ctx.db.insert('campuses', { name: 'Operação de publicação release-outra', archived: false }),
  );
  await rejectsWithoutWrites(t, { ...input(ids), campusId: otherCampus }, /campus e ao ano/);
});

test('rejects changed versions and invalid expected versions', async () => {
  const t = fixture();
  const ids = await seed(t);
  await t.run((ctx) => ctx.db.patch('calendars', ids.calendarId, { version: 8 }));
  await rejectsWithoutWrites(t, input(ids), /mudou desde a conferência/);
  for (const expectedVersion of [0, -1, 1.5])
    await rejectsWithoutWrites(t, { ...input(ids), expectedVersion }, /Versão esperada inválida/);
});

test.each(['missing', 'duplicate'])('requires exactly one content (%s)', async (mode) => {
  const t = fixture();
  const ids = await seed(t);
  await t.run(async (ctx) => {
    if (mode === 'missing') await ctx.db.delete('calendarContents', ids.contentId);
    else
      await ctx.db.insert('calendarContents', {
        calendarId: ids.calendarId,
        state: state(),
        catalogueRevision: 1,
        institutionalSnapshot: [],
        documentSnapshot: [],
      });
  });
  await rejectsWithoutWrites(t, input(ids), /exatamente um conteúdo/);
});

test('rejects target history and preserves its snapshot', async () => {
  const t = fixture();
  const ids = await seed(t);
  await addHistory(t, ids.calendarId);
  await rejectsWithoutWrites(t, input(ids), /histórico posterior associado/);
});

test.each([false, true])(
  'rejects a target review and its history (history=%s)',
  async (withHistory) => {
    const t = fixture();
    const ids = await seed(t);
    await addReview(t, ids.calendarId, withHistory);
    await rejectsWithoutWrites(t, input(ids), withHistory ? /histórico de parecer/ : /Há parecer/);
  },
);

test('unrelated history, review and orphan snapshots neither block nor get deleted', async () => {
  const t = fixture();
  const ids = await seed(t);
  const other = await seed(t);
  await addHistory(t, other.calendarId);
  await addHistory(t, other.calendarId, false);
  await addReview(t, other.calendarId, true);
  const before = await rows(t);
  await t.mutation(internal.releaseResidue.purge, input(ids));
  const after = await rows(t);
  for (const table of ['snapshots', 'versions', 'reviews', 'reviewVersions'] as const)
    expect(after[table]).toEqual(before[table]);
  expect(after.calendars).toHaveLength(1);
  expect(after.calendars[0]._id).toBe(other.calendarId);
});

test('repeat calls return already-deleted without adding another audit, including a dry run retry', async () => {
  const t = fixture();
  const ids = await seed(t);
  const first = await t.mutation(internal.releaseResidue.purge, input(ids));
  for (const dryRun of [false, true]) {
    const next = await t.mutation(internal.releaseResidue.purge, input(ids, dryRun));
    expect(next).toMatchObject({
      status: 'already-deleted',
      auditId: first.auditId,
      plannedDeletes: { calendars: 0, calendarContents: 0, campuses: 0 },
      deletedNow: { calendars: 0, calendarContents: 0, campuses: 0 },
    });
  }
  expect((await rows(t)).audit).toHaveLength(1);
  await rejectsWithoutWrites(
    t,
    { ...input(ids), expectedVersion: 8 },
    /recibo de exclusão não corresponde/,
  );
});

test('a receipt never authorizes a second deletion of restored data', async () => {
  const t = fixture();
  const ids = await seed(t);
  await t.mutation(internal.releaseResidue.purge, input(ids));
  await t.run((ctx) =>
    ctx.db.insert('calendarContents', {
      calendarId: ids.calendarId,
      state: state(),
      catalogueRevision: 1,
      institutionalSnapshot: [],
      documentSnapshot: [],
    }),
  );
  await rejectsWithoutWrites(t, input(ids), /dados restaurados/);
});

test('a missing target without a matching purge receipt is not considered already deleted', async () => {
  const t = fixture();
  const ids = await seed(t);
  await t.run((ctx) => ctx.db.delete('calendars', ids.calendarId));
  await rejectsWithoutWrites(t, input(ids), /calendário não corresponde/);
});

test('native argument validators reject an ID from another table', async () => {
  const t = fixture();
  const ids = await seed(t);
  await rejectsWithoutWrites(
    t,
    {
      ...input(ids),
      // Deliberately emulate an invalid transport body; the runtime validator owns this boundary.
      calendarId: ids.campusId as unknown as Id<'calendars'>,
    },
    /calendars/,
  );
});
