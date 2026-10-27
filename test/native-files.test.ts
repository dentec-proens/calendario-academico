import { convexModules } from './helpers/convex-modules.ts';
import type { Id } from '../convex/_generated/dataModel';
import { test, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { convexTest } from 'convex-test';
import { api, internal } from '../convex/_generated/api.js';

async function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  process.env.CONVEX_SITE_URL = 'https://isolated.convex.site';
  const { default: schema } = await import('../convex/schema.ts');
  const client = convexTest(schema, convexModules);
  const identities = await client.run(async (ctx) => {
    const result = [];
    for (const id of ['a', 'b', 'admin']) {
      const campusId = await ctx.db.insert('campuses', { name: id, archived: false });
      const userId: Id<'users'> = await ctx.db.insert('users', {
        name: id,
        email: `${id}@ifpr.edu.br`,
        role: id === 'admin' ? 'ADMIN' : 'CAMPUS',
        ...(id === 'admin' ? {} : { campusId }),
        active: true,
        loginMethod: 'local',
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
    users[who].action(api.actions.uploads.completeUpload, { uploadId, storageId });
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
  assert.equal('objectKey' in metadata, false);
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
  assert.equal((await client.run((ctx) => ctx.db.query('nativeUploads').take(10))).length, 0);
});

test('completed storage IDs stay reserved after their consumed upload ticket is cleaned up', async () => {
  const { client, issue, put, complete } = await fixture();
  const upload = await issue();
  const storageId = await put();
  await complete(upload.uploadId, storageId);
  await client.run(async (ctx) => {
    const ticket = await ctx.db
      .query('nativeUploads')
      .withIndex('by_uploadId', (q) => q.eq('uploadId', upload.uploadId))
      .unique();
    await ctx.db.insert('documents', {
      year: 2027,
      type: 'norma',
      title: 'Norma de teste',
      source: 'Teste',
      filename: 'calendar.pdf',
      storageId,
      hash: createHash('sha256').update('%PDF-fixture').digest('hex'),
      size: 12,
      status: 'rascunho',
      version: 1,
      createdAt: Date.now(),
    });
    await ctx.db.patch(ticket!._id, { consumedAt: Date.now() });
  });
  await client.mutation(internal.nativeFiles.expireUpload, { uploadId: upload.uploadId });
  const other = await issue();
  await assert.rejects(complete(other.uploadId, storageId), /Arquivo já cadastrado/);
  assert(await client.run(async (ctx) => (await ctx.storage.get(storageId)) !== null));
});

test('missing institutional originals report unavailable without creating file tickets', async () => {
  const { client, users } = await fixture();
  const id = await client.run((ctx) =>
    ctx.db.insert('documents', {
      year: 2027,
      type: 'norma',
      title: 'Norma preservada',
      source: 'Referência',
      filename: 'norma.pdf',
      hash: 'a'.repeat(64),
      status: 'vigente',
      version: 1,
      createdAt: 1,
      publishedAt: 1,
      unavailableFile: { sourceReference: 'legacy/norma.pdf', reason: 'not_migrated' },
    }),
  );
  const before = await client.run((ctx) => ctx.db.get(id));
  await assert.rejects(
    users[0].action(api.actions.documents.downloadDocument, { id }),
    /aguarda a transferência/,
  );
  assert.deepEqual(await client.run((ctx) => ctx.db.get(id)), before);
  assert.equal(await client.run((ctx) => ctx.db.query('nativeFileTickets').first()), null);
});

test('admin restores institutional originals atomically and retains identity and metadata', async () => {
  const { client, users, issue, put, complete } = await fixture();
  const id = await client.run((ctx) =>
    ctx.db.insert('documents', {
      year: 2027,
      type: 'norma',
      title: 'Documento preservado',
      source: 'Origem preservada',
      filename: 'original.pdf',
      hash: createHash('sha256').update('%PDF-fixture').digest('hex'),
      unavailableFile: { sourceReference: 'legacy/original.pdf', reason: 'not_migrated' },
      status: 'rascunho',
      version: 1,
      createdAt: 1,
    }),
  );
  const before = await client.run((ctx) => ctx.db.get(id));
  const foreign = await issue(0);
  await complete(foreign.uploadId, await put());
  await assert.rejects(
    users[0].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: foreign.uploadId,
    }),
    /exclusivo da administra/,
  );
  await assert.rejects(
    users[2].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: foreign.uploadId,
    }),
    /Envio expirado/,
  );
  const wrong = await issue(2);
  await complete(wrong.uploadId, await put('%PDF-wrongxx'), 2);
  await assert.rejects(
    users[2].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: wrong.uploadId,
    }),
    /SHA-256/,
  );
  const duplicate = await issue(2),
    duplicateStorage = await put();
  await complete(duplicate.uploadId, duplicateStorage, 2);
  const {
    _id: _oldId,
    _creationTime: _created,
    unavailableFile: _missing,
    ...duplicateMetadata
  } = before!;
  await client.run((ctx) =>
    ctx.db.insert('documents', { ...duplicateMetadata, storageId: duplicateStorage }),
  );
  await assert.rejects(
    users[2].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: duplicate.uploadId,
    }),
    /Arquivo já cadastrado/,
  );
  for (const uploadId of [foreign.uploadId, wrong.uploadId, duplicate.uploadId]) {
    const upload = await client.run((ctx) =>
      ctx.db
        .query('nativeUploads')
        .withIndex('by_uploadId', (q) => q.eq('uploadId', uploadId))
        .unique(),
    );
    assert.equal(upload!.consumedAt, undefined);
  }
  assert.deepEqual(await client.run((ctx) => ctx.db.get(id)), before);
  const valid = await issue(2, 12, 'different-name.pdf'),
    storageId = await put();
  await complete(valid.uploadId, storageId, 2);
  assert.deepEqual(
    await users[2].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: valid.uploadId,
    }),
    { id, restored: true },
  );
  const { unavailableFile: _source, ...metadata } = before!;
  assert.deepEqual(await client.run((ctx) => ctx.db.get(id)), { ...metadata, storageId });
  await assert.rejects(
    users[2].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: valid.uploadId,
    }),
    /já está disponível/,
  );
  assert.deepEqual(
    (await client.run((ctx) => ctx.db.query('audit').take(10))).map((row) => row.action),
    ['RESTORE_DOCUMENT_ORIGINAL'],
  );
});

