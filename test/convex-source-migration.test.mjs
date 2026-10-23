import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { tsImport } from 'tsx/esm/api';
import {
  planSourceMigration,
  sourceProject,
  targetUrl,
} from '../scripts/lib/convex-source-plan.mjs';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';
import { canonicalJson } from '../src/migration-canonical.mjs';

const ref = (name) => makeFunctionReference(name);
const schema = await tsImport('../convex/schema.ts', import.meta.url);
const digest = 'a'.repeat(64),
  backupDigest = 'b'.repeat(64);

function sourceFixture() {
  const salt = '0123456789abcdef0123456789abcdef';
  const hash = scryptSync('migration-test-password', salt, 64).toString('hex');
  const metadata = [
    { version: 1, at: '2026-10-20T00:00:00Z', catalogueRevision: 1 },
    { version: 2, at: '2026-10-21T00:00:00Z', catalogueRevision: 1 },
  ];
  const payload = {
    users: [
      {
        id: 'original-user',
        name: 'Administrador sintético',
        email: 'migration-test@ifpr.edu.br',
        role: 'ADMIN',
        campusId: null,
        active: true,
        salt,
        hash,
      },
    ],
    campuses: [{ id: 'original-campus', name: 'Campus sintético' }],
    calendars: [
      {
        id: 'original-calendar',
        campusId: 'original-campus',
        version: 3,
        versions: metadata,
        state: { year: 2027, campus: 'Campus sintético', events: [] },
        extension: { _reserved: 'preservado' },
      },
    ],
    histories: [
      {
        id: 'original-history',
        calendarId: 'original-calendar',
        objectKey: 'uploads/original.pdf',
        hash: 'original-file-hash',
        filename: 'original.pdf',
      },
    ],
    reviews: [
      {
        calendarId: 'original-calendar',
        history: [{ id: 'review-version', conclusion: { text: 'Parecer preservado' } }],
      },
    ],
    audit: [
      {
        actor: 'original-user',
        action: 'SAVE_CALENDAR',
        id: 'original-calendar',
        at: '2026-10-21T00:00:00Z',
      },
    ],
    sessions: [],
    uploads: [],
    loginAttempts: [],
    invitations: [],
    passwordResets: [],
    catalogue: { revision: 1, events: [] },
  };
  return {
    source_project: sourceProject,
    app_state: [{ id: 1, payload }],
    calendar_versions: metadata.map((meta, index) => ({
      calendar_id: 'original-calendar',
      ordinal: index + 1,
      metadata: meta,
      snapshot: {
        ...meta,
        state: { year: 2027, events: [{ id: `event-${index}`, name: 'Evento sintético' }] },
        extension: { preserved: true },
      },
    })),
    storage_objects: [
      {
        name: 'uploads/original.pdf',
        bucket_id: 'calendar-files',
        metadata: { size: 20, eTag: '0'.repeat(32) },
      },
    ],
  };
}

function clientFixture() {
  process.env.CONVEX_CLOUD_URL = targetUrl;
  process.env.DENTEC_SOURCE_MIGRATION_ALLOWED = sourceProject;
  return convexTest(schema.default, {
    '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
    '../convex/migration.ts': () => tsImport('../convex/migration.ts', import.meta.url),
    '../convex/store.ts': () => tsImport('../convex/store.ts', import.meta.url),
    '../convex/nativeAuth.ts': () => tsImport('../convex/nativeAuth.ts', import.meta.url),
  });
}

test('source migration plan preserves UUIDs and archives, bounds CLI arguments and records deferred files', () => {
  const source = sourceFixture();
  const before = structuredClone(source);
  const plan = planSourceMigration(source, { deferFiles: true });
  assert.deepEqual(source, before);
  assert.equal(plan.manifest.calendarVersions, 2);
  assert.equal(plan.manifest.reviewVersions, 1);
  assert.equal(plan.manifest.expectedAccounts, 1);
  assert.equal(plan.manifest.files, 0);
  assert.equal(plan.manifest.deferredFiles, 1);
  assert.equal(plan.manifest.pendingFiles[0].path, 'uploads/original.pdf');
  const calendar = plan.baseBatches.flat().find((change) => change.field === 'calendars')
    .upserts[0];
  assert.equal(calendar.key, 'calendars:original-calendar');
  assert.deepEqual(decodeValue(calendar.value).versions, []);
  assert.equal(plan.archiveBatches.flat()[0].ordinal, 0);
  assert.deepEqual(
    decodeValue(plan.archiveBatches.flat()[1].snapshot),
    source.calendar_versions[1].snapshot,
  );
  assert(plan.baseBatches.every((batch) => Buffer.byteLength(JSON.stringify(batch)) <= 90_000));
  assert(plan.archiveBatches.every((batch) => Buffer.byteLength(JSON.stringify(batch)) <= 90_000));
  const invalid = structuredClone(source);
  invalid.calendar_versions[0].ordinal = 2;
  assert.throws(() => planSourceMigration(invalid));
  assert.equal(
    canonicalJson({ z: 1, a: { b: 2, a: 3 } }),
    canonicalJson({ a: { a: 3, b: 2 }, z: 1 }),
  );
});

