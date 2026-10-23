import assert from 'node:assert/strict';
import { test } from 'vitest';
import { defineSchema, defineTable, makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { convexTest } from 'convex-test';
import { encodeValue } from '../migration/legacy-codec.mjs';
import {
  assertPlan,
  assertSourceSnapshot,
  createPlan,
  fingerprint,
  verifyPlanSnapshot,
} from '../migration/plan.ts';
import type { MigrationPlan, Row, Snapshot } from '../migration/types.ts';

const at = '2026-01-01T00:00:00.000Z';
const row = (id: string, key: string, item: unknown): Row => ({
  _id: id,
  _creationTime: 100,
  key,
  position: 0,
  value: encodeValue(item),
});
function fixture(): Snapshot {
  const state = {
    schemaVersion: 1,
    year: 2027,
    campus: 'Campus',
    offer: 'tecnico',
    regime: 'anual',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: false,
    weekEvidence: '',
    periods: [],
    events: [],
    ignoredHistory: ['history-old:preserved:candidate'],
    assessmentStages: 2,
    teacherVacations: { julyStart: '2027-07-01', evidence: 'Resolução' },
  };
  return {
    _tables: [],
    _storage: [],
    users: [
      row('user-native', 'u1', {
        id: 'u1',
        name: 'Pessoa',
        email: 'pessoa@example.test',
        role: 'CAMPUS',
        campusId: 'campus-old',
        active: true,
      }),
    ],
    campuses: [row('campus-native', 'campus-old', { id: 'campus-old', name: 'Campus' })],
    calendars: [
      {
        ...row('calendar-native', 'calendar-old', {
          id: 'calendar-old',
          campusId: 'campus-old',
          state,
          catalogueRevision: 1,
          institutionalSnapshot: [],
          documentSnapshot: [],
          courses: '',
          classes: '',
          shifts: '',
          version: 2,
          updatedAt: at,
        }),
        versionCount: 1,
      },
    ],
    calendarVersions: [
      {
        _id: 'version-native',
        _creationTime: 101,
        ownerId: 'calendar-old',
        ordinal: 0,
        snapshotId: 'snapshot-native',
        metadata: encodeValue({ version: 1, at, catalogueRevision: 1 }),
      },
    ],
    calendarSnapshots: [
      row('snapshot-native', 'ignored', {
        state,
        version: 1,
        at,
        catalogueRevision: 1,
        institutionalEvents: [],
        documentSnapshot: [],
      }),
    ],
    histories: [
      row('history-native', 'history-old', {
        id: 'history-old',
        calendarId: 'calendar-old',
        campusId: 'campus-old',
        year: 2026,
        offer: 'integrado',
        filename: 'original.pdf',
        hash: 'hash',
        objectKey: 'legacy/original.pdf',
        notes: 'Preservar',
        createdAt: at,
      }),
    ],
    rootFields: [
      {
        _id: 'root-native',
        _creationTime: 101,
        name: 'catalogue',
        value: encodeValue({ revision: 1, events: [] }),
      },
    ],
    authAccounts: [
      {
        _id: 'account-native',
        _creationTime: 99,
        userId: 'user-native',
        secret: 'synthetic-secret',
        provider: 'password',
        providerAccountId: 'pessoa@example.test',
      },
    ],
    authSessions: [
      { _id: 'session-native', _creationTime: 99, userId: 'user-native', expirationTime: 200 },
    ],
    audit: [
      row('audit-native', 'audit-old', {
        at,
        actor: 'setup',
        action: 'CREATE_CALENDAR',
        id: 'calendar-old',
        details: 'Origem preservada',
      }),
    ],
  };
}
function simulate(source: Snapshot, plan: MigrationPlan): Snapshot {
  const actual = structuredClone(source);
  let sequence = 0;
  for (const batch of plan.batches)
    for (const op of batch.operations) {
      const rows = (actual[op.table] ??= []);
      if (op.kind === 'insert')
        rows.push({ _id: `generated-${sequence++}`, _creationTime: 200, ...op.document });
      else {
        const i = rows.findIndex((item) => item._id === op.id);
        assert(i >= 0);
        if (op.kind === 'delete') rows.splice(i, 1);
        else rows[i] = { _id: rows[i]._id, _creationTime: rows[i]._creationTime, ...op.document };
      }
    }
  return actual;
}

test('migration preserves native identities, Auth, historical representation and unavailable originals', () => {
  const source = fixture(),
    before = structuredClone(source);
  const plan = createPlan(source, 'source-digest'),
    actual = simulate(source, plan);
  assert.deepEqual(source, before);
  assert.equal(plan.digest, createPlan(source, 'source-digest').digest);
  verifyPlanSnapshot(plan, actual);
  assert.deepEqual(actual.authAccounts, source.authAccounts);
  assert.deepEqual(actual.authSessions, source.authSessions);
  assert.equal(actual.calendars[0]._id, 'calendar-native');
  assert.deepEqual(
    actual.calendarAliases.map(({ alias, calendarId }) => ({ alias, calendarId })),
    [{ alias: 'calendar-old', calendarId: 'calendar-native' }],
  );
  assert.equal(actual.users[0].campusId, 'campus-native');
  assert.deepEqual(actual.calendars[0].modalities, ['tecnico']);
  const current = actual.calendarContents[0].state as Record<string, unknown>;
  assert.deepEqual(current.assessmentStagesByModality, { tecnico: 2 });
  assert(!('offer' in current));
  assert(!('schemaVersion' in current));
  assert.deepEqual(current.ignoredHistory, ['history-native:preserved:candidate']);
  assert.deepEqual(current.teacherVacations, {
    firstStart: '2027-01-02',
    firstEnd: '2027-01-31',
    secondStart: '2027-07-01',
    secondEnd: '2027-07-15',
    evidence: 'Resolução',
  });
  const historic = actual.calendarSnapshots[0].state as Record<string, unknown>;
  assert.equal(historic.assessmentStages, 2);
  assert(!('assessmentStagesByModality' in historic));
  assert.deepEqual(historic.ignoredHistory, ['history-native:preserved:candidate']);
  assert.deepEqual(historic.teacherVacations, { julyStart: '2027-07-01', evidence: 'Resolução' });
  assert.equal(actual.audit[0].actorLabel, 'setup');
  assert.equal(actual.audit[0].details, 'Origem preservada');
  assert.deepEqual(actual.histories[0].unavailableFile, {
    sourceReference: 'legacy/original.pdf',
    reason: 'not_migrated',
  });
  assert.equal(plan.missingFiles.length, 1);
  assert.deepEqual(actual.histories[0].modalities, ['integrado']);
  assert.equal(actual.rootFields.length, 0);
});

test('migration refuses orphan references, missing historical rows and altered plans', () => {
  const orphan = fixture();
  (orphan.users[0].value as { data: Record<string, unknown> }).data.campusId = 'missing';
  assert.throws(() => createPlan(orphan, 'source'), /órfã/);
  const missing = fixture();
  missing.calendarSnapshots = [];
  assert.throws(() => createPlan(missing, 'source'), /Snapshot histórico ausente/);
  const duplicate = fixture();
  duplicate.calendars[0].versionCount = 2;
  duplicate.calendarVersions.push({
    ...duplicate.calendarVersions[0],
    _id: 'duplicate',
    ordinal: 1,
  });
  assert.throws(() => createPlan(duplicate, 'source'), /versão duplicado/);
  const plan = createPlan(fixture(), 'source');
  plan.batches[0].operations.pop();
  assert.throws(() => assertPlan(plan), /adulterado/);
});

test('verification detects historical or credential changes after migration', () => {
  const source = fixture(),
    plan = createPlan(source, 'source');
  const history = simulate(source, plan);
  history.calendarSnapshots[0].catalogueRevision = 2;
  assert.throws(() => verifyPlanSnapshot(plan, history), /calendarSnapshots/);
  const auth = simulate(source, plan);
  auth.authAccounts[0].secret = 'different';
  assert.throws(() => verifyPlanSnapshot(plan, auth), /authAccounts/);
});

async function engineFixture() {
  const client = convexTest(
    defineSchema({
      items: defineTable(v.any()),
      migrationState: defineTable(v.any()),
      authAccounts: defineTable(v.any()),
    }),
    {
      '../migration/_generated/server.ts': () => import('../migration/_generated/server.ts'),
      '../migration/engine.ts': () => import('../migration/engine.ts'),
    },
  );
  const apply = makeFunctionReference<'mutation'>('engine:apply');
  return { client, apply };
}

test('migration engine commits each batch atomically and safely replays after lost responses', async () => {
  const { client, apply } = await engineFixture();
  const args = {
    planDigest: 'plan',
    sourceDigest: 'source',
    batchDigest: fingerprint('batch'),
    batch: 0,
    totalBatches: 2,
    operations: [{ kind: 'insert', table: 'items', document: { value: 1 } }],
  };
  assert.deepEqual(await client.mutation(apply, args), {
    nextBatch: 1,
    done: false,
    replay: false,
  });
  assert.deepEqual(await client.mutation(apply, args), { nextBatch: 1, done: false, replay: true });
  assert.equal((await client.run((ctx) => ctx.db.query('items').collect())).length, 1);
  await assert.rejects(client.mutation(apply, { ...args, planDigest: 'other' }), /outro plano/);
  await assert.rejects(client.mutation(apply, { ...args, batch: 2 }), /inválido/);
  await assert.rejects(
    client.mutation(apply, {
      ...args,
      batch: 1,
      operations: [
        { kind: 'insert', table: 'items', document: { value: 2 } },
        { kind: 'insert', table: 'authAccounts', document: { secret: 'forbidden' } },
      ],
    }),
    /protegida/,
  );
  assert.equal((await client.run((ctx) => ctx.db.query('items').collect())).length, 1);
});

test('migration cleanup requires the completed matching plan', async () => {
  const { client, apply } = await engineFixture();
  const finish = makeFunctionReference<'mutation'>('engine:finish');
  const recordVerification = makeFunctionReference<'mutation'>('engine:recordVerification');
  const verified = {
    planDigest: 'plan',
    sourceDigest: 'source',
    snapshotDigest: 'snapshot',
    schemaDigest: 'schema',
  };
  const args = {
    planDigest: 'plan',
    sourceDigest: 'source',
    batchDigest: 'first',
    batch: 0,
    totalBatches: 2,
    operations: [],
  };
  await client.mutation(apply, args);
  await assert.rejects(client.mutation(finish, verified), /completamente aplicado/);
  await client.mutation(apply, { ...args, batch: 1, batchDigest: 'last' });
  await assert.rejects(
    client.mutation(finish, { ...verified, planDigest: 'other' }),
    /completamente aplicado/,
  );
  await assert.rejects(client.mutation(finish, verified), /verificação registrada/);
  await client.mutation(recordVerification, verified);
  await assert.rejects(
    client.mutation(finish, { ...verified, snapshotDigest: 'snapshot-from-other-target' }),
    /verificação registrada/,
  );
  await client.mutation(finish, verified);
  assert.equal(await client.run((ctx) => ctx.db.query('migrationState').first()), null);
  assert.equal(await client.mutation(finish, verified), null);
});

test('migration refuses inline file bytes in histories, documents and immutable snapshots', () => {
  const inlineHistory = fixture();
  (inlineHistory.histories[0].value as { data: Record<string, unknown> }).data.data =
    'JVBERi1pbnNsaW5l';
  assert.throws(
    () => createPlan(inlineHistory, 'source'),
    /Arquivo inline encontrado em histories/,
  );
  const inlineDocument = fixture();
  inlineDocument.documents = [
    row('document-native', 'document-old', { id: 'document-old', data: 'JVBERi1pbnNsaW5l' }),
  ];
  assert.throws(
    () => createPlan(inlineDocument, 'source'),
    /Arquivo inline encontrado em documents/,
  );
  const inlineSnapshot = fixture();
  (
    inlineSnapshot.calendarSnapshots[0].value as { data: Record<string, unknown> }
  ).data.documentSnapshot = [{ id: 'document-old', data: 'JVBERi1pbnNsaW5l' }];
  assert.throws(
    () => createPlan(inlineSnapshot, 'source'),
    /Arquivo inline encontrado em documentSnapshot/,
  );
});

test('current split assessment stages merge before modality expansion while immutable history stays exact', () => {
  const source = fixture();
  const start = {
    id: 'start',
    name: 'Início',
    start: '2027-02-01',
    end: '2027-02-01',
    requirementId: 'stage-start-1',
    kind: 'note',
    evidence: 'Início',
  };
  const end = {
    id: 'end',
    name: 'Término',
    start: '2027-04-01',
    end: '2027-04-01',
    requirementId: 'stage-end-1',
    kind: 'note',
    evidence: 'Fim',
  };
  for (const table of ['calendars', 'calendarSnapshots'])
    (source[table][0].value as { data: { state: { events: unknown[] } } }).data.state.events = [
      start,
      end,
    ];
  const actual = simulate(source, createPlan(source, 'source'));
  const current = actual.calendarContents[0].state as { events: Record<string, unknown>[] };
  assert.equal(current.events.length, 1);
  assert.equal(current.events[0].requirementId, 'stage-1:tecnico');
  assert.equal(current.events[0].start, start.start);
  assert.equal(current.events[0].end, end.end);
  assert.deepEqual((actual.calendarSnapshots[0].state as { events: unknown[] }).events, [
    start,
    end,
  ]);
});

test('source freshness rejects unexpected nonempty tables and accepts reserved empty tables', () => {
  const source = fixture(),
    plan = createPlan(source, 'source');
  assertSourceSnapshot(plan, { ...source, reserved: [] });
  assert.throws(
    () =>
      assertSourceSnapshot(plan, { ...source, unexpected: [{ _id: 'extra', _creationTime: 0 }] }),
    /Tabela de origem não prevista/,
  );
});
