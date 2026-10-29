import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { internal } from '../../convex/_generated/api.js';
import type { StoredContentState } from '../../convex/validators';
import { createNativeFixture } from '../helpers/native-database.ts';

type Fixture = Awaited<ReturnType<typeof createNativeFixture>>;
const oldState = (): StoredContentState => ({
  schemaVersion: 3,
  rulesetVersion: '2027-v2',
  regime: 'anual',
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  organizationByModality: { integrado: 'anual' },
  assessmentStagesByModality: { integrado: 2 },
  periods: [
    {
      id: 'year',
      name: 'Ano',
      start: '2027-02-01',
      end: '2027-12-17',
      association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
    },
  ],
  events: [
    {
      id: 'publication',
      name: 'Publicação',
      kind: 'note',
      start: '2026-12-10',
      end: '2026-12-10',
      modalities: ['integrado'],
      recordType: 'prior-reference',
      publicationStatus: 'published',
      deadlineAdjustment: { date: '2026-12-11', reviewed: false },
    },
  ],
});

async function seed(
  fixture: Fixture,
  state = oldState(),
  options: { trash?: boolean; modalities?: Array<'integrado' | 'graduacao'> } = {},
) {
  return fixture.client.run(async (ctx) => {
    const calendarId = await ctx.db.insert('calendars', {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      modalities: options.modalities ?? ['integrado'],
      purpose: 'test',
      courses: 'Oferta sintética',
      classes: 'Turma sintética',
      shifts: 'Diurno',
      version: 7,
      updatedAt: 123456,
      ...(options.trash ? { deletedAt: 234567, deletedBy: fixture.ids.users.admin } : {}),
    });
    const contentId = await ctx.db.insert('calendarContents', {
      calendarId,
      state,
      catalogueRevision: 42,
      institutionalSnapshot: [],
      documentSnapshot: [],
    });
    return { calendarId, contentId };
  });
}

async function runAll(fixture: Fixture) {
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
}

const report = (fixture: Fixture) =>
  fixture.client.run((ctx) =>
    ctx.db
      .query('migrationReports')
      .withIndex('by_key', (q) => q.eq('key', 'offers-v4'))
      .unique(),
  );

const records = (fixture: Fixture) =>
  fixture.client.run(async (ctx) => ({
    results: await ctx.db.query('migrationResults').take(100),
    audit: await ctx.db.query('audit').take(100),
  }));

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
afterEach(() => vi.useRealTimers());

test('an empty database finalizes the ordered purge and conversion exactly once', async () => {
  const fixture = await createNativeFixture();
  await runAll(fixture);
  const first = await report(fixture);
  expect(first).toMatchObject({
    key: 'offers-v4',
    converted: 0,
    alreadyV4: 0,
    pending: 0,
    orphanContents: 0,
    orphanCalendars: 0,
    orphanKeys: 0,
    failures: 0,
    purged: {
      reviewVersions: 0,
      reviews: 0,
      calendarVersions: 0,
      calendarSnapshots: 0,
      calendarAliases: 0,
    },
    completedAt: expect.any(Number),
    purgeAuditId: expect.any(String),
  });
  const statuses = await fixture.client.query(internal.migrations.status, {});
  expect(statuses.map(({ name }) => name).sort()).toEqual(
    [
      'migrations:purgeReviewVersions',
      'migrations:purgeReviews',
      'migrations:purgeCalendarVersions',
      'migrations:purgeCalendarSnapshots',
      'migrations:purgeAliases',
      'migrations:finalizePurge',
      'migrations:contentsToV4',
      'migrations:checkCalendars',
      'migrations:finalizeV4',
      'migrations:offersV4Report',
    ].sort(),
  );
  expect(statuses.every(({ state }) => state === 'success')).toBe(true);
  await runAll(fixture);
  expect(await report(fixture)).toEqual(first);
  expect((await records(fixture)).audit).toHaveLength(1);
});

