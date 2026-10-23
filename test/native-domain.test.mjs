import test from 'node:test';
import assert from 'node:assert/strict';
import { convexTest } from 'convex-test';
import { tsImport } from 'tsx/esm/api';
import { makeFunctionReference } from 'convex/server';
import { openConvexStore } from '../src/convex-store.mjs';
import { reviewCriteria } from '../src/review.mjs';

const reference = (name) => makeFunctionReference('native:' + name);
const secret = 'native-domain-isolated-fixture-bridge-secret';
const userFixtures = [
  {
    id: 'admin',
    name: 'Admin',
    email: 'admin@ifpr.edu.br',
    role: 'ADMIN',
    campusId: null,
    active: true,
    salt: 'private-salt',
    hash: 'private-hash',
  },
  {
    id: 'campus-a',
    name: 'Campus A',
    email: 'a@ifpr.edu.br',
    role: 'CAMPUS',
    campusId: 'a',
    active: true,
  },
  {
    id: 'campus-b',
    name: 'Campus B',
    email: 'b@ifpr.edu.br',
    role: 'CAMPUS',
    campusId: 'b',
    active: true,
  },
];

async function fixture(t) {
  process.env.DENTEC_CONVEX_BRIDGE_SECRET = secret;
  const schema = await tsImport('../convex/schema.ts', import.meta.url);
  const client = convexTest(schema.default, {
    '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
    '../convex/store.ts': () => tsImport('../convex/store.ts', import.meta.url),
    '../convex/native.ts': () => tsImport('../convex/native.ts', import.meta.url),
    '../convex/nativeAuth.ts': () => tsImport('../convex/nativeAuth.ts', import.meta.url),
    '../convex/audit.ts': () => tsImport('../convex/audit.ts', import.meta.url),
  });
  const store = await openConvexStore('https://isolated.convex.cloud', {
    secret,
    client,
    seed: false,
  });
  t.after(() => store.close());
  await store.importState({
    users: structuredClone(userFixtures),
    campuses: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    catalogue: { revision: 1, events: [] },
    calendars: [],
    histories: [],
    reviews: [],
    documents: [],
    audit: [],
    uploads: [],
  });
  const accounts = {};
  for (const user of userFixtures) {
    const identity = await client.run(async (ctx) => {
      const row = await ctx.db
        .query('users')
        .withIndex('by_appId', (q) => q.eq('appId', user.id))
        .unique();
      const sessionId = await ctx.db.insert('authSessions', {
        userId: row._id,
        expirationTime: Date.now() + 3600000,
      });
      return { subject: `${row._id}|${sessionId}` };
    });
    accounts[user.id] = client.withIdentity(identity);
  }
  const as = (id) => ({
    read: (path) => accounts[id].query(reference('read'), { path }),
    write: (path, body = {}, method = 'POST') =>
      accounts[id].mutation(reference('write'), { path, method, body }),
    actionContext: (path, body = {}) =>
      accounts[id].query(reference('actionContext'), { path, body }),
    finishAction: (path, body, result) =>
      accounts[id].mutation(reference('finishAction'), { path, body, result }),
  });
  return { client, store, as };
}

const createBody = (campusId = 'a') => ({
  campusId,
  year: 2027,
  modalities: ['integrado'],
  regime: 'anual',
  courses: 'Técnico',
  purpose: 'test',
});
const changedState = (state, name = 'Atividade') => ({
  ...state,
  events: [
    { id: 'event', name, start: '2027-02-01', end: '2027-02-01', kind: 'note', evidence: 'Ata' },
  ],
});
const saveBody = (record, name) => ({
  version: record.version,
  catalogueRevision: record.currentCatalogueRevision ?? record.catalogueRevision,
  state: changedState(record.state, name),
});

// These tests call the deployed function handlers directly: there is no HTTP
// server, bridge-secret authorization, cookie session, or mocked business logic.
test('native queries require a live Convex session and return safe campus scoped bootstrap', async (t) => {
  const { client, as } = await fixture(t);
  await assert.rejects(
    client.query(reference('read'), { path: '/api/bootstrap' }),
    /Entre com sua conta/,
  );
  const status = await client.query(reference('read'), { path: '/api/status' });
  assert.equal(status.user, null);
  assert.equal(status.setupRequired, false);
  const a = await as('campus-a').write('/api/calendars', createBody('a'));
  await as('campus-b').write('/api/calendars', createBody('b'));
  const bootstrap = await as('campus-a').read('/api/bootstrap');
  assert.deepEqual(
    bootstrap.calendars.map((c) => c.id),
    [a.id],
  );
  assert.deepEqual(bootstrap.users, []);
  assert.deepEqual(
    bootstrap.campuses.map((c) => c.id),
    ['a'],
  );
  const admin = await as('admin').read('/api/bootstrap');
  assert.equal(admin.calendars.length, 2);
  assert.equal(admin.users.length, 3);
  assert(!JSON.stringify(admin).includes('private-'));
  await assert.rejects(as('campus-b').read('/api/calendars/' + a.id), /Registro não encontrado/);
  await assert.rejects(
    as('campus-b').write('/api/calendars', createBody('a')),
    /Registro não encontrado/,
  );
  await assert.rejects(
    as('campus-a').write('/api/campuses', { name: 'Forged', role: 'ADMIN' }),
    /Acesso exclusivo/,
  );
});

