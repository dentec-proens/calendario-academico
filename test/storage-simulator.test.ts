import { test } from 'vitest';
import assert from 'node:assert/strict';
import { convexTest } from 'convex-test';
import { defineSchema, defineTable, mutationGeneric, makeFunctionReference } from 'convex/server';
import { v, type GenericId } from 'convex/values';

const schema = defineSchema({ markers: defineTable({ value: v.string() }) });
const child = makeFunctionReference<'mutation'>('storage:child');
const outer = makeFunctionReference<'mutation'>('storage:outer');
const primitive = makeFunctionReference<'mutation'>('storage:primitive');
const attempted: GenericId<'_storage'>[] = [];
const functions = {
  primitive: mutationGeneric({
    args: {
      id: v.optional(v.id('_storage')),
      badDigest: v.optional(v.boolean()),
      rollbackDelete: v.optional(v.boolean()),
    },
    handler: async (ctx, { id, badDigest, rollbackDelete }) => {
      if (id) {
        const blob = await ctx.storage.get(id);
        if (blob) {
          assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array([0, 255, 1]));
          assert.equal(blob.type, 'application/octet-stream');
        }
        await ctx.storage.delete(id);
        if (rollbackDelete) throw Error('delete rollback');
        return null;
      }
      const stored = await ctx.storage.store(
        new Blob([new Uint8Array([0, 255, 1])], { type: 'application/octet-stream' }),
        badDigest ? { sha256: 'incorrect' } : undefined,
      );
      const blob = await ctx.storage.get(stored);
      assert.deepEqual(new Uint8Array(await blob!.arrayBuffer()), new Uint8Array([0, 255, 1]));
      assert.equal(blob!.type, 'application/octet-stream');
      assert.equal((await ctx.db.system.get(stored))!.size, 3);
      return stored;
    },
  }),
  child: mutationGeneric({
    args: { fail: v.boolean() },
    handler: async (ctx, { fail }) => {
      const id = await ctx.storage.store(new Blob(['child'], { type: 'text/plain' }));
      attempted.push(id);
      await ctx.db.insert('markers', { value: id });
      if (fail) throw Error('child rollback');
      return id;
    },
  }),
  outer: mutationGeneric({
    args: { childFails: v.boolean(), outerFails: v.boolean() },
    handler: async (ctx, { childFails, outerFails }) => {
      const id = await ctx.storage.store(new Blob(['parent'], { type: 'text/plain' }));
      attempted.push(id);
      await ctx.db.insert('markers', { value: id });
      try {
        await ctx.runMutation(child, { fail: childFails });
      } catch {
        /* Assert below that only the child's writes were rolled back. */
      }
      if (outerFails) throw Error('outer rollback');
      return id;
    },
  }),
};
function fixture() {
  attempted.length = 0;
  return convexTest(schema, {
    './_generated/server.js': () => import('../convex/_generated/server.js'),
    './storage.ts': async () => functions,
  });
}

test('SDK mutation store/get/delete preserves bytes, metadata and digest verification', async () => {
  const t = fixture();
  const id = await t.mutation(primitive, {});
  await assert.rejects(t.mutation(primitive, { badDigest: true }), /digest/);
  await assert.rejects(t.mutation(primitive, { id, rollbackDelete: true }), /delete rollback/);
  await t.mutation(primitive, { id });
  await t.run(async (ctx) => {
    assert.equal(await ctx.storage.get(id), null);
    assert.equal(await ctx.db.system.get(id), null);
  });
});

test('outer rollback discards storage and database writes from successful child transaction', async () => {
  const t = fixture();
  await assert.rejects(
    t.mutation(outer, { childFails: false, outerFails: true }),
    /outer rollback/,
  );
  await t.run(async (ctx) => {
    assert.deepEqual(await ctx.db.query('markers').collect(), []);
    assert.deepEqual(await ctx.db.system.query('_storage').collect(), []);
    for (const id of attempted) assert.equal(await ctx.storage.get(id), null);
  });
});

test('child rollback preserves parent storage, and rolled-back deletion restores its object', async () => {
  const t = fixture();
  await t.mutation(outer, { childFails: true, outerFails: false });
  const [row] = await t.run((ctx) => ctx.db.system.query('_storage').collect());
  await assert.rejects(
    t.run(async (ctx) => {
      await ctx.storage.delete(row._id);
      throw Error('delete rollback');
    }),
    /delete rollback/,
  );
  await t.run(async (ctx) => {
    assert.equal((await ctx.db.system.query('_storage').collect()).length, 1);
    assert.equal((await ctx.db.query('markers').collect()).length, 1);
    assert.equal(await (await ctx.storage.get(row._id))!.text(), 'parent');
    assert.equal(await ctx.storage.get(attempted[1]), null);
  });
});
