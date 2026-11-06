import { expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import { internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { convexModules } from '../helpers/convex-modules';

const hash = 'a'.repeat(64);

async function stored() {
  const client = convexTest(schema, convexModules);
  const { id, other, storageId } = await client.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['%PDF-'], { type: 'application/pdf' }));
    const fields = {
      year: 2027,
      type: 'norma' as const,
      title: 'Norma',
      source: 'Fonte',
      filename: 'norma.pdf',
      status: 'vigente' as const,
      version: 1,
      createdAt: 1,
    };
    return {
      id: await ctx.db.insert('documents', { ...fields, hash, storageId }),
      other: await ctx.db.insert('documents', { ...fields, hash: 'b'.repeat(64) }),
      storageId,
    };
  });
  return { client, id, other, storageId };
}

test('removes the document, its file and records the operation, only once', async () => {
  const { client, id, other, storageId } = await stored();
  const retire = { id, hash };
  expect(await client.mutation(internal.documents.retire.retireDocument, retire)).toEqual({
    deleted: true,
  });
  await client.run(async (ctx) => {
    expect(await ctx.db.get(id)).toBeNull();
    expect(await ctx.db.get(other)).not.toBeNull();
    expect(await ctx.db.system.get(storageId)).toBeNull();
    const audit = await ctx.db.query('audit').collect();
    expect(audit.map((row) => row.action)).toEqual(['DELETE_INSTITUTIONAL_DOCUMENT']);
  });
  expect(await client.mutation(internal.documents.retire.retireDocument, retire)).toEqual({
    deleted: false,
  });
});

test('refuses a hash that is not the document one and changes nothing', async () => {
  const { client, id, storageId } = await stored();
  await expect(
    client.mutation(internal.documents.retire.retireDocument, { id, hash: 'c'.repeat(64) }),
  ).rejects.toThrow('SHA-256');
  await client.run(async (ctx) => {
    expect(await ctx.db.get(id)).not.toBeNull();
    expect(await ctx.db.system.get(storageId)).not.toBeNull();
  });
});
