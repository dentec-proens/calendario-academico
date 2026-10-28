import { afterEach, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { makeFunctionReference } from 'convex/server';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { api, internal } from '../convex/_generated/api.js';
import { createNativeFixture } from './helpers/native-database.ts';
import { withoutManualSources } from '../src/manual-sources.ts';
import {
  createCleanupPlan,
  readCleanupSnapshot,
  verifyCleanupSnapshot,
} from '../scripts/manual-source-cleanup.ts';
import { canonical, fingerprint, identity } from '../convex/maintenance/manualSourceProtocol.ts';
import type {
  CleanupBatchArgs,
  CleanupBatchResult,
  CleanupReceipt,
} from '../convex/maintenance/manualSourceProtocol.ts';
import type { CleanupSnapshot } from '../scripts/manual-source-cleanup.ts';

const applyBatch = makeFunctionReference<'mutation', CleanupBatchArgs, CleanupBatchResult>(
  'maintenance/manualSources:applyBatch',
);
const commit = 'a'.repeat(40);
const cloudUrl = 'http://127.0.0.1:3210';
afterEach(() => vi.unstubAllEnvs());

function offlineSnapshot(): CleanupSnapshot {
  return {
    sha256: 'b'.repeat(64),
    files: {},
    tables: {
      _tables: [],
      _storage: [],
      calendarContents: [
        {
          _id: 'content',
          _creationTime: 1,
          calendarId: 'calendar',
          state: {
            weekEvidence: 'Ata',
            weekdays: [1],
            events: [{ id: 'one', evidence: 'Local', start: '2027-03-01', end: '2027-03-01' }],
          },
          institutionalSnapshot: [{ evidence: 'Preservada' }],
        },
      ],
      calendarSnapshots: [
        {
          _id: 'snapshot',
          _creationTime: 2,
          state: { year: 2027, weekEvidence: 'Anterior', events: [] },
          institutionalEvents: [{ evidence: 'Preservada' }],
        },
      ],
      '_components/presence/users': [{ _id: 'presence', _creationTime: 3, value: 'inalterado' }],
    },
  };
}

test('offline plan binds every namespace and exact before/after geometry projection, contains no old source text', () => {
  const source = offlineSnapshot();
  const projection = {
    sourceSha256: source.sha256,
    states: {
      'calendarContents:content': { count: 1, deadline: '2027-03-02' },
      'calendarSnapshots:snapshot': { count: 0 },
    },
  };
  const before = structuredClone(source);
  const plan = createCleanupPlan(source, commit, projection, projection);
  expect(source).toEqual(before);
  expect(plan.removed).toBe(3);
  expect(plan.batches).toHaveLength(2);
  expect(plan.tables['_components/presence/users']).toBeDefined();
  expect(canonical(plan)).not.toContain('Ata');
  expect(plan.projectionDigest).toBe(fingerprint(projection));
  expect(() =>
    createCleanupPlan(
      source,
      commit,
      { ...projection, sourceSha256: 'c'.repeat(64) },
      { ...projection, sourceSha256: 'c'.repeat(64) },
    ),
  ).toThrow(/outro backup/);
  expect(() =>
    createCleanupPlan(source, commit, projection, { sourceSha256: source.sha256, states: {} }),
  ).toThrow(/projeções/);
  const changed = structuredClone(source);
  changed.tables['_components/presence/users'][0].value = 'alterado';
  expect(() => verifyCleanupSnapshot(plan, changed, 'before')).toThrow(/namespace/);
  verifyCleanupSnapshot(plan, source, 'before');
  const registryDrift = structuredClone(source);
  registryDrift.tables._tables.push({
    name: 'unexpected',
    id: 1,
  } as unknown as CleanupSnapshot['tables'][string][number]);
  expect(() => verifyCleanupSnapshot(plan, registryDrift, 'before')).toThrow(/namespace _tables/);
  const storageDrift = structuredClone(source);
  storageDrift.files['unplanned'] = { size: 1, sha256: 'a'.repeat(64) };
  expect(() => verifyCleanupSnapshot(plan, storageDrift, 'before')).toThrow(/Storage/);
});

test('ZIP reader preserves component namespaces and validates root/component Storage bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'manual-source-zip-'));
  try {
    const blob = strToU8('bytes preservados');
    // Reuse the same SHA-256 primitive, hashing raw bytes rather than a JSON value.
    const hash = createHash('sha256').update(blob).digest('hex');
    const archive: Record<string, Uint8Array> = {
      '_tables/documents.jsonl': new Uint8Array(),
      '_storage/documents.jsonl': new Uint8Array(),
      '_components/presence/users/documents.jsonl': strToU8(
        JSON.stringify({ _id: 'presence', _creationTime: 3, evidence: 'Não apagar' }),
      ),
    };
    const path = join(directory, 'source.zip');
    writeFileSync(path, zipSync(archive));
    const snapshot = readCleanupSnapshot(path);
    expect(snapshot.tables['_components/presence/users'][0].evidence).toBe('Não apagar');
    archive['_components/files/_storage/documents.jsonl'] = strToU8(
      JSON.stringify({ _id: 'file', _creationTime: 4, size: blob.byteLength, sha256: hash }),
    );
    archive['_components/files/_storage/file.bin'] = blob;
    writeFileSync(path, zipSync(archive));
    expect(readCleanupSnapshot(path).files['_components/files/_storage/file.bin']).toEqual({
      size: blob.byteLength,
      sha256: hash,
    });
    archive['_components/files/_storage/file.bin'] = strToU8('bytes divergentes');
    writeFileSync(path, zipSync(archive));
    expect(() => readCleanupSnapshot(path)).toThrow(/SHA-256/);
    expect(readFileSync(path).byteLength).toBeGreaterThan(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('native cleanup requires owned drained maintenance, verifies row fingerprints, replays safely and preserves institutional snapshots', async () => {
  vi.stubEnv('CONVEX_CLOUD_URL', cloudUrl);
  const fixture = await createNativeFixture();
  const actor = fixture.asClient('campus-a');
  const record = await actor.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Sintético',
      purpose: 'test',
    },
  });
  await actor.mutation(api.calendars.saveCalendar, {
    id: record.id,
    body: {
      version: record.version,
      catalogueRevision: record.catalogueRevision,
      state: {
        ...record.state,
        events: [
          {
            id: 'seed',
            name: 'Evento',
            kind: 'note',
            start: '2027-03-01',
            end: '2027-03-01',
            evidence: 'Fonte',
          },
        ],
      },
    },
  });
  const source = await fixture.client.run(async (ctx) => {
    const content = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id))
      .unique();
    if (!content) throw Error('Conteúdo ausente');
    await ctx.db.patch(content._id, {
      state: {
        ...content.state,
        weekEvidence: 'Texto a remover',
        teacherVacations: { firstStart: '2027-01-01', firstEnd: '2027-01-10', evidence: 'Ata' },
        events: [
          {
            id: 'manual',
            name: 'Evento',
            kind: 'note',
            start: '2027-03-01',
            end: '2027-03-01',
            evidence: 'Fonte local',
          },
        ],
      },
    });
    const first = await ctx.db.query('calendarSnapshots').first();
    if (!first) throw Error('Snapshot ausente');
    const { _id: _snapshotId, _creationTime: _at, ...value } = first;
    for (let index = 0; index < 11; index++) await ctx.db.insert('calendarSnapshots', value);
    const historical = await ctx.db.query('calendarSnapshots').take(20);
    for (const row of historical)
      await ctx.db.patch(row._id, { state: { ...row.state, weekEvidence: 'Fonte histórica' } });
    return {
      sha256: 'b'.repeat(64),
      files: {},
      tables: {
        _tables: [],
        _storage: [],
        calendarContents: await ctx.db.query('calendarContents').take(10),
        calendarSnapshots: await ctx.db.query('calendarSnapshots').take(20),
        audit: await ctx.db.query('audit').take(100),
      },
    } satisfies CleanupSnapshot;
  });
  const keys = Object.fromEntries(
    (['calendarContents', 'calendarSnapshots'] as const).flatMap((table) =>
      source.tables[table].map((row) => [`${table}:${row._id}`, { unchanged: true }]),
    ),
  );
  const projection = { sourceSha256: source.sha256, states: keys };
  const plan = createCleanupPlan(source, commit, projection, projection);
  const first = plan.batches[0];
  const args: CleanupBatchArgs = {
    ...identity(plan),
    table: first.table,
    entries: first.entries,
    batchDigest: first.digest,
    mode: 'rehearsal',
  };
  await expect(fixture.client.mutation(applyBatch, args)).rejects.toThrow(/manutenção exclusiva/);
  await fixture.client.mutation(internal.operations.pause, { commit });
  const lease = await fixture.client.run((ctx) =>
    ctx.db.insert('operationalLeases', { operation: 'teste', startedAt: Date.now() }),
  );
  await expect(fixture.client.mutation(applyBatch, args)).rejects.toThrow(/drenagem/);
  await fixture.client.run((ctx) => ctx.db.delete(lease));
  const corruptEntries = first.entries.map((entry) => ({ ...entry, after: 'c'.repeat(64) }));
  await expect(
    fixture.client.mutation(applyBatch, {
      ...args,
      entries: corruptEntries,
      batchDigest: fingerprint({ table: first.table, entries: corruptEntries }),
    }),
  ).rejects.toThrow(/seis caminhos/);
  const firstResult = await fixture.client.mutation(applyBatch, args);
  expect(firstResult.changed).toBe(first.entries.length);
  expect((await fixture.client.mutation(applyBatch, args)).replayed).toBe(first.entries.length);
  const second = plan.batches[1];
  const changedEntries = second.entries.map((entry, index) =>
    index === 1 ? { ...entry, before: 'd'.repeat(64) } : entry,
  );
  await expect(
    fixture.client.mutation(applyBatch, {
      ...args,
      table: second.table,
      entries: changedEntries,
      batchDigest: fingerprint({ table: second.table, entries: changedEntries }),
    }),
  ).rejects.toThrow(/mudou depois do backup/);
  const stillOriginal = await fixture.client.run((ctx) => {
    const id = ctx.db.normalizeId(second.table, second.entries[0].id);
    if (!id) throw Error('ID inválido');
    return ctx.db.get(id);
  });
  expect(fingerprint(stillOriginal)).toBe(second.entries[0].before);
  for (const batch of plan.batches.slice(1))
    await fixture.client.mutation(applyBatch, {
      ...args,
      table: batch.table,
      entries: batch.entries,
      batchDigest: batch.digest,
    });
  const actual = await fixture.client.run(async (ctx) => ({
    ...source,
    tables: {
      ...source.tables,
      calendarContents: await ctx.db.query('calendarContents').take(10),
      calendarSnapshots: await ctx.db.query('calendarSnapshots').take(20),
      audit: await ctx.db.query('audit').take(100),
    },
  }));
  verifyCleanupSnapshot(plan, actual, 'after');
  expect(actual.tables.calendarContents).toEqual(
    source.tables.calendarContents.map((row) => ({
      ...row,
      state: withoutManualSources(row.state).state,
    })),
  );
  expect(actual.tables.calendarSnapshots).toEqual(
    source.tables.calendarSnapshots.map((row) => ({
      ...row,
      state: withoutManualSources(row.state).state,
    })),
  );
});