test('only the five historical tables are purged, with one aggregate system audit', async () => {
  const fixture = await createNativeFixture();
  const { calendarId } = await seed(fixture);
  const preserved = await fixture.client.run(async (ctx) => {
    const state = oldState();
    if (state.schemaVersion === 4) throw new Error('Expected legacy fixture.');
    const snapshotId = await ctx.db.insert('calendarSnapshots', {
      state: {
        ...state,
        schemaVersion: 3,
        year: 2027,
        campus: 'A',
        modalities: ['integrado'],
        offer: 'integrado',
      },
      at: 1000,
      catalogueRevision: 42,
      institutionalEvents: [],
      documentSnapshot: [],
    });
    await ctx.db.insert('calendarVersions', {
      calendarId,
      version: 6,
      at: 1000,
      catalogueRevision: 42,
      snapshotId,
    });
    await ctx.db.insert('calendarAliases', { alias: 'previous-calendar', calendarId });
    const review = {
      calendarId,
      calendarVersion: 7,
      catalogueRevision: 42,
      revision: 1,
      source: 'Teste',
      documentSnapshot: [],
      entries: [],
      conclusion: 'Sintético',
      processNumber: '',
      applicableNorm: '',
      reviewer: { id: fixture.ids.users.admin, name: 'Admin' },
      updatedAt: 1000,
    };
    const reviewId = await ctx.db.insert('reviews', review);
    await ctx.db.insert('reviewVersions', { ...review, reviewId });
    const storageId = await ctx.storage.store(new Blob(['synthetic'], { type: 'application/pdf' }));
    const documentId = await ctx.db.insert('documents', {
      year: 2027,
      type: 'norma',
      title: 'Norma sintética',
      source: 'Teste',
      storageId,
      hash: '0'.repeat(64),
      filename: 'norma.pdf',
      status: 'vigente',
      version: 1,
      createdAt: 1000,
    });
    const auditId = await ctx.db.insert('audit', {
      at: 999,
      actorId: fixture.ids.users.admin,
      action: 'PRESERVED',
      target: { type: 'calendar', id: calendarId },
    });
    return {
      document: await ctx.db.get(documentId),
      audit: await ctx.db.get(auditId),
      storageId,
      settings: await ctx.db.query('institutionSettings').first(),
      campus: await ctx.db.get(fixture.ids.campuses.a),
      user: await ctx.db.get(fixture.ids.users.admin),
    };
  });
  await runAll(fixture);
  expect((await report(fixture))?.purged).toEqual({
    reviewVersions: 1,
    reviews: 1,
    calendarVersions: 1,
    calendarSnapshots: 1,
    calendarAliases: 1,
  });
  await fixture.client.run(async (ctx) => {
    for (const table of [
      'reviewVersions',
      'reviews',
      'calendarVersions',
      'calendarSnapshots',
      'calendarAliases',
    ] as const)
      expect(await ctx.db.query(table).first()).toBeNull();
    expect(await ctx.db.get(preserved.document!._id)).toEqual(preserved.document);
    expect(await ctx.db.get(preserved.audit!._id)).toEqual(preserved.audit);
    expect(await ctx.db.query('institutionSettings').first()).toEqual(preserved.settings);
    expect(await ctx.db.get(fixture.ids.campuses.a)).toEqual(preserved.campus);
    expect(await ctx.db.get(fixture.ids.users.admin)).toEqual(preserved.user);
    expect(await (await ctx.storage.get(preserved.storageId))?.text()).toBe('synthetic');
  });
  const audit = (await records(fixture)).audit;
  const purge = audit.find((entry) => entry.action === 'PURGE_HISTORY_V4')!;
  expect(purge.actorId).toBeUndefined();
  expect(JSON.parse(purge.details!)).toEqual({
    migration: 'offers-v4',
    purged: (await report(fixture))?.purged,
  });
  expect(audit.indexOf(purge)).toBeLessThan(
    audit.findIndex((entry) => entry.action === 'MIGRATE_CONTENT_V4'),
  );
  await runAll(fixture);
  expect((await records(fixture)).audit).toEqual(audit);
});

