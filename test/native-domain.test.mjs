import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFunctionReference } from 'convex/server';
import { reviewCriteria } from '../src/review.mjs';
import { initialCatalogue } from '../src/institution.mjs';
import { teacherDayId } from '../src/teacher-day.mjs';
import { encodeValue } from '../src/convex-codec.mjs';
import { createNativeFixture as fixture } from './helpers/native-database.ts';

const reference = (name) => makeFunctionReference('native:' + name);
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

// These tests execute the real native handlers with isolated Convex transactions.
test('native queries require a live Convex session and return safe campus scoped bootstrap', async () => {
  const { client, as } = await fixture();
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

test('native mutations preserve immutable versions, reject stale writers and keep no-op saves stable', async () => {
  const { as, inspect } = await fixture();
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
  const full = await inspect();
  const record = full.calendars.find((c) => c.id === created.id);
  assert.equal(record.version, 3);
  assert.equal(record.versions.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(record.versions[0].state)), created.state);
  assert.equal(record.versions[1].state.events[0].name, 'Atividade');
  const logs = await campus.read('/api/logs');
  assert.equal(logs.entries.length, 3);
  assert(logs.entries.every((entry) => entry.actor === 'Campus A'));
});

test('native publication gates base revisions and reviews retain concurrent review history', async () => {
  const { as, inspect } = await fixture();
  const admin = as('admin'),
    campus = as('campus-a');
  const created = await campus.write('/api/calendars', createBody());
  const path = '/api/calendars/' + created.id;
  const reviewPath = '/api/reviews/' + created.id;
  const support = await admin.read(reviewPath);
  await assert.rejects(
    admin.write(reviewPath + '/export', { revision: 0 }),
    /Salve a análise inicial/,
  );
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
  const exported = await admin.write(reviewPath + '/export', { revision: 1 });
  assert.match(exported.html, /minuta/i);
  assert.match(exported.text, /Não constitui aprovação oficial/i);
  await assert.rejects(admin.write(reviewPath, body, 'PUT'), /Outro revisor/);
  await campus.write(path, saveBody(await campus.read(path)), 'PUT');
  assert.equal((await admin.read(reviewPath)).stale, true);
  await assert.rejects(
    admin.write(reviewPath + '/export', { revision: 1 }),
    /análise está desatualizada/,
  );
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
  const full = await inspect();
  assert.equal(full.reviews[0].history.length, 1);
  assert.equal(full.reviews[0].history[0].revision, 1);
});

test('native calendar trash is scoped and restores without destroying archive metadata', async () => {
  const { as, inspect } = await fixture();
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
  const full = await inspect();
  assert.equal(full.calendars[0].versions.length, 2);
  assert.equal(full.calendars[0].versions[1].purpose, 'test');
});

test('native action boundaries recheck ownership and register only validated storage files', async () => {
  const { as, client } = await fixture();
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

test('native calendar saves validate per-offer stages and preserve the selected second-semester intake', async () => {
  const { as } = await fixture();
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', {
    ...createBody(),
    modalities: ['integrado', 'graduacao'],
    regime: 'semestral',
  });
  const path = '/api/calendars/' + record.id;
  const state = {
    ...record.state,
    assessmentStagesByModality: { integrado: 4, graduacao: 2 },
    secondSemesterIntake: false,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata sintética',
    periods: [
      { id: 'p', name: 'Primeiro semestre', start: '2027-03-01', end: '2027-03-12' },
      { id: 'q', name: 'Segundo semestre', start: '2027-04-01', end: '2027-04-14' },
    ],
    events: [
      {
        id: 'stage',
        name: 'Graduação',
        requirementId: 'stage-1:graduacao',
        modalities: ['graduacao'],
        start: '2027-03-01',
        end: '2027-03-12',
        kind: 'note',
        category: 'limite',
        evidence: 'Ata sintética',
      },
    ],
  };
  await campus.write(path, { ...saveBody(record), state }, 'PUT');
  const loaded = await campus.read(path);
  assert.deepEqual(loaded.state.assessmentStagesByModality, state.assessmentStagesByModality);
  assert.equal(loaded.state.events[0].requirementId, 'stage-1:graduacao');
  assert.equal(loaded.state.secondSemesterIntake, false);
  for (const invalid of [
    { ...state, secondSemesterIntake: 'false' },
    { ...state, events: [{ ...state.events[0], modalities: ['integrado'] }] },
    { ...state, year: 2028 },
    { ...state, offer: 'posgraduacao', modalities: ['posgraduacao'] },
  ]) {
    await assert.rejects(campus.write(path, { ...saveBody(loaded), state: invalid }, 'PUT'));
  }
  assert.equal((await campus.read(path)).version, loaded.version);
});

test('native calendar retains the campus teacher-day choice in immutable PDF inputs and protects institutional events', async () => {
  const { as, inspect } = await fixture({ catalogue: initialCatalogue() });
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', createBody());
  const path = '/api/calendars/' + record.id;
  await campus.write(
    path,
    { ...saveBody(record), state: { ...record.state, teacherDayDate: '2027-10-13' } },
    'PUT',
  );
  let loaded = await campus.read(path);
  assert.equal(loaded.state.teacherDayDate, '2027-10-13');
  assert.equal(loaded.institutionalSnapshot.find((e) => e.id === teacherDayId).start, '2027-10-13');
  const pdf = await campus.actionContext(path + '/pdf', {
    version: loaded.version,
    catalogueRevision: loaded.currentCatalogueRevision,
  });
  assert.equal(
    pdf.record.institutionalSnapshot.find((e) => e.id === teacherDayId).start,
    '2027-10-13',
  );
  for (const teacherDayDate of ['2028-10-13', '2027-10-10', '2027-10-18']) {
    await assert.rejects(
      campus.write(
        path,
        { ...saveBody(loaded), state: { ...loaded.state, teacherDayDate } },
        'PUT',
      ),
    );
  }
  await assert.rejects(
    campus.write(
      path,
      {
        ...saveBody(loaded),
        state: {
          ...loaded.state,
          events: [
            {
              id: 'inst:national-0',
              name: 'Tamper',
              start: '2027-01-02',
              end: '2027-01-02',
              kind: 'exclude',
              evidence: 'Fixture',
            },
          ],
        },
      },
      'PUT',
    ),
  );
  await campus.write(
    path,
    {
      ...saveBody(loaded),
      state: { ...loaded.state, teacherDayDate: null },
    },
    'PUT',
  );
  loaded = await campus.read(path);
  assert.equal(loaded.institutionalEvents.find((e) => e.id === teacherDayId).start, '2027-10-15');
  const full = await inspect();
  assert.equal(
    full.catalogue.events.find((e) => 'inst:' + e.id === teacherDayId).start,
    '2027-10-15',
  );
  assert.equal(full.calendars[0].versions[1].state.teacherDayDate, '2027-10-13');
});

test('native calendar edits and trash preserve all thirteen deferred PDF references without creating file objects', async () => {
  const { as, asClient, client, inspect } = await fixture();
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', createBody());
  const path = '/api/calendars/' + record.id;
  const histories = Array.from({ length: 13 }, (_, index) => ({
    id: 'deferred-' + index,
    calendarId: record.id,
    campusId: 'a',
    year: 2026,
    filename: 'original-' + index + '.pdf',
    objectKey: 'uploads/original-' + index + '.pdf',
    hash: String(index).padStart(64, '0'),
  }));
  await client.run(async (ctx) => {
    for (const [position, history] of histories.entries()) {
      await ctx.db.insert('histories', {
        key: 'histories:' + history.id,
        appId: history.id,
        calendarId: record.id,
        campusId: 'a',
        position,
        value: encodeValue(history),
      });
    }
    const root = await ctx.db
      .query('rootFields')
      .withIndex('by_name', (q) => q.eq('name', 'histories'))
      .unique();
    await ctx.db.patch(root._id, { count: 13 });
  });
  histories[0].analysis = {
    version: 2,
    pages: [{ page: 1, text: 'Análise preservada' }],
    candidates: [],
  };
  await client.run(async (ctx) => {
    const row = await ctx.db
      .query('histories')
      .withIndex('by_appId', (q) => q.eq('appId', 'deferred-0'))
      .unique();
    await ctx.db.patch(row._id, { value: encodeValue(histories[0]) });
  });
  const cached = await asClient('campus-a').action(makeFunctionReference('nativeActions:run'), {
    path: '/api/history/deferred-0/analysis',
    body: {},
  });
  assert.deepEqual(cached, histories[0].analysis);
  await assert.rejects(
    asClient('campus-a').action(makeFunctionReference('nativeActions:download'), {
      path: '/api/history/deferred-1',
    }),
    /aguarda/,
  );
  await assert.rejects(
    asClient('campus-a').action(makeFunctionReference('nativeActions:run'), {
      path: '/api/history/deferred-1/analysis',
      body: {},
    }),
    (error) => error.data?.status === 503 && /aguarda/.test(error.data.error),
  );
  const loaded = await campus.read(path);
  assert.equal(loaded.histories.length, 13);
  assert.equal(loaded.histories[0].analyzed, true);
  assert(
    loaded.histories.every((history) => !('objectKey' in history) && !('analysis' in history)),
  );
  await campus.write(path, saveBody(loaded), 'PUT');
  await campus.write(path, { version: 2 }, 'DELETE');
  await campus.write(path + '/restore');
  assert.deepEqual((await inspect()).histories, histories);
  assert.equal((await campus.read(path)).histories.length, 13);
  assert.equal(await client.run((ctx) => ctx.db.query('fileObjects').first()), null);
  assert.equal(await client.run((ctx) => ctx.db.query('nativeUploads').first()), null);
  await assert.rejects(
    as('campus-b').actionContext('/api/history/deferred-0'),
    /Registro não encontrado/,
  );
});

test('native institutional publication requires admin confirmation and preserves earlier document snapshots', async () => {
  const { as, inspect } = await fixture({
    documents: [
      {
        id: 'prior',
        year: 2027,
        type: 'norma',
        title: 'Norma anterior',
        status: 'vigente',
        publishedAt: '2026-01-01T00:00:00Z',
      },
      { id: 'next', year: 2027, type: 'norma', title: 'Norma posterior', status: 'rascunho' },
      {
        id: 'other-year',
        year: 2028,
        type: 'norma',
        title: 'Norma de outro ano',
        status: 'rascunho',
      },
    ],
  });
  const admin = as('admin');
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', createBody());
  assert.deepEqual(
    record.documentSnapshot.map((doc) => doc.id),
    ['prior'],
  );
  assert.equal((await admin.read('/api/documents')).documents.length, 3);
  assert.deepEqual(
    (await campus.read('/api/documents')).documents.map((doc) => doc.id),
    ['prior'],
  );
  await assert.rejects(
    campus.write('/api/documents/next/status', {
      revision: 1,
      status: 'vigente',
      confirmed: true,
    }),
    /Acesso exclusivo/,
  );
  await assert.rejects(
    admin.write('/api/documents/next/status', {
      revision: 1,
      status: 'vigente',
      confirmed: false,
    }),
    /Confirme/,
  );
  await assert.rejects(
    admin.write('/api/documents/next/status', {
      revision: 0,
      status: 'vigente',
      confirmed: true,
    }),
    /base mudou/,
  );
  await admin.write('/api/documents/next/status', {
    revision: 1,
    status: 'vigente',
    confirmed: true,
  });
  const published = await admin.read('/api/documents');
  assert.equal(published.revision, 2);
  assert.equal(published.documents.find((doc) => doc.id === 'prior').status, 'arquivado');
  const path = '/api/calendars/' + record.id;
  const loaded = await campus.read(path);
  assert.deepEqual(
    loaded.documentSnapshot.map((doc) => doc.id),
    ['prior'],
  );
  assert.deepEqual(
    loaded.currentDocuments.map((doc) => doc.id),
    ['next'],
  );
  await assert.rejects(
    campus.actionContext(path + '/pdf', {
      version: 1,
      catalogueRevision: 2,
    }),
    /Salve a versão atual/,
  );
  await campus.write(
    path,
    {
      version: 1,
      catalogueRevision: 2,
      state: loaded.state,
    },
    'PUT',
  );
  const updated = await campus.read(path);
  assert.equal(updated.version, 2);
  assert.deepEqual(
    updated.documentSnapshot.map((doc) => doc.id),
    ['next'],
  );
  const archived = (await inspect()).calendars[0].versions[0];
  assert.deepEqual(
    archived.documentSnapshot.map((doc) => doc.id),
    ['prior'],
  );
  await admin.write('/api/documents/next/status', { revision: 2, status: 'arquivado' });
  assert.equal((await admin.read('/api/documents')).revision, 3);
  assert.deepEqual((await campus.read(path)).currentDocuments, []);
  await admin.write('/api/documents/next/status', { revision: 3, status: 'arquivado' });
  assert.equal((await admin.read('/api/documents')).revision, 3, 'repeated status is idempotent');
  assert.deepEqual((await inspect()).calendars[0].versions[0], archived);
});