test('production refuses rehearsal mode and requires matching verified external rehearsal receipt', async () => {
  vi.stubEnv('CONVEX_CLOUD_URL', 'https://exuberant-cheetah-138.convex.cloud');
  const fixture = await createNativeFixture();
  const plan = createCleanupPlan(offlineSnapshot(), commit);
  const batch = plan.batches[0];
  const args: CleanupBatchArgs = {
    ...identity(plan),
    table: batch.table,
    entries: batch.entries,
    batchDigest: batch.digest,
    mode: 'rehearsal',
  };
  await expect(fixture.client.mutation(applyBatch, args)).rejects.toThrow(/ensaio exige/);
  await expect(
    fixture.client.mutation(applyBatch, { ...args, mode: 'production' }),
  ).rejects.toThrow(/Produção exige ensaio/);
  const receipt: CleanupReceipt = {
    ...identity(plan),
    format: 1,
    operation: 'manual-sources',
    mode: 'rehearsal',
    deploymentUrl: cloudUrl,
    verifiedSnapshotSha256: 'e'.repeat(64),
    removed: plan.removed,
    result: 'verified',
    presenceReportDigest: 'f'.repeat(64),
    digest: '',
  };
  receipt.digest = fingerprint({ ...receipt, digest: '' });
  await expect(
    fixture.client.mutation(applyBatch, {
      ...args,
      mode: 'production',
      projectionDigest: 'f'.repeat(64),
      rehearsal: receipt,
    }),
  ).rejects.toThrow(/recibo não comprova/);
});

test('unknown or duplicated CLI flags fail before loading a plan or contacting a deployment', () => {
  for (const args of [
    ['apply', '--dry-run', 'true'],
    ['apply', '--plan', '/missing/a', '--plan', '/missing/b'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/manual-source-cleanup.ts', ...args],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('nenhuma operação iniciada');
  }
});