test('native mutations preserve immutable versions, reject stale writers and keep no-op saves stable', async (t) => {
  const { as, store } = await fixture(t);
  const campus = as('campus-a');
  const created = await campus.write('/api/calendars', createBody());
  const path = '/api/calendars/' + created.id;
  const one = await campus.read(path);
  const saved = await campus.write(path, saveBody(one), 'PUT');
  assert.equal(saved.version, 2);
  await assert.rejects(campus.write(path, saveBody(one, 'Stale'), 'PUT'), /Há versão mais recente/);
  const two = await campus.read(path);
  const stable = await campus.write(
    path,
    { version: two.version, catalogueRevision: two.currentCatalogueRevision, state: two.state },
    'PUT',
  );
  assert.equal(stable.unchanged, true);
  assert.equal(stable.version, 2);
  const writes = await Promise.allSettled([
    campus.write(path, saveBody(two, 'Sessão A'), 'PUT'),
    campus.write(path, saveBody(two, 'Sessão B'), 'PUT'),
  ]);
  assert.equal(writes.filter((r) => r.status === 'fulfilled').length, 1);
  const full = await store.exportState();
  const record = full.calendars.find((c) => c.id === created.id);
  assert.equal(record.version, 3);
  assert.equal(record.versions.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(record.versions[0].state)), created.state);
  assert.equal(record.versions[1].state.events[0].name, 'Atividade');
  const logs = await campus.read('/api/logs');
  assert.equal(logs.entries.length, 3);
  assert(logs.entries.every((entry) => entry.actor === 'Campus A'));
});

test('native publication gates base revisions and reviews retain concurrent review history', async (t) => {
  const { as, store } = await fixture(t);
  const admin = as('admin'),
    campus = as('campus-a');
  const created = await campus.write('/api/calendars', createBody());
  const path = '/api/calendars/' + created.id;
  const reviewPath = '/api/reviews/' + created.id;
  const support = await admin.read(reviewPath);
  const body = {
    revision: 0,
    calendarVersion: 1,
    catalogueRevision: 1,
    conclusion: support.initialConclusion,
    entries: reviewCriteria.map((c) => ({
      id: c.id,
      status: 'PENDENTE',
      notes: '',
      reviewed: false,
    })),
  };
  assert.equal((await admin.write(reviewPath, body, 'PUT')).revision, 1);
  await assert.rejects(admin.write(reviewPath, body, 'PUT'), /Outro revisor/);
  await campus.write(path, saveBody(await campus.read(path)), 'PUT');
  assert.equal((await admin.read(reviewPath)).stale, true);
  const second = { ...body, revision: 1, calendarVersion: 2 };
  await assert.rejects(admin.write(reviewPath, second, 'PUT'), /Confirme a reavaliação/);
  assert.equal(
    (await admin.write(reviewPath, { ...second, acknowledgeStale: true }, 'PUT')).revision,
    2,
  );
  await assert.rejects(campus.read(reviewPath), /Acesso exclusivo/);
  await admin.write('/api/catalogue', {
    revision: 1,
    name: 'Feriado',
    start: '2027-04-21',
    end: '2027-04-21',
    kind: 'exclude',
    category: 'feriado',
    evidence: 'Lei',
    offers: ['integrado'],
  });
  await assert.rejects(
    campus.write(path, { ...saveBody(await campus.read(path)), catalogueRevision: 1 }, 'PUT'),
    /base institucional mudou/,
  );
  const full = await store.exportState();
  assert.equal(full.reviews[0].history.length, 1);
  assert.equal(full.reviews[0].history[0].revision, 1);
});

