import test from 'node:test';
import assert from 'node:assert/strict';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import { createConvexFiles } from '../src/convex-files.mjs';
import { createTestApp } from './helpers/database.mjs';
import { createConvexTestDatabase } from './helpers/convex-database.mjs';

const bytes = Buffer.from('%PDF-1.4 synthetic Convex file fixture');

test('Convex files keep storage URLs server side, enforce PDF limits and discard failed uploads', async () => {
  const calls = [],
    objects = new Map(),
    paths = new Map();
  let nextId = 0;
  const client = {
    async mutation(reference, args) {
      const name = getFunctionName(reference);
      calls.push({ name, args });
      assert.equal(args.secret, 'synthetic-bridge-secret');
      if (name === 'files:uploadUrl') return 'https://storage.invalid/upload';
      if (name === 'files:register') {
        if (paths.has(args.path)) return false;
        paths.set(args.path, args.storageId);
        return true;
      }
      if (name === 'files:discard') {
        if (![...paths.values()].includes(args.storageId)) objects.delete(args.storageId);
        return null;
      }
      assert.fail('Unexpected mutation: ' + name);
    },
    async query(reference, args) {
      assert.equal(getFunctionName(reference), 'files:downloadUrl');
      assert.equal(args.secret, 'synthetic-bridge-secret');
      return paths.has(args.path) ? 'https://storage.invalid/' + paths.get(args.path) : null;
    },
  };
  const files = createConvexFiles({
    secret: 'synthetic-bridge-secret',
    client,
    fetch: async (url, options) => {
      if (url.endsWith('/upload')) {
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['Content-Type'], 'application/pdf');
        const storageId = 'synthetic-storage-' + ++nextId;
        objects.set(storageId, Buffer.from(options.body));
        return Response.json({ storageId });
      }
      return new Response(objects.get(url.split('/').at(-1)));
    },
  });
  assert.equal(files.uploadMode, 'proxy');
  assert.equal(files.signed, undefined);
  assert.equal(files.uploadUrl, undefined);
  await files.write('uploads/synthetic.pdf', bytes);
  assert.deepEqual(await files.read('uploads/synthetic.pdf'), bytes);
  await assert.rejects(files.write('uploads/synthetic.pdf', bytes), { status: 409 });
  assert.equal(objects.size, 1);
  assert.deepEqual(await files.read('uploads/synthetic.pdf'), bytes);
  await assert.rejects(files.read('uploads/missing.pdf'), { status: 404 });
  const priorCalls = calls.length;
  await assert.rejects(files.write('../synthetic.pdf', bytes), { status: 400 });
  await assert.rejects(files.write('uploads/not-pdf.pdf', Buffer.from('invalid')), { status: 400 });
  await assert.rejects(files.write('uploads/too-large.pdf', Buffer.alloc(8_000_001)), {
    status: 400,
  });
  assert.equal(calls.length, priorCalls);
});

test('Convex file reads bound response bodies and hide storage errors', async () => {
  const client = {
    query: async () => 'https://storage.invalid/synthetic',
  };
  const oversized = createConvexFiles({
    secret: 'synthetic',
    client,
    fetch: async () => new Response(Buffer.alloc(8_000_001)),
  });
  await assert.rejects(oversized.read('uploads/synthetic.pdf'), { status: 400 });
  const offline = createConvexFiles({
    secret: 'synthetic',
    client,
    fetch: async () => {
      throw Error('private storage detail');
    },
  });
  await assert.rejects(offline.read('uploads/synthetic.pdf'), {
    status: 503,
    message: 'Armazenamento indisponível. Tente novamente.',
  });
});

test('Convex storage handlers authenticate every operation and protect registered files', async (t) => {
  const { client, secret } = await createConvexTestDatabase(t, { seed: false });
  const register = makeFunctionReference('files:register'),
    download = makeFunctionReference('files:downloadUrl'),
    discard = makeFunctionReference('files:discard'),
    upload = makeFunctionReference('files:uploadUrl');
  const storageId = await client.run((ctx) =>
    ctx.storage.store(new Blob([bytes], { type: 'application/pdf' })),
  );
  const args = { path: 'uploads/synthetic.pdf', storageId };
  await assert.rejects(client.mutation(upload, { secret: 'incorrect' }));
  await assert.rejects(client.mutation(register, { ...args, secret: 'incorrect' }));
  await assert.rejects(client.query(download, { path: args.path, secret: 'incorrect' }));
  await assert.rejects(client.mutation(discard, { storageId, secret: 'incorrect' }));
  assert.equal(await client.mutation(register, { ...args, secret }), true);
  assert.equal(typeof (await client.query(download, { path: args.path, secret })), 'string');
  await client.mutation(discard, { storageId, secret });
  assert(await client.run((ctx) => ctx.db.system.get('_storage', storageId)));
  await assert.rejects(client.mutation(register, { ...args, path: 'uploads/second.pdf', secret }));
  const duplicate = await client.run((ctx) =>
    ctx.storage.store(new Blob([bytes], { type: 'application/pdf' })),
  );
  assert.equal(await client.mutation(register, { ...args, storageId: duplicate, secret }), false);
  await client.mutation(discard, { storageId: duplicate, secret });
  assert.equal(await client.run((ctx) => ctx.db.system.get('_storage', duplicate)), null);
  const wrongType = await client.run((ctx) =>
    ctx.storage.store(new Blob([bytes], { type: 'text/plain' })),
  );
  await assert.rejects(
    client.mutation(register, {
      ...args,
      path: 'uploads/wrong-type.pdf',
      storageId: wrongType,
      secret,
    }),
  );
  const oversized = await client.run((ctx) =>
    ctx.storage.store(new Blob([Buffer.alloc(8_000_001)], { type: 'application/pdf' })),
  );
  await assert.rejects(
    client.mutation(register, {
      ...args,
      path: 'uploads/oversized.pdf',
      storageId: oversized,
      secret,
    }),
  );
});

