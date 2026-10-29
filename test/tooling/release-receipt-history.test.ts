import assert from 'node:assert/strict';
import { test } from 'vitest';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../../convex/schema.ts';
import { internal } from '../../convex/_generated/api.js';
import { convexModules } from '../helpers/convex-modules.ts';

// The completed operation remains evidence, without retaining an executor.
test('completed contract receipts remain readable after their one-off functions are removed', async () => {
  const client = convexTest(schema, convexModules);
  const identity = {
    mode: 'contract' as const,
    commit: 'a'.repeat(40),
    owner: 'b'.repeat(40),
    candidateId: 'dpl_preserved',
    functionSpecHash: 'c'.repeat(64),
    planDigest: 'd'.repeat(64),
    sourceDigest: 'e'.repeat(64),
    schemaDigest: 'f'.repeat(64),
    rehearsalDigest: '1'.repeat(64),
    verificationDigest: '2'.repeat(64),
  };
  const id = await client.run(async (ctx) => {
    await ctx.db.insert('releaseReceipts', { ...identity, completedAt: 1 });
    return ctx.db.insert('releaseProgress', {
      ...identity,
      key: 'backend',
      previousBackend: '3'.repeat(40),
      previousFrontend: 'dpl_previous',
      phase: 'complete',
      changedAt: 1,
    });
  });
  const before = await client.run((ctx) => ctx.db.get(id));
  assert.deepEqual(await client.query(internal.releases.installed, {}), before);
  assert.equal(await client.query(internal.releases.status, {}), null);
  for (const name of ['contractPublished', 'contractValidated', 'contractComplete'])
    await assert.rejects(
      client.mutation(makeFunctionReference<'mutation'>(`releases:${name}`), {}),
      /no such export|not found|Could not find/,
    );
  assert.deepEqual(await client.run((ctx) => ctx.db.get(id)), before);
  const receipts = await client.run((ctx) => ctx.db.query('releaseReceipts').take(2));
  assert.equal(receipts.length, 1);
  assert('verificationDigest' in receipts[0]);
  assert.equal(receipts[0].verificationDigest, identity.verificationDigest);
});
