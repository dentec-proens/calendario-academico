import type { Id } from '../convex/_generated/dataModel';
import { test, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { convexTest } from 'convex-test';
import { api, internal } from '../convex/_generated/api.js';
import { encodeValue } from '../src/convex-codec.mjs';

async function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  process.env.CONVEX_SITE_URL = 'https://isolated.convex.site';
  const { default: schema } = await import('../convex/schema.ts');
  const client = convexTest(schema, {
    '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
    '../convex/nativeFiles.ts': () => import('../convex/nativeFiles.ts'),
    '../convex/nativeActions.ts': () => import('../convex/nativeActions.ts'),
    '../convex/nativeAuth.ts': () => import('../convex/nativeAuth.ts'),
    '../convex/native.ts': () => import('../convex/native.ts'),
  });
  const identities = await client.run(async (ctx) => {
    const result = [];
    for (const id of ['a', 'b']) {
      const user = {
        id,
        name: id,
        email: `${id}@ifpr.edu.br`,
        role: 'CAMPUS',
        campusId: id,
        active: true,
      };
      const userId: Id<'users'> = await ctx.db.insert('users', {
        appId: id,
        email: user.email,
        key: `users/${id}`,
        position: result.length,
        value: encodeValue(user),
      });
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 3600000,
      });
      result.push({ subject: `${userId}|${sessionId}` });
    }
    return result;
  });
  const users = identities.map((identity) => client.withIdentity(identity));
  const put = (contents: BlobPart = '%PDF-fixture') =>
    client.run((ctx) => ctx.storage.store(new Blob([contents], { type: 'application/pdf' })));
  const issue = (who = 0, size = 12, filename = 'calendar.pdf') =>
    users[who].mutation(api.nativeFiles.issueUpload, { filename, size });
  const complete = (uploadId: string, storageId: Id<'_storage'>, who = 0) =>
    users[who].action(api.nativeActions.completeUpload, { uploadId, storageId });
  return { client, users, put, issue, complete };
}