test('v3 and v2 contents including trash convert without changing versions, timestamps, snapshots or hashes', async () => {
  const fixture = await createNativeFixture();
  const source = oldState();
  const current = await seed(fixture, source);
  const trash = await seed(fixture, source, { trash: true });
  const v2: StoredContentState = {
    regime: 'misto',
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [],
    assessmentStagesByModality: {},
  };
  const pending = await seed(fixture, v2, { modalities: ['integrado', 'graduacao'] });
  const before = await fixture.client.run(async (ctx) => ({
    calendars: await ctx.db.query('calendars').take(10),
    contents: await ctx.db.query('calendarContents').take(10),
  }));
  await runAll(fixture);
  await fixture.client.run(async (ctx) => {
    for (const original of before.calendars) {
      const { modalities, ...rest } = original;
      expect(await ctx.db.get(original._id)).toEqual({ ...rest, offerKinds: modalities });
    }
    for (const original of before.contents) {
      const changed = (await ctx.db.get(original._id))!;
      expect({ ...changed, state: original.state }).toEqual(original);
      expect(changed.state.schemaVersion).toBe(4);
    }
    const converted = (await ctx.db.get(current.contentId))!.state;
    expect(converted).toMatchObject({
      schemaVersion: 4,
      rulesetVersion: '2027-v2',
      offers: [
        {
          id: 'integrado',
          kind: 'integrado',
          delivery: 'a-conferir',
          organization: 'anual',
          stages: { perTerm: 2 },
        },
      ],
      periods: [{ association: { status: 'defined', offers: ['integrado'], term: 'annual' } }],
      events: [
        { offers: ['integrado'], deadlineAdjustment: { date: '2026-12-11', reviewed: false } },
      ],
    });
    expect((await ctx.db.get(trash.calendarId))?.deletedAt).toBe(234567);
    expect((await ctx.db.get(pending.contentId))!.state).toMatchObject({
      offers: [{ organization: 'a-classificar' }, { organization: 'a-classificar' }],
    });
  });
  const snapshot = await records(fixture);
  const expectedHash = createHash('sha256')
    .update(
      JSON.stringify(source, function (_key, value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
            )
          : value;
      }),
    )
    .digest('hex');
  const receipt = snapshot.results.find((item) => item.contentId === current.contentId)!;
  expect(receipt).toMatchObject({
    outcome: 'converted',
    oldStateHash: expectedHash,
    sourceSchemaVersion: 3,
  });
  const audit = snapshot.audit.filter((entry) => entry.action === 'MIGRATE_CONTENT_V4');
  expect(audit).toHaveLength(3);
  const currentAudit = audit.find((entry) => entry.calendarId === current.calendarId)!;
  expect(currentAudit.version).toBe(7);
  expect(currentAudit.actorId).toBeUndefined();
  expect(JSON.parse(currentAudit.details!)).toEqual({
    migration: 'offers-v4',
    sourceSchemaVersion: 3,
    oldStateHash: expectedHash,
  });
  expect(currentAudit.details).not.toContain('Publicação');
  expect(await report(fixture)).toMatchObject({ converted: 3, pending: 1, failures: 0 });
});

test('content batches resume at ten and repeated starts do not reset an active series or inflate receipts', async () => {
  const fixture = await createNativeFixture();
  await runAll(fixture);
  for (let index = 0; index < 23; index++) await seed(fixture);
  await fixture.client.mutation(internal.migrations.retryContents, { reset: true });
  expect(await report(fixture)).toMatchObject({ converted: 10 });
  expect((await report(fixture))?.completedAt).toBeUndefined();
  await fixture.client.mutation(internal.migrations.start, {});
  expect(await report(fixture)).toMatchObject({ converted: 10 });
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  const complete = await records(fixture);
  expect(await report(fixture)).toMatchObject({
    converted: 23,
    completedAt: expect.any(Number),
    failures: 0,
  });
  expect(complete.results).toHaveLength(23);
  expect(complete.audit.filter((entry) => entry.action === 'MIGRATE_CONTENT_V4')).toHaveLength(23);
  await fixture.client.mutation(internal.migrations.retryContents, { reset: true });
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await records(fixture)).toEqual(complete);
  expect(await report(fixture)).toMatchObject({ converted: 23, alreadyV4: 0 });
});

