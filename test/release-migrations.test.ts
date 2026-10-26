import { test, expect } from 'vitest';
import { convexTest } from 'convex-test';
import { defineSchema, defineTable, makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import schema from '../convex/schema';
import { convexModules } from './helpers/convex-modules';
import type { ReleasePlan } from '../convex/releases/plan';
import { migrateAndVerify } from '../scripts/release-backend';
const begin = makeFunctionReference<'mutation'>('releases:begin'),
  batch = makeFunctionReference<'mutation'>('releases:batch'),
  status = makeFunctionReference<'query'>('releases:status'),
  validated = makeFunctionReference<'mutation'>('releases:validated'),
  complete = makeFunctionReference<'mutation'>('releases:complete');
const plan: ReleasePlan = {
  version: 1,
  baseline: 'a'.repeat(40),
  strategy: 'expand',
  guarantees: { oldClients: true, oldWriters: true, scheduledFunctions: true, sessions: true },
  rationale: 'Adiciona um rótulo opcional preservando nomes e contratos de escritores antigos.',
  tests: ['test/release-migrations.test.ts'],
  migrations: [
    {
      id: 'fill-release-label',
      table: 'campuses',
      field: 'releaseLabel',
      source: { kind: 'copy', field: 'name' },
    },
  ],
};
const owner = 'c'.repeat(40),
  commit = 'b'.repeat(40);
function fixture() {
  return convexTest(
    defineSchema({
      ...schema.tables,
      campuses: defineTable({
        name: v.string(),
        archived: v.boolean(),
        releaseLabel: v.optional(v.string()),
      }).index('by_name', ['name']),
    }),
    convexModules,
  );
}
const args = {
  commit,
  previousBackend: plan.baseline,
  previousFrontend: 'dpl_old',
  owner,
  contractHash: 'd'.repeat(64),
  planHash: 'e'.repeat(64),
  plan,
};
test('bounded additive batches checkpoint atomically, preserve existing values, auth sessions and concurrent edits, then verify', async () => {
  const t = fixture();
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert('users', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'ADMIN',
      active: true,
      loginMethod: 'local',
    });
    const session = await ctx.db.insert('authSessions', {
      userId: user,
      expirationTime: Date.now() + 86400000,
    });
    const campuses = [];
    for (let i = 0; i < 121; i++)
      campuses.push(
        await ctx.db.insert('campuses', {
          name: `Campus ${i}`,
          archived: false,
          ...(i === 0 ? { releaseLabel: 'User value' } : {}),
        }),
      );
    return { session, campuses };
  });
  const sessionBefore = await t.run((ctx) => ctx.db.get(ids.session));
  await t.mutation(begin, args);
  expect(await t.mutation(batch, { owner, id: 'fill-release-label', verify: false })).toMatchObject(
    { done: false, count: 49 },
  );
  // A writer changes the next row before it is migrated. The new value, not a
  // stale exported snapshot, is copied inside the same transaction as its cursor.
  await t.run((ctx) => ctx.db.patch(ids.campuses[70]!, { name: 'Updated concurrently' }));
  for (let i = 0; i < 3; i++)
    await t.mutation(batch, { owner, id: 'fill-release-label', verify: false });
  const finished = await t.query(status, {});
  expect(finished.migrations[0].count).toBe(120);
  expect(await t.mutation(batch, { owner, id: 'fill-release-label', verify: false })).toEqual({
    done: true,
    count: 120,
  });
  await expect(t.mutation(validated, { owner, candidateId: 'dpl_new' })).rejects.toThrow(
    /Migrações/,
  );
  for (let i = 0; i < 3; i++)
    await t.mutation(batch, { owner, id: 'fill-release-label', verify: true });
  await t.mutation(validated, { owner, candidateId: 'dpl_new' });
  await t.mutation(complete, { owner, candidateId: 'dpl_new' });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(ids.session)).toEqual(sessionBefore);
    expect((await ctx.db.get(ids.campuses[0]!))!.releaseLabel).toBe('User value');
    expect((await ctx.db.get(ids.campuses[70]!))!.releaseLabel).toBe('Updated concurrently');
    expect(await ctx.db.query('campuses').collect()).toHaveLength(121);
  });
});
test('a failed batch rolls back both row patches and checkpoint; the same plan resumes under a new owner', async () => {
  const t = fixture();
  const ids = await t.run(async (ctx) => [
    await ctx.db.insert('campuses', { name: 'One', archived: false }),
    await ctx.db.insert('campuses', { name: 'Two', archived: false }),
  ]);
  const bad = {
    ...plan,
    migrations: [
      { ...plan.migrations[0]!, source: { kind: 'copy' as const, field: 'releaseLabel' } },
    ],
  };
  await t.mutation(begin, { ...args, plan: bad });
  await expect(
    t.mutation(batch, { owner, id: 'fill-release-label', verify: false }),
  ).rejects.toThrow(/origem/);
  expect((await t.query(status, {})).migrations[0].cursor).toBeNull();
  expect((await t.run((ctx) => ctx.db.get(ids[0]!)))!.releaseLabel).toBeUndefined();
  await t.mutation(begin, { ...args, plan: bad, owner: 'f'.repeat(40), previousOwner: owner });
  await expect(
    t.mutation(batch, { owner, id: 'fill-release-label', verify: false }),
  ).rejects.toThrow(/reserva/);
  await expect(
    t.mutation(begin, { ...args, commit: 'f'.repeat(40), previousOwner: 'f'.repeat(40) }),
  ).rejects.toThrow(/pendente|identidade/);
});
test('driver validates every migration before promotion and stops on timeout or invalid checkpoint', async () => {
  const calls: boolean[] = [];
  await migrateAndVerify(plan, (_id, verify) => {
    calls.push(verify);
    return { done: calls.length % 2 === 0, count: 1 };
  });
  expect(calls).toEqual([false, false, true, true]);
  await expect(
    migrateAndVerify(plan, () => ({ done: false, count: 0 }), {
      now: (() => {
        let time = 0;
        return () => time++;
      })(),
      timeoutMs: 1,
    }),
  ).rejects.toThrow(/preservados/);
  await expect(migrateAndVerify(plan, () => ({ done: true, count: -1 }))).rejects.toThrow(
    /checkpoint/,
  );
});