test('native calendar trash is scoped and restores without destroying archive metadata', async (t) => {
  const { as, store } = await fixture(t);
  const campus = as('campus-a');
  const created = await campus.write('/api/calendars', createBody());
  const path = '/api/calendars/' + created.id;
  await campus.write(path, saveBody(await campus.read(path)), 'PUT');
  await assert.rejects(campus.write(path, { version: 1 }, 'DELETE'), /calendário foi alterado/);
  await campus.write(path, { version: 2 }, 'DELETE');
  await assert.rejects(campus.read(path), /Registro não encontrado/);
  assert.equal((await campus.read('/api/bootstrap')).calendars.length, 0);
  assert.equal((await campus.read('/api/calendar-trash')).calendars.length, 1);
  assert.equal((await as('campus-b').read('/api/calendar-trash')).calendars.length, 0);
  await assert.rejects(as('campus-b').write(path + '/restore'), /Registro não encontrado/);
  await campus.write(path + '/restore');
  const restored = await campus.read(path);
  assert.equal(restored.version, 2);
  assert.equal(restored.versions.length, 1);
  const ready = await campus.write(path + '/make-definitive', { version: 2 });
  assert.equal(ready.purpose, 'definitive');
  const full = await store.exportState();
  assert.equal(full.calendars[0].versions.length, 2);
  assert.equal(full.calendars[0].versions[1].purpose, 'test');
});

test('native action boundaries recheck ownership and register only validated storage files', async (t) => {
  const { as, client } = await fixture(t);
  const admin = as('admin'),
    campus = as('campus-a');
  const created = await campus.write('/api/calendars', createBody());
  const path = '/api/calendars/' + created.id;
  await assert.rejects(
    as('campus-b').actionContext(path + '/pdf', { version: 1, catalogueRevision: 1 }),
    /Registro não encontrado/,
  );
  const context = await campus.actionContext(path + '/pdf', { version: 1, catalogueRevision: 1 });
  assert.equal(context.record.id, created.id);
  assert(!JSON.stringify(context).includes('private-'));
  const result = {
    objectKey: 'uploads/fixture.pdf',
    size: 12,
    hash: 'a'.repeat(64),
    uploadId: 'history-upload',
  };
  await assert.rejects(
    campus.finishAction(path + '/history', { year: 2026, filename: 'anterior.pdf' }, result),
    /Arquivo não encontrado/,
  );
  await client.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(['%PDF-fixture'], { type: 'application/pdf' }),
    );
    await ctx.db.insert('fileObjects', { path: result.objectKey, storageId });
    const owner = await ctx.db
      .query('users')
      .withIndex('by_appId', (q) => q.eq('appId', 'campus-a'))
      .unique();
    await ctx.db.insert('nativeUploads', {
      uploadId: result.uploadId,
      ownerId: owner._id,
      filename: 'anterior.pdf',
      size: result.size,
      expiresAt: Date.now() + 10000,
      storageId,
      objectKey: result.objectKey,
      hash: result.hash,
      completedAt: Date.now(),
    });
  });
  const history = await campus.finishAction(
    path + '/history',
    { year: 2026, filename: 'anterior.pdf' },
    result,
  );
  await assert.rejects(
    campus.finishAction(path + '/history', { year: 2026, filename: 'anterior.pdf' }, result),
    /Envio expirado, já utilizado ou incompatível/,
  );
  await assert.rejects(
    as('campus-b').actionContext('/api/history/' + history.id),
    /Registro não encontrado/,
  );
  const analyzed = { version: 2, pages: [{ page: 1 }], candidates: [] };
  await campus.finishAction(
    '/api/history/' + history.id + '/analysis',
    { hash: result.hash },
    analyzed,
  );
  assert.equal((await campus.read(path)).histories[0].analyzed, true);
  await assert.rejects(
    campus.finishAction(
      '/api/documents',
      { year: 2027, type: 'norma', title: 'Norma', source: 'Fonte', filename: 'norma.pdf' },
      result,
    ),
    /Acesso exclusivo/,
  );
  const documentResult = { ...result, uploadId: 'admin-upload' };
  await client.run(async (ctx) => {
    const file = await ctx.db
      .query('fileObjects')
      .withIndex('by_path', (q) => q.eq('path', result.objectKey))
      .unique();
    const owner = await ctx.db
      .query('users')
      .withIndex('by_appId', (q) => q.eq('appId', 'admin'))
      .unique();
    await ctx.db.insert('nativeUploads', {
      uploadId: documentResult.uploadId,
      ownerId: owner._id,
      filename: 'norma.pdf',
      size: result.size,
      expiresAt: Date.now() + 10000,
      storageId: file.storageId,
      objectKey: result.objectKey,
      hash: result.hash,
      completedAt: Date.now(),
    });
  });
  const doc = await admin.finishAction(
    '/api/documents',
    { year: 2027, type: 'norma', title: 'Norma', source: 'Fonte', filename: 'norma.pdf' },
    documentResult,
  );
  assert.equal((await campus.read('/api/documents')).documents.length, 0);
  await admin.write('/api/documents/' + doc.id + '/status', {
    status: 'vigente',
    confirmed: true,
    revision: 1,
  });
  assert.equal((await campus.read('/api/documents')).documents.length, 1);
  await assert.rejects(
    campus.actionContext(path + '/pdf', { version: 1, catalogueRevision: 2 }),
    /Salve a versão atual/,
  );
});