test('conversion errors persist per content, stop the deploy status and clear on an explicit safe retry', async () => {
  const fixture = await createNativeFixture();
  const good = await seed(fixture);
  const invalid = oldState();
  if (invalid.schemaVersion === 4) throw new Error('Expected legacy fixture.');
  invalid.intakeByModality = { integrado: { invalid: { status: 'yes', required: true } } };
  const bad = await seed(fixture, invalid);
  await runAll(fixture);
  expect(await report(fixture)).toMatchObject({
    converted: 1,
    failures: 1,
  });
  expect((await report(fixture))?.completedAt).toBeUndefined();
  expect((await fixture.client.query(internal.migrations.status, {})).at(-1)).toMatchObject({
    state: 'failed',
    error: '1 falha(s) de dados na migração v4.',
  });
  expect(
    (await records(fixture)).results.find((item) => item.contentId === bad.contentId),
  ).toMatchObject({
    outcome: 'failed',
    error: expect.stringMatching(/Ciclo de ingresso inválido/),
    oldStateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(await fixture.client.run((ctx) => ctx.db.get(bad.contentId))).toMatchObject({
    state: invalid,
    catalogueRevision: 42,
  });
  await fixture.client.run((ctx) => ctx.db.patch(bad.contentId, { state: oldState() }));
  await runAll(fixture);
  expect(await report(fixture)).toMatchObject({
    converted: 2,
    failures: 0,
    alreadyV4: 0,
    completedAt: expect.any(Number),
  });
  const { results, audit } = await records(fixture);
  expect(results).toHaveLength(2);
  expect(results.every((item) => item.outcome === 'converted')).toBe(true);
  expect(audit.filter((entry) => entry.action === 'MIGRATE_CONTENT_V4')).toHaveLength(2);
  expect(audit.filter((entry) => entry.calendarId === good.calendarId)).toHaveLength(1);
  expect(
    (await fixture.client.query(internal.migrations.status, {})).every(
      ({ state }) => state === 'success',
    ),
  ).toBe(true);
});

test('a failed migration transaction preserves the component cursor and is resumed by the full series', async () => {
  const fixture = await createNativeFixture();
  const item = await seed(fixture);
  const before = await fixture.client.run((ctx) => ctx.db.get(item.contentId));
  // Starting the conversion tail before its purge precondition reproduces a
  // failed subtransaction without injecting test behavior into the migration.
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await fixture.client.mutation(internal.migrations.retryContents, { reset: true });
  } finally {
    log.mockRestore();
  }
  expect(await report(fixture)).toBeNull();
  expect(await fixture.client.run((ctx) => ctx.db.get(item.contentId))).toEqual(before);
  expect(
    (await fixture.client.query(internal.migrations.status, {})).find(
      (status) => status.name === 'migrations:contentsToV4',
    ),
  ).toMatchObject({ state: 'failed', processed: 0, error: expect.stringMatching(/expurgo v4/) });
  await runAll(fixture);
  expect(await report(fixture)).toMatchObject({ converted: 1, failures: 0 });
  expect(
    (await fixture.client.query(internal.migrations.status, {})).every(
      ({ state }) => state === 'success',
    ),
  ).toBe(true);
});

test('orphans, orphan map keys and missing contents are counted once and preserved for independent verification', async () => {
  const fixture = await createNativeFixture();
  const state = oldState();
  if (state.schemaVersion === 4) throw new Error('Expected legacy fixture.');
  state.organizationByModality!.removed = 'anual';
  state.intakeByModality = { removed: { annual: { status: 'unknown' } } };
  state.assessmentStagesByModality.removed = 2;
  await seed(fixture, state);
  const missingCalendar = await seed(fixture);
  const missingContent = await seed(fixture, oldState(), { trash: true });
  await fixture.client.run(async (ctx) => {
    await ctx.db.delete(missingCalendar.calendarId);
    await ctx.db.delete(missingContent.contentId);
  });
  await runAll(fixture);
  expect(await report(fixture)).toMatchObject({
    converted: 1,
    orphanContents: 1,
    orphanCalendars: 1,
    orphanKeys: 3,
    failures: 0,
  });
  const first = await records(fixture);
  await fixture.client.run(async (ctx) => {
    expect((await ctx.db.get(missingCalendar.contentId))!.state.schemaVersion).toBe(3);
    expect(await ctx.db.get(missingContent.calendarId)).toMatchObject({
      offerKinds: ['integrado'],
      deletedAt: 234567,
    });
    expect((await ctx.db.get(missingContent.calendarId))?.modalities).toBeUndefined();
  });
  await fixture.client.mutation(internal.migrations.retryContents, { reset: true });
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await records(fixture)).toEqual(first);
  expect(await report(fixture)).toMatchObject({
    converted: 1,
    orphanContents: 1,
    orphanCalendars: 1,
    orphanKeys: 3,
    failures: 0,
  });
});