test('authenticated proxy uploads bind tickets to owners and stream private PDFs without redirects', async (t) => {
  const objects = new Map();
  const files = {
    uploadMode: 'proxy',
    async write(path, content) {
      if (objects.has(path)) throw Object.assign(Error('Already uploaded'), { status: 409 });
      objects.set(path, content);
    },
    read: async (path) => objects.get(path),
  };
  const app = await createTestApp(t, { files, setupCode: 'synthetic' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  async function call(path, body, cookie = '') {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'X-Dentec-Request': '1',
        Cookie: cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }

  await call('/api/setup', {
    code: 'synthetic',
    name: 'Synthetic administrator',
    email: 'admin@ifpr.edu.br',
    password: 'synthetic-only-password',
  });
  const admin = (
    await call('/api/login', { email: 'admin@ifpr.edu.br', password: 'synthetic-only-password' })
  ).cookie;
  const campusId = (await call('/api/bootstrap', null, admin)).data.campuses[0].id;
  await call(
    '/api/users',
    { name: 'Campus', email: 'campus@ifpr.edu.br', password: 'synthetic-only-password', campusId },
    admin,
  );
  const campus = (
    await call('/api/login', { email: 'campus@ifpr.edu.br', password: 'synthetic-only-password' })
  ).cookie;
  assert.equal((await call('/api/file-mode', null, admin)).data.direct, true);
  const ticket = (
    await call(
      '/api/upload-ticket',
      { filename: 'synthetic.pdf', purpose: 'document', size: bytes.length },
      admin,
    )
  ).data;
  assert.equal(ticket.encoding, 'base64');
  assert.equal(ticket.url, '/api/uploads/' + ticket.id);
  const payload = { data: bytes.toString('base64') };
  assert.equal((await call(ticket.url, payload)).status, 401);
  assert.equal((await call(ticket.url, payload, campus)).status, 404);
  assert.equal(
    (await call(ticket.url, { data: Buffer.from('invalid').toString('base64') }, admin)).status,
    400,
  );
  assert.equal(objects.size, 0);
  assert.equal((await call(ticket.url, payload, admin)).status, 201);
  assert.equal((await call(ticket.url, payload, admin)).status, 409);
  const document = await call(
    '/api/documents',
    {
      filename: 'synthetic.pdf',
      year: 2028,
      type: 'norma',
      title: 'Synthetic document',
      source: 'Synthetic test only',
      uploadId: ticket.id,
    },
    admin,
  );
  assert.equal(document.status, 201);
  assert.equal((await call(ticket.url, payload, admin)).status, 404);
  const saved = (await app.store.read({ full: true })).documents[0];
  assert.equal(saved.data, undefined);
  assert(saved.objectKey);
  const documentUrl = base + '/api/documents/' + saved.id;
  assert.equal((await fetch(documentUrl)).status, 401);
  assert.equal((await fetch(documentUrl, { headers: { Cookie: campus } })).status, 404);
  const downloaded = await fetch(documentUrl, {
    headers: { Cookie: admin },
    redirect: 'manual',
  });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('location'), null);
  assert.equal(downloaded.headers.get('content-type'), 'application/pdf');
  assert.equal(downloaded.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  await call(
    '/api/documents/' + saved.id + '/status',
    { revision: 1, status: 'vigente', confirmed: true },
    admin,
  );
  assert.equal((await fetch(documentUrl, { headers: { Cookie: campus } })).status, 200);
  const maximumPdf = Buffer.alloc(8_000_000, 32);
  bytes.copy(maximumPdf);
  const inline = await call(
    '/api/documents',
    {
      filename: 'maximum.pdf',
      year: 2028,
      type: 'referencia',
      title: '8 MB compatibility fixture',
      source: 'Synthetic test only',
      data: maximumPdf.toString('base64'),
    },
    admin,
  );
  assert.equal(inline.status, 201);
  const savedInline = (await app.store.read({ full: true })).documents.find(
    (item) => item.id === inline.data.id,
  );
  assert.equal(savedInline.data, undefined);
  assert.deepEqual(objects.get(savedInline.objectKey), maximumPdf);
  assert.equal(
    (
      await call(
        '/api/upload-ticket',
        { filename: 'oversized.pdf', purpose: 'document', size: 8_000_001 },
        admin,
      )
    ).status,
    400,
  );
  const calendar = await call(
    '/api/calendars',
    {
      campusId,
      purpose: 'test',
      courses: 'Synthetic course',
      year: 2027,
      offer: 'integrado',
      regime: 'anual',
    },
    campus,
  );
  assert.equal(calendar.status, 201);
  const history = await call(
    '/api/calendars/' + calendar.data.id + '/history',
    {
      filename: 'historical.pdf',
      year: 2026,
      notes: 'Synthetic historical fixture',
      data: bytes.toString('base64'),
    },
    campus,
  );
  assert.equal(history.status, 201);
  const savedHistory = (await app.store.read({ full: true })).histories.find(
    (item) => item.id === history.data.id,
  );
  assert.equal(savedHistory.data, undefined);
  assert.deepEqual(objects.get(savedHistory.objectKey), bytes);
  const historyDownload = await fetch(base + '/api/history/' + history.data.id, {
    headers: { Cookie: campus },
    redirect: 'manual',
  });
  assert.equal(historyDownload.status, 200);
  assert.equal(historyDownload.headers.get('location'), null);
  assert.deepEqual(Buffer.from(await historyDownload.arrayBuffer()), bytes);
});
