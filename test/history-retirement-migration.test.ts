import assert from 'node:assert/strict';
import { test } from 'vitest';
import { defineSchema, defineTable, makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { convexTest } from 'convex-test';
import { createHistoryRetirementPlan } from '../migration/retire-previous-calendars.ts';
import { verifyPlanSnapshot, assertSourceSnapshot } from '../migration/plan.ts';
import type { MigrationPlan, Snapshot, Row } from '../migration/types.ts';

const row = (_id: string, fields: Record<string, unknown> = {}): Row => ({
  _id,
  _creationTime: 1,
  ...fields,
});
function fixture(): Snapshot {
  const event = {
    id: 'event',
    name: 'Evento do campus',
    start: '2027-03-10',
    end: '2027-03-10',
    kind: 'note',
    evidence: 'Ata preservada',
    historicalSource: {
      historyId: 'history',
      page: 1,
      candidateKey: 'candidate',
      analysisId: 'analysis',
    },
  };
  const state = {
    schemaVersion: 3,
    events: [event],
    ignoredHistory: ['history:ignored'],
    periods: [{ id: 'period', start: '2027-02-01', end: '2027-12-15' }],
  };
  return {
    _tables: [],
    _storage: ['old-pdf', 'shared-pdf', 'document-pdf', 'runtime', 'snapshot-pdf'].map((id) =>
      row(id, { size: 12, sha256: id }),
    ),
    histories: [
      row('history', { calendarId: 'calendar', campusId: 'campus', storageId: 'old-pdf' }),
      row('shared', { storageId: 'shared-pdf' }),
      row('snapshot', { storageId: 'snapshot-pdf' }),
      row('missing', { unavailableFile: { reason: 'not_migrated' } }),
    ],
    historyAnalyses: [
      row('analysis', {
        historyId: 'history',
        analysis: { pages: [{ page: 1, text: 'Texto antigo' }] },
      }),
      row('orphan', { historyId: 'no-longer-exists' }),
    ],
    calendarContents: [row('content', { calendarId: 'calendar', state, documentSnapshot: [] })],
    calendarSnapshots: [
      row('snapshot', { state, documentSnapshot: [{ storageId: 'snapshot-pdf' }] }),
    ],
    documents: [
      row('document', { storageId: 'document-pdf' }),
      row('shared-document', { storageId: 'shared-pdf' }),
    ],
    calendarVersions: [
      row('version', { calendarId: 'calendar', snapshotId: 'snapshot', version: 1 }),
    ],
    reviews: [
      row('review', {
        conclusion: 'Parecer intacto',
        documentSnapshot: [{ storageId: 'document-pdf' }],
      }),
    ],
    runtimeArtifacts: [row('runtime', { storageId: 'runtime' })],
    authSessions: [row('session', { userId: 'member', expirationTime: 10 })],
    audit: [row('audit', { action: 'UPLOAD_HISTORY', target: { type: 'history', id: 'history' } })],
    nativeUploads: [
      row('upload-old', { storageId: 'old-pdf' }),
      row('upload-doc', { storageId: 'document-pdf' }),
    ],
    nativeFileTickets: [
      row('ticket-old', { storageId: 'old-pdf' }),
      row('ticket-doc', { storageId: 'document-pdf' }),
    ],
  };
}
function simulate(source: Snapshot, plan: MigrationPlan): Snapshot {
  const result = structuredClone(source);
  for (const batch of plan.batches)
    for (const op of batch.operations) {
      const rows = (result[op.table] ??= []);
      if (op.kind === 'insert') throw Error('Retirement never inserts data.');
      const index = rows.findIndex((item) => item._id === op.id);
      assert(index >= 0);
      if (op.kind === 'delete') rows.splice(index, 1);
      else
        rows[index] = {
          _id: rows[index]._id,
          _creationTime: rows[index]._creationTime,
          ...op.document,
        };
    }
  return result;
}

test('retirement deletes only previous PDFs, detaches current and saved events and preserves remaining data', () => {
  const source = fixture(),
    before = structuredClone(source);
  const plan = createHistoryRetirementPlan(source, 'backup-digest');
  const actual = simulate(source, plan);
  assert.deepEqual(source, before);
  assert.equal(plan.digest, createHistoryRetirementPlan(source, 'backup-digest').digest);
  assertSourceSnapshot(plan, source);
  verifyPlanSnapshot(plan, actual);
  assert.deepEqual(actual.histories, []);
  assert.deepEqual(actual.historyAnalyses, []);
  assert.deepEqual(
    actual._storage.map((file) => file._id),
    ['shared-pdf', 'document-pdf', 'runtime', 'snapshot-pdf'],
  );
  for (const table of [
    'documents',
    'reviews',
    'runtimeArtifacts',
    'authSessions',
    'calendarVersions',
  ])
    assert.deepEqual(actual[table], source[table]);
  for (const table of ['calendarContents', 'calendarSnapshots']) {
    const state = actual[table][0].state as { events: Record<string, unknown>[] };
    assert.equal('ignoredHistory' in state, false);
    assert.deepEqual(state.events, [
      {
        id: 'event',
        name: 'Evento do campus',
        start: '2027-03-10',
        end: '2027-03-10',
        kind: 'note',
        evidence: 'Ata preservada',
      },
    ]);
    assert.deepEqual(actual[table][0].documentSnapshot, source[table][0].documentSnapshot);
  }
  assert.deepEqual(actual.audit[0], {
    ...source.audit[0],
    calendarId: 'calendar',
    campusId: 'campus',
    target: { type: 'archived', reference: 'previous-calendar:history' },
  });
  assert.deepEqual(
    actual.nativeUploads.map((item) => item._id),
    ['upload-doc'],
  );
  assert.deepEqual(
    actual.nativeFileTickets.map((item) => item._id),
    ['ticket-doc'],
  );
  assert.equal(createHistoryRetirementPlan(actual, 'new-backup').batches.length, 0);
  const changed = structuredClone(actual);
  changed.documents[0].title = 'unexpected';
  assert.throws(() => verifyPlanSnapshot(plan, changed), /Conteúdo divergente/);
  assert.throws(
    () => createHistoryRetirementPlan({ ...source, _storage: undefined! }, 'bad'),
    /backup completo/,
  );
});

test('retirement batches are bounded and delete storage only after event and metadata changes', () => {
  const source = fixture();
  source.histories = Array.from({ length: 405 }, (_, index) =>
    row(`history-${index}`, { storageId: 'old-pdf' }),
  );
  const plan = createHistoryRetirementPlan(source, 'backup');
  assert(plan.batches.length > 2);
  for (const batch of plan.batches) assert(batch.operations.length <= 200);
  const operations = plan.batches.flatMap((batch) => batch.operations);
  assert.equal(operations.at(-1)?.table, '_storage');
  verifyPlanSnapshot(plan, simulate(source, plan));
});

test('temporary engine restricts file deletion to the retirement plan and replays safely', async () => {
  const client = convexTest(defineSchema({ migrationState: defineTable(v.any()) }), {
    '../migration/_generated/server.ts': () => import('../migration/_generated/server.ts'),
    '../migration/engine.ts': () => import('../migration/engine.ts'),
  });
  const storageId = await client.run((ctx) => ctx.storage.store(new Blob(['%PDF-previous'])));
  const apply = makeFunctionReference<'mutation'>('engine:apply');
  const args = {
    planDigest: 'plan',
    sourceDigest: 'source',
    batchDigest: 'batch',
    batch: 0,
    totalBatches: 1,
    operations: [{ kind: 'delete', table: '_storage', id: storageId }],
  };
  await assert.rejects(client.mutation(apply, args), /Tabela protegida/);
  assert(await client.run((ctx) => ctx.db.system.get(storageId)));
  const result = await client.mutation(apply, { ...args, purpose: 'retire-previous-calendars' });
  assert.equal(result.done, true);
  assert.equal(await client.run((ctx) => ctx.db.system.get(storageId)), null);
  assert.equal(
    (await client.mutation(apply, { ...args, purpose: 'retire-previous-calendars' })).replay,
    true,
  );
});