test('existing v4 data keeps its offer identities and deduplicates offer kinds without migration audits', async () => {
  const fixture = await createNativeFixture();
  const state: StoredContentState = {
    schemaVersion: 4,
    rulesetVersion: '2027-v3',
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [],
    offers: [
      { id: 'posgraduacao', kind: 'posgraduacao', delivery: 'a-conferir', organization: 'anual' },
      {
        id: 'graduacao',
        kind: 'graduacao',
        delivery: 'ead',
        organization: 'anual',
        stages: { perTerm: 2 },
      },
      {
        id: 'graduacao-2',
        kind: 'graduacao',
        delivery: 'presencial',
        organization: 'semestral',
        stages: { perTerm: 1 },
        intake: { first: { status: 'unknown' } },
      },
    ],
  };
  const item = await seed(fixture, state, { modalities: ['graduacao'] });
  await runAll(fixture);
  await fixture.client.run(async (ctx) => {
    expect((await ctx.db.get(item.contentId))?.state).toEqual(state);
    expect(await ctx.db.get(item.calendarId)).toMatchObject({
      offerKinds: ['graduacao', 'posgraduacao'],
      version: 7,
      updatedAt: 123456,
    });
  });
  expect(await report(fixture)).toMatchObject({ alreadyV4: 1, converted: 0, pending: 1 });
  expect(
    (await records(fixture)).audit.filter((entry) => entry.action === 'MIGRATE_CONTENT_V4'),
  ).toHaveLength(0);
});

test('postgraduate stages are excluded from pending obligations and duplicate contents fail durably', async () => {
  const fixture = await createNativeFixture();
  const excluded: StoredContentState = {
    schemaVersion: 4,
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [],
    offers: [
      { id: 'posgraduacao', kind: 'posgraduacao', delivery: 'a-conferir', organization: 'anual' },
    ],
  };
  await seed(fixture, excluded);
  const duplicate = await seed(fixture);
  await fixture.client.run(async (ctx) => {
    const original = (await ctx.db.get(duplicate.contentId))!;
    const { _id, _creationTime, ...fields } = original;
    void _id;
    void _creationTime;
    await ctx.db.insert('calendarContents', fields);
  });
  await runAll(fixture);
  expect(await report(fixture)).toMatchObject({ pending: 0, failures: 1 });
  expect((await report(fixture))?.completedAt).toBeUndefined();
  const snapshot = await records(fixture);
  expect(
    snapshot.results.find((item) => item.reference === `calendar:${duplicate.calendarId}`),
  ).toMatchObject({ outcome: 'failed', error: 'Calendário com mais de um conteúdo.' });
  expect(
    snapshot.audit.filter(
      (entry) => entry.action === 'MIGRATE_CONTENT_V4' && entry.calendarId === duplicate.calendarId,
    ),
  ).toHaveLength(1);
});
