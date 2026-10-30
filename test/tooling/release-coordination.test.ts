import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  parseReleaseStatus,
  assertReleaseAvailability,
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

test('serial migrations wait for unstarted steps while their report remains in progress', async () => {
  const next = { ...migration('unknown'), name: 'migrations:nextStep' };
  const report = { ...migration('inProgress'), name: 'migrations:report' };
  const completed = [
    migration('success'),
    { ...next, state: 'success' as const },
    { ...report, state: 'success' as const },
  ];
  const statuses = [
    [migration('inProgress'), next, report],
    [migration('success'), next, report],
    [migration('success'), { ...next, state: 'success' as const }, report],
    completed,
  ];
  let reads = 0;
  let sleeps = 0;
  const result = await waitForMigrations(() => statuses[reads++]!, {
    sleep: async (milliseconds) => {
      assert.equal(milliseconds, 2000);
      sleeps++;
    },
  });
  assert.deepEqual(result, completed);
  assert.equal(reads, 4);
  assert.equal(sleeps, 3);
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

test('failed and canceled migrations stop even while other steps remain in progress', async () => {
  for (const state of ['failed', 'canceled'] as const)
    await assert.rejects(
      waitForMigrations(
        () => [migration('unknown'), migration('inProgress'), migration(state, 'Stopped')],
        { sleep: async () => assert.fail('A terminal migration must stop without another poll.') },
      ),
      new RegExp(`fillLabel terminou como ${state}: Stopped`),
    );
});

test('an unstarted migration stops when its report finishes without starting it', async () => {
  const report = { ...migration('inProgress'), name: 'migrations:report' };
  let sleeps = 0;
  await assert.rejects(
    waitForMigrations(
      () => [migration('unknown'), { ...report, state: sleeps ? 'success' : 'inProgress' }],
      { sleep: async () => void sleeps++ },
    ),
    /fillLabel terminou como unknown/,
  );
  assert.equal(sleeps, 1);
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

test('an active report with unstarted steps still respects the migration timeout', async () => {
  let time = 0;
  await assert.rejects(
    waitForMigrations(() => [migration('unknown'), migration('inProgress')], {
      timeoutMs: 10,
      now: () => time,
      sleep: async () => {
        time += 10;
      },
    }),
    /progresso no Convex foi preservado/,
  );
});

test('planned maintenance release requires the exact owner, no emergency and drained actions', () => {
  const owner = 'a'.repeat(40);
  const status = { emergency: false, paused: true, commit: owner, active: [] };
  assert.doesNotThrow(() => assertReleaseAvailability(status, owner));
  assert.throws(() => assertReleaseAvailability(status), /manutenção ativa/);
  assert.throws(() => assertReleaseAvailability(status, 'b'.repeat(40)), /não pertence/);
  assert.throws(
    () => assertReleaseAvailability({ ...status, paused: false }, owner),
    /não pertence/,
  );
  assert.throws(
    () => assertReleaseAvailability({ ...status, emergency: true }, owner),
    /emergencial/,
  );
  assert.throws(
    () =>
      assertReleaseAvailability(
        { ...status, active: [{ id: 'lease', operation: 'upload', startedAt: 0 }] },
        owner,
      ),
    /drenagem/,
  );
});
