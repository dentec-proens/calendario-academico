import { convexModules } from '../helpers/convex-modules.ts';
import type { Id } from '../../convex/_generated/dataModel';
import { test, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { convexTest } from 'convex-test';
import { api, internal } from '../../convex/_generated/api.js';

async function fixture() {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  process.env.CONVEX_SITE_URL = 'https://isolated.convex.site';
  const { default: schema } = await import('../../convex/schema.ts');
  const client = convexTest(schema, convexModules);
  const identities = await client.run(async (ctx) => {
    const result = [];
    for (const id of ['a', 'b', 'admin', 'admin2']) {
      const campusId = await ctx.db.insert('campuses', { name: id, archived: false });
      const userId: Id<'users'> = await ctx.db.insert('users', {
        name: id,
        email: `${id}@ifpr.edu.br`,
        role: id.startsWith('admin') ? 'ADMIN' : 'CAMPUS',
        ...(id.startsWith('admin') ? {} : { campusId }),
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
  const issue = (who = 2, size = 12, filename = 'calendar.pdf') =>
    users[who].mutation(api.nativeFiles.issueUpload, { filename, size });
  const receive = (
    uploadId: string,
    bytes = new TextEncoder().encode('%PDF-fixture').buffer,
    who = 2,
  ) => users[who].mutation(api.nativeFiles.receiveUpload, { uploadId, bytes });
  const metadata = (uploadId: string, who = 2) =>
    users[who].query(internal.nativeFiles.uploadContext, { uploadId });
  const send = async (contents = '%PDF-fixture', who = 2, filename = 'calendar.pdf') => {
    const bytes = new TextEncoder().encode(contents).buffer;
    const { uploadId } = await issue(who, bytes.byteLength, filename);
    await receive(uploadId, bytes, who);
    return metadata(uploadId, who);
  };
  return { client, users, put, issue, receive, metadata, send };
}

test('upload admission requires ADMIN, validates filename/size and bounds pending tickets', async () => {
  const { client, users, issue } = await fixture();
  await assert.rejects(
    client.mutation(api.nativeFiles.issueUpload, { filename: 'x.pdf', size: 12 }),
    /Entre com sua conta/,
  );
  await assert.rejects(
    users[0].mutation(api.nativeFiles.issueUpload, { filename: 'x.pdf', size: 12 }),
    /administra/,
  );
  for (const [filename, size] of [
    ['x.txt', 12],
    ['x.pdf', 4],
    ['x.pdf', 8_000_001],
    ['x.pdf', 12.5],
    ['x'.repeat(181) + '.pdf', 12],
  ] as [string, number][]) {
    await assert.rejects(issue(2, size, filename), /PDF de até 8 MB/);
  }
  const one = await issue();
  assert.match(one.uploadId, /^[a-f0-9]{64}$/);
  assert.equal('uploadUrl' in one, false, 'no direct Storage URL escapes the validated ingress');
  await issue();
  await issue();
  await assert.rejects(issue(), /Conclua os envios pendentes/);
});

test('validated ingress rejects bytes before storage and binds only a newly created server object', async () => {
  const { client, issue, receive, metadata, users, put } = await fixture();
  const upload = await issue();
  const before = await client.run((ctx) => ctx.db.system.query('_storage').collect());
  await assert.rejects(
    receive(upload.uploadId, new TextEncoder().encode('not a pdf!!!').buffer),
    /PDF de até 8 MB/,
  );
  await assert.rejects(
    receive(upload.uploadId, new TextEncoder().encode('%PDF-longer-fixture').buffer),
    /tamanho do PDF/,
  );
  await assert.rejects(
    receive(upload.uploadId, new Uint8Array(8_000_001).buffer),
    /PDF de até 8 MB/,
  );
  assert.deepEqual(await client.run((ctx) => ctx.db.system.query('_storage').collect()), before);
  await assert.rejects(receive(upload.uploadId, undefined, 3), /Envio expirado/);
  await receive(upload.uploadId);
  const stored = await metadata(upload.uploadId);
  assert.equal(stored.hash, createHash('sha256').update('%PDF-fixture').digest('hex'));
  assert.equal(stored.verifiedIngress, true);
  assert.ok(stored.storageId);
  await receive(upload.uploadId);
  assert.equal(
    (await client.run((ctx) => ctx.db.system.query('_storage').collect())).length,
    1,
    'retry cannot store another object',
  );
  await assert.rejects(
    receive(upload.uploadId, new TextEncoder().encode('%PDF-changed').buffer),
    /Envio já concluído/,
  );
  const unrelated = await put();
  const other = await issue();
  await assert.rejects(
    users[2].action(api.actions.uploads.completeUpload, {
      uploadId: other.uploadId,
      storageId: unrelated,
    }),
    /Atualize/,
  );
  await assert.rejects(
    users[2].mutation(internal.nativeFiles.finishUpload, {
      uploadId: other.uploadId,
      storageId: unrelated,
      hash: 'a'.repeat(64),
      size: 12,
    }),
    /Atualize/,
  );
  await client.mutation(internal.nativeFiles.expireUpload, { uploadId: other.uploadId });
  assert.ok(await client.run(async (ctx) => (await ctx.storage.get(unrelated)) !== null));
});

test('expired and consumed uploads cannot be reused and cleanup preserves attached files', async () => {
  const { client, send, receive } = await fixture();
  const expired = await send();
  const consumed = await send();
  await client.run(async (ctx) => {
    await ctx.db.patch(expired._id, { expiresAt: Date.now() - 1 });
    await ctx.db.patch(consumed._id, { consumedAt: Date.now() });
  });
  for (const row of [expired, consumed])
    await assert.rejects(receive(row.uploadId), /Envio expirado/);
  await client.mutation(internal.nativeFiles.expireUpload, { uploadId: expired.uploadId });
  await client.mutation(internal.nativeFiles.expireUpload, { uploadId: consumed.uploadId });
  assert.equal(
    await client.run(async (ctx) => (await ctx.storage.get(expired.storageId!)) !== null),
    false,
  );
  assert.equal(
    await client.run(async (ctx) => (await ctx.storage.get(consumed.storageId!)) !== null),
    true,
  );
});

test('cleanup never deletes a legacy object whose upload ownership cannot be proven', async () => {
  const { client, users, put } = await fixture();
  const storageId = await put();
  await client.run(async (ctx) => {
    const owner = await ctx.db.query('users').first();
    await ctx.db.insert('nativeUploads', {
      uploadId: 'legacy',
      ownerId: owner!._id,
      filename: 'legacy.pdf',
      size: 12,
      storageId,
      expiresAt: Date.now() - 1,
    });
  });
  await client.mutation(internal.nativeFiles.expireUpload, { uploadId: 'legacy' });
  assert.ok(await client.run(async (ctx) => (await ctx.storage.get(storageId)) !== null));
  await assert.rejects(
    users[2].mutation(api.nativeFiles.receiveUpload, {
      uploadId: 'legacy',
      bytes: new TextEncoder().encode('%PDF-fixture').buffer,
    }),
    /Envio expirado/,
  );
});

test('missing originals remain unavailable and restoring requires owner, exact SHA-256 and single consumption', async () => {
  const { client, users, send } = await fixture();
  const id = await client.run((ctx) =>
    ctx.db.insert('documents', {
      year: 2027,
      type: 'norma',
      title: 'Preservado',
      source: 'Referência',
      filename: 'original.pdf',
      hash: createHash('sha256').update('%PDF-fixture').digest('hex'),
      status: 'vigente',
      version: 1,
      createdAt: 1,
      publishedAt: 1,
      unavailableFile: { sourceReference: 'legacy/original.pdf', reason: 'not_migrated' },
    }),
  );
  const before = await client.run((ctx) => ctx.db.get(id));
  await assert.rejects(
    users[0].mutation(api.documents.openDocument, { id }),
    /aguarda restauração/,
  );
  const foreign = await send('%PDF-fixture', 3);
  await assert.rejects(
    users[2].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: foreign.uploadId,
    }),
    /Envio expirado/,
  );
  const wrong = await send('%PDF-wrongxx');
  await assert.rejects(
    users[2].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: wrong.uploadId,
    }),
    /SHA-256/,
  );
  assert.deepEqual(await client.run((ctx) => ctx.db.get(id)), before);
  const valid = await send('%PDF-fixture', 2, 'different-name.pdf');
  assert.deepEqual(
    await users[2].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: valid.uploadId,
    }),
    { id, restored: true },
  );
  const { unavailableFile: _missing, ...unchanged } = before!;
  assert.deepEqual(await client.run((ctx) => ctx.db.get(id)), {
    ...unchanged,
    storageId: valid.storageId,
  });
  await assert.rejects(
    users[2].action(api.actions.documents.restoreDocumentOriginal, {
      id,
      uploadId: valid.uploadId,
    }),
    /já está disponível/,
  );
  assert.deepEqual(
    (await client.run((ctx) => ctx.db.query('audit').collect())).map((row) => row.action),
    ['RESTORE_DOCUMENT_ORIGINAL'],
  );
});

