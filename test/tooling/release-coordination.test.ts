import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  parseReleaseStatus,
  waitForMigrations,
  type MigrationProgress,
} from '../../scripts/release-coordination';

const migration = (state: MigrationProgress['state'], error: string | null = null) => ({
  name: 'migrations:fillLabel',
  state,
  processed: 2,
  error,
});

test('operational status fails closed on incomplete evidence', () => {
  assert.throws(() => parseReleaseStatus('{"paused":true,"commit":null}'), /válido/);
  assert.deepEqual(
    parseReleaseStatus('{"emergency":false,"paused":false,"commit":null,"active":[]}'),
    { emergency: false, paused: false, commit: null, active: [] },
  );
});

test('migrations are awaited until every one succeeds', async () => {
  const states = [[migration('inProgress')], [migration('success')]];
  let sleeps = 0;
  const result = await waitForMigrations(() => states.shift()!, {
    sleep: async () => {
      sleeps++;
    },
  });
  assert.deepEqual(result, [migration('success')]);
  assert.equal(sleeps, 1);
  assert.deepEqual(await waitForMigrations(() => []), []);
});

test('a failed, canceled or unstarted migration stops the release with its error', async () => {
  await assert.rejects(
    waitForMigrations(() => [migration('failed', 'Invalid document')]),
    /fillLabel terminou como failed: Invalid document/,
  );
  await assert.rejects(
    waitForMigrations(() => [migration('canceled')]),
    /canceled/,
  );
  await assert.rejects(
    waitForMigrations(() => [migration('unknown')]),
    /unknown/,
  );
});

test('slow migrations time out without cancelling their progress', async () => {
  let time = 0;
  await assert.rejects(
    waitForMigrations(() => [migration('inProgress')], {
      timeoutMs: 10,
      now: () => time,
      sleep: async () => {
        time += 10;
      },
    }),
    /progresso no Convex foi preservado/,
  );
});