test('bounded expiration sweeps remove orphaned temporary files and preserve consumed and permanent storage', async () => {
  const { client, put } = await fixture();
  const abandoned = await put(),
    consumed = await put(),
    ephemeral = await put(),
    permanent = await put(),
    future = await put();
  await client.run(async (ctx) => {
    const owner = await ctx.db.query('users').first();
    for (const [uploadId, storageId, consumedAt] of [
      ['abandoned', abandoned, undefined],
      ['consumed', consumed, 1],
    ] as const)
      await ctx.db.insert('nativeUploads', {
        uploadId,
        storageId,
        ownerId: owner!._id,
        filename: 'original.pdf',
        size: 12,
        expiresAt: Date.now() - 1,
        consumedAt,
      });
    await ctx.db.insert('nativeUploads', {
      uploadId: 'future',
      storageId: future,
      ownerId: owner!._id,
      filename: 'future.pdf',
      size: 12,
      expiresAt: Date.now() + 60000,
    });
    for (let index = 0; index < 101; index++)
      await ctx.db.insert('nativeFileTickets', {
        tokenHash: 'expired-' + index,
        storageId: index === 0 ? ephemeral : permanent,
        filename: 'original.pdf',
        expiresAt: Date.now() - 1,
        ephemeral: index === 0,
      });
  });
  const result = await client.mutation(internal.nativeFiles.cleanupExpired, {});
  assert.deepEqual(result, { uploads: 2, tickets: 100, continued: true });
  await client.finishAllScheduledFunctions(vi.runAllTimers);
  assert.equal((await client.run((ctx) => ctx.db.query('nativeFileTickets').take(2))).length, 0);
  assert.equal((await client.run((ctx) => ctx.db.query('nativeUploads').take(2))).length, 1);
  for (const storageId of [abandoned, ephemeral])
    assert.equal(await client.run((ctx) => ctx.storage.get(storageId)), null);
  for (const storageId of [consumed, permanent, future])
    assert(await client.run(async (ctx) => (await ctx.storage.get(storageId)) !== null));
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