test('source migration guard refuses a different deployment before changing the lab', async () => {
  const client = clientFixture();
  process.env.CONVEX_CLOUD_URL = 'https://other-deployment.convex.cloud';
  await assert.rejects(
    client.mutation(ref('migration:begin'), {
      digest,
      backupDigest,
      manifest: planSourceMigration(sourceFixture(), { deferFiles: true }).manifest,
    }),
    /deployment isolado/,
  );
  assert.equal((await client.run((ctx) => ctx.db.query('rootFields').take(10))).length, 0);
});

test('staged source migration resumes idempotently, checks every value and preserves original credentials without adding users', async () => {
  const client = clientFixture();
  const source = sourceFixture();
  const plan = planSourceMigration(source, { deferFiles: true });
  await client.run(async (ctx) => {
    const user = {
      id: 'lab-old-user',
      email: 'lab-old@ifpr.edu.br',
      name: 'Old lab',
      role: 'ADMIN',
      active: true,
    };
    const userId = await ctx.db.insert('users', {
      key: 'users:lab-old-user',
      position: 0,
      appId: user.id,
      email: user.email,
      value: encodeValue(user),
    });
    await ctx.db.insert('authAccounts', {
      userId,
      provider: 'password',
      providerAccountId: user.email,
      secret: 'lab-only',
    });
  });
  let progress = await client.mutation(ref('migration:begin'), {
    digest,
    backupDigest,
    manifest: plan.manifest,
  });
  assert.equal(progress.phase, 'clearing');
  await assert.rejects(
    client.mutation(ref('migration:begin'), {
      digest,
      backupDigest,
      manifest: planSourceMigration(source, { deferFiles: false }).manifest,
    }),
    /Outra migração ou configuração/,
  );
  await assert.rejects(
    client.mutation(ref('migration:begin'), {
      digest: 'c'.repeat(64),
      backupDigest,
      manifest: plan.manifest,
    }),
    /Outra migração/,
  );
  while (progress.phase === 'clearing')
    progress = await client.mutation(ref('migration:clearBatch'), { digest });
  assert.equal((await client.run((ctx) => ctx.db.query('users').take(10))).length, 0);
  await assert.rejects(
    client.mutation(ref('migration:appendBase'), {
      digest,
      index: 1,
      changes: plan.baseBatches[1],
    }),
    /sequência/,
  );
  for (const [index, changes] of plan.baseBatches.entries()) {
    progress = await client.mutation(ref('migration:appendBase'), { digest, index, changes });
    assert.deepEqual(
      await client.mutation(ref('migration:appendBase'), { digest, index, changes }),
      progress,
    );
  }
  for (const [index, versions] of plan.archiveBatches.entries())
    await client.mutation(ref('migration:appendArchives'), { digest, index, versions });
  progress = await client.mutation(ref('migration:prepareFiles'), { digest });
  assert.equal(progress.phase, 'files');
  assert.equal(progress.filesDeferred, 1);
  do {
    progress = await client.mutation(ref('migration:verify'), { digest });
  } while (progress.phase === 'verifying');
  assert.equal(progress.phase, 'verified');
  const bad = structuredClone(plan.contentBatches[0]);
  bad[0].hash = '0'.repeat(64);
  await assert.rejects(
    client.mutation(ref('migration:verifyContent'), { digest, index: 0, checks: bad }),
    /diverge/,
  );
  for (const [index, checks] of plan.contentBatches.entries())
    await client.mutation(ref('migration:verifyContent'), { digest, index, checks });
  await assert.rejects(client.mutation(ref('migration:finish'), { digest }), /credenciais/);
  const migrated = await client.mutation(ref('nativeAuth:initializeImportedAccounts'), {
    paginationOpts: { cursor: null, numItems: 100 },
  });
  assert.equal(migrated.imported, 1);
  const badAuth = structuredClone(plan.authBatches[0]);
  badAuth[0].secretHash = '0'.repeat(64);
  await assert.rejects(
    client.mutation(ref('migration:verifyAuth'), { digest, index: 0, checks: badAuth }),
    /Credencial migrada/,
  );
  for (const [index, checks] of plan.authBatches.entries())
    await client.mutation(ref('migration:verifyAuth'), { digest, index, checks });
  progress = await client.mutation(ref('migration:finish'), { digest });
  assert.equal(progress.phase, 'complete');
  assert.equal(progress.accounts, 1);
  const rows = await client.run((ctx) => ctx.db.query('users').take(10));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].appId, 'original-user');
  assert.equal(decodeValue(rows[0].value).hash, undefined);
  const history = await client.run((ctx) => ctx.db.query('histories').first());
  assert.equal(decodeValue(history.value).objectKey, 'uploads/original.pdf');
  assert.equal(decodeValue(history.value).hash, 'original-file-hash');
  assert.equal((await client.run((ctx) => ctx.db.query('fileObjects').take(10))).length, 0);
  const versions = await client.run((ctx) =>
    ctx.db
      .query('calendarVersions')
      .withIndex('by_ownerId_and_ordinal', (q) => q.eq('ownerId', 'calendars:original-calendar'))
      .take(10),
  );
  assert.equal(versions.length, 2);
  const snapshot = await client.run((ctx) => ctx.db.get(versions[1].snapshotId));
  assert.deepEqual(decodeValue(snapshot.value), source.calendar_versions[1].snapshot);
  const resumed = await client.mutation(ref('migration:begin'), {
    digest,
    backupDigest,
    manifest: plan.manifest,
  });
  assert.equal(resumed.phase, 'complete');
  assert.equal(resumed.contentNext, plan.contentBatches.length);
  assert.equal(resumed.authNext, plan.authBatches.length);
});