test('opening documents authorizes publication and serves the original inline through an expiring link', async () => {
  const { client, users, put } = await fixture();
  const bytes = '%PDF-original';
  const storageId = await put(bytes);
  const id = await client.run((ctx) =>
    ctx.db.insert('documents', {
      year: 2027,
      type: 'norma',
      title: 'Documento',
      source: 'Referência',
      filename: 'resolução.pdf',
      hash: createHash('sha256').update(bytes).digest('hex'),
      storageId,
      status: 'rascunho',
      version: 1,
      createdAt: 1,
    }),
  );
  await assert.rejects(client.mutation(api.documents.openDocument, { id }), /Entre com sua conta/);
  await assert.rejects(
    users[0].mutation(api.documents.openDocument, { id }),
    /Documento não encontrado/,
  );
  const draft = await users[2].mutation(api.documents.openDocument, { id });
  assert.equal((await client.fetch(new URL(draft.url).pathname)).status, 200);
  await client.run((ctx) => ctx.db.patch(id, { status: 'vigente', publishedAt: 1 }));
  const { url } = await users[0].mutation(api.documents.openDocument, { id });
  const response = await client.fetch(new URL(url).pathname);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  assert.equal(
    response.headers.get('Content-Disposition'),
    "inline; filename*=UTF-8''resolu%C3%A7%C3%A3o.pdf",
  );
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(await response.text(), bytes);
  await client.run((ctx) => ctx.db.patch(id, { status: 'arquivado' }));
  assert.ok((await users[0].mutation(api.documents.openDocument, { id })).url);
  const token = new URL(url).pathname.slice('/files/'.length);
  const ticket = await client.mutation(internal.nativeFiles.resolveTicket, { token });
  await client.run((ctx) => ctx.db.patch(ticket!._id, { expiresAt: Date.now() - 1 }));
  assert.equal((await client.fetch(new URL(url).pathname)).status, 404);
  assert.equal((await client.fetch('/files/invalid')).status, 404);
  await client.run((ctx) => ctx.storage.delete(storageId));
  await assert.rejects(
    users[0].mutation(api.documents.openDocument, { id }),
    /aguarda restauração/,
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
        verifiedIngress: true,
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