test('native upload tickets enforce auth, filename, 8 MB bound, owner and three pending uploads', async () => {
  const { client, users, issue, put, complete } = await fixture();
  await assert.rejects(
    client.mutation(api.nativeFiles.issueUpload, { filename: 'x.pdf', size: 12 }),
    /Entre com sua conta/,
  );
  for (const [filename, size] of [
    ['x.txt', 12],
    ['x.pdf', 4],
    ['x.pdf', 8_000_001],
    ['x.pdf', 12.5],
    ['x'.repeat(181) + '.pdf', 12],
  ] as [string, number][])
    await assert.rejects(issue(0, size, filename), /PDF de até 8 MB/);
  const one = await issue();
  assert.match(one.uploadUrl, /^https?:\/\//);
  assert.match(one.uploadId, /^[a-f0-9]{64}$/);
  const storageId = await put();
  await assert.rejects(complete(one.uploadId, storageId, 1), /Envio expirado ou não encontrado/);
  await assert.rejects(
    users[1].query(internal.nativeFiles.uploadContext, { uploadId: one.uploadId }),
    /Envio expirado ou não encontrado/,
  );
  await issue();
  await issue();
  await assert.rejects(issue(), /Conclua os envios pendentes/);
});

test('native upload completion validates PDF bytes and stores a server computed SHA-256', async () => {
  const { client, users, issue, put, complete } = await fixture();
  const upload = await issue();
  await assert.rejects(complete(upload.uploadId, await put('not a PDF!!!')), /PDF de até 8 MB/);
  await assert.rejects(
    complete(upload.uploadId, await put('%PDF-longer-fixture')),
    /tamanho do PDF/,
  );
  const storageId = await put();
  assert.deepEqual(await complete(upload.uploadId, storageId), { uploadId: upload.uploadId });
  const metadata = await users[0].query(internal.nativeFiles.uploadContext, {
    uploadId: upload.uploadId,
  });
  assert.equal(metadata.hash, createHash('sha256').update('%PDF-fixture').digest('hex'));
  assert.equal(metadata.size, 12);
  assert.equal(metadata.storageId, storageId);
  assert.equal(metadata.objectKey, 'uploads/' + upload.uploadId + '.pdf');
  assert(metadata.completedAt);
  assert.deepEqual(await complete(upload.uploadId, storageId), { uploadId: upload.uploadId });
  await assert.rejects(complete(upload.uploadId, await put()), /Envio já concluído/);
  const other = await issue();
  await assert.rejects(complete(other.uploadId, storageId), /Arquivo já cadastrado/);
  await assert.rejects(
    users[0].mutation(internal.nativeFiles.finishUpload, {
      uploadId: other.uploadId,
      storageId: await put(),
      size: 12,
      hash: 'forged',
    }),
    /Envio expirado ou inválido/,
  );
  const huge = new Uint8Array(8_000_001);
  huge.set(new TextEncoder().encode('%PDF-'));
  const hugeId = await put(huge);
  await assert.rejects(complete(other.uploadId, hugeId), /PDF de até 8 MB/);
  assert(await client.run(async (ctx) => (await ctx.storage.get(storageId)) !== null));
});

test('expired or consumed uploads cannot be reused and cleanup preserves files already attached', async () => {
  const { client, users, issue, put, complete } = await fixture();
  const one = await issue(),
    oneStorage = await put();
  await complete(one.uploadId, oneStorage);
  const two = await issue(),
    twoStorage = await put();
  await complete(two.uploadId, twoStorage);
  await client.run(async (ctx) => {
    const expired = await ctx.db
      .query('nativeUploads')
      .withIndex('by_uploadId', (q) => q.eq('uploadId', one.uploadId))
      .unique();
    const consumed = await ctx.db
      .query('nativeUploads')
      .withIndex('by_uploadId', (q) => q.eq('uploadId', two.uploadId))
      .unique();
    await ctx.db.patch(expired!._id, { expiresAt: Date.now() - 1 });
    await ctx.db.patch(consumed!._id, { consumedAt: Date.now() });
  });
  for (const uploadId of [one.uploadId, two.uploadId])
    await assert.rejects(
      users[0].query(internal.nativeFiles.uploadContext, { uploadId }),
      /Envio expirado ou não encontrado/,
    );
  await client.mutation(internal.nativeFiles.expireUpload, { uploadId: one.uploadId });
  await client.mutation(internal.nativeFiles.expireUpload, { uploadId: two.uploadId });
  assert.equal(
    await client.run(async (ctx) => (await ctx.storage.get(oneStorage)) !== null),
    false,
  );
  assert(await client.run(async (ctx) => (await ctx.storage.get(twoStorage)) !== null));
  assert.equal(
    await client.query(internal.nativeFiles.fileId, { path: 'uploads/' + one.uploadId + '.pdf' }),
    null,
  );
  assert.equal(
    await client.query(internal.nativeFiles.fileId, { path: 'uploads/' + two.uploadId + '.pdf' }),
    twoStorage,
  );
});

test('download tickets store only token hashes, expire, and delete only ephemeral PDF bytes', async () => {
  const { client, users, put } = await fixture();
  const permanent = await put(),
    ephemeral = await put();
  await assert.rejects(
    client.mutation(internal.nativeFiles.ticket, {
      storageId: permanent,
      filename: 'calendar.pdf',
      ephemeral: false,
    }),
    /Entre com sua conta/,
  );
  const permanentTicket = await users[0].mutation(internal.nativeFiles.ticket, {
    storageId: permanent,
    filename: 'calendar.pdf',
    ephemeral: false,
  });
  const ephemeralTicket = await users[0].mutation(internal.nativeFiles.ticket, {
    storageId: ephemeral,
    filename: 'draft.pdf',
    ephemeral: true,
  });
  const token = new URL(permanentTicket.url).pathname.slice('/files/'.length);
  assert.match(token, /^[a-f0-9]{64}$/);
  const permanentRow = await client.mutation(internal.nativeFiles.resolveTicket, { token });
  assert.equal(permanentRow!.tokenHash, createHash('sha256').update(token).digest('hex'));
  assert(!JSON.stringify(permanentRow).includes(token));
  assert.equal(
    await client.mutation(internal.nativeFiles.resolveTicket, { token: 'invalid' }),
    null,
  );
  await client.run((ctx) => ctx.db.patch(permanentRow!._id, { expiresAt: Date.now() - 1 }));
  assert.equal(await client.mutation(internal.nativeFiles.resolveTicket, { token }), null);
  const ephemeralRow = await client.mutation(internal.nativeFiles.resolveTicket, {
    token: new URL(ephemeralTicket.url).pathname.slice('/files/'.length),
  });
  await client.mutation(internal.nativeFiles.expireTicket, { id: permanentRow!._id });
  await client.mutation(internal.nativeFiles.expireTicket, { id: ephemeralRow!._id });
  assert(await client.run(async (ctx) => (await ctx.storage.get(permanent)) !== null));
  assert.equal(await client.run(async (ctx) => (await ctx.storage.get(ephemeral)) !== null), false);
});

afterEach(() => vi.useRealTimers());
