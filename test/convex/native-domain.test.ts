import { inspectCalendar } from '../../src/domain/calendar/base.ts';
import type { FunctionReturnType } from 'convex/server';
import type { CalendarActivity } from '../../src/domain/calendar/model.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { api } from '../../convex/_generated/api.js';
import { ConvexError } from 'convex/values';
import { reviewCriteriaFor } from '../../src/domain/reviews/criteria.ts';
import { initialCatalogue } from '../../src/domain/institution/catalogue.ts';
import { teacherDayId } from '../../src/domain/institution/teacher-day.ts';
import { createNativeFixture as fixture } from '../helpers/native-database.ts';

const createBody = (campusId = 'a') => ({
  campusId,
  year: 2027,
  offers: [{ kind: 'integrado' as const, organization: 'anual' as const }],
  courses: 'Técnico',
  purpose: 'test' as const,
});
const changedState = (state: Record<string, unknown>, name = 'Atividade') => ({
  ...state,
  events: [{ id: 'event', name, start: '2027-02-01', end: '2027-02-01', kind: 'note' }],
});
const saveBody = (
  record: {
    version: number;
    currentCatalogueRevision?: number;
    catalogueRevision: number;
    state: Record<string, unknown>;
  },
  name = 'Atividade',
) => ({
  version: record.version,
  catalogueRevision: record.currentCatalogueRevision ?? record.catalogueRevision,
  state: changedState(record.state, name),
});

// These tests execute the real native handlers with isolated Convex transactions.
test('native queries require a live Convex session and return safe campus scoped bootstrap', async () => {
  const { client, as, ids } = await fixture();
  await assert.rejects(client.query(api.workspace.bootstrap, {}), /Entre com sua conta/);
  const status = await client.query(api.access.session.status, {});
  assert.equal(status.user, null);
  assert.equal(status.setupRequired, false);
  const a = await as('campus-a').write('/api/calendars', createBody('a'));
  await as('campus-b').write('/api/calendars', createBody('b'));
  const bootstrap = await as('campus-a').read('/api/bootstrap');
  assert.deepEqual(
    bootstrap.calendars.map((c: { id: string }) => c.id),
    [a.id],
  );
  assert.deepEqual(bootstrap.users, []);
  assert.deepEqual(
    bootstrap.campuses.map((c: { id: string }) => c.id),
    [ids.campuses.a],
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
  const record = full.calendars.find((c: { id: string }) => c.id === created.id)!;
  assert.equal(record.version, 3);
  assert.equal(record.versions.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(record.versions[0].state)), created.state);
  assert.equal(record.versions[1].state.events[0].name, 'Atividade');
  const logs = await campus.read('/api/logs');
  assert.equal(logs.entries.length, 3);
  assert(logs.entries.every((entry: { actor: string }) => entry.actor === 'Campus A'));
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
    /Salve o parecer antes de exportar/,
  );
  const body = {
    rulesetVersion: support.rulesetVersion,
    baseIdentity: support.baseIdentity,
    revision: 0,
    calendarVersion: 1,
    catalogueRevision: 1,
    conclusion: support.initialConclusion,
    entries: reviewCriteriaFor(2027).map((c) => ({
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
    /parecer está desatualizado/,
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
    active: true,
    start: '2027-04-21',
    end: '2027-04-21',
    kind: 'exclude',
    category: 'feriado',
    evidence: 'Lei',
    modalities: ['integrado'],
  });
  await assert.rejects(
    campus.write(path, { ...saveBody(await campus.read(path)), catalogueRevision: 1 }, 'PUT'),
    /mudanças aplicáveis na base institucional/,
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

test('native document actions register only validated storage files', async () => {
  const { as, client, ids } = await fixture();
  const admin = as('admin'),
    campus = as('campus-a');
  const result = { size: 12, hash: 'a'.repeat(64), uploadId: 'native-test' };
  const documentResult = { ...result, uploadId: 'admin-upload' };
  await client.run(async (ctx) =>
    ctx.db.insert('nativeUploads', {
      uploadId: documentResult.uploadId,
      ownerId: ids.users.admin,
      filename: 'norma.pdf',
      size: result.size,
      expiresAt: Date.now() + 10000,
      storageId: await ctx.storage.store(new Blob(['%PDF-admin--'], { type: 'application/pdf' })),
      hash: result.hash,
      completedAt: Date.now(),
      verifiedIngress: true,
    }),
  );
  const document = await admin.finishAction(
    '/api/documents',
    { year: 2027, type: 'norma', title: 'Norma', source: 'Fonte', filename: 'norma.pdf' },
    documentResult,
  );
  assert.equal((await campus.read('/api/documents')).documents.length, 0);
  await admin.write('/api/documents/' + document.id + '/status', {
    status: 'vigente',
    confirmed: true,
    revision: 1,
  });
  assert.equal((await campus.read('/api/documents')).documents.length, 1);
});

test('native calendar saves validate per-offer stages and preserve the selected second-semester intake', async () => {
  const { as } = await fixture();
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', {
    ...createBody(),
    offers: [
      { kind: 'integrado', organization: 'semestral' },
      { kind: 'graduacao', organization: 'semestral' },
    ],
  });
  const path = '/api/calendars/' + record.id;
  const state = {
    ...record.state,
    offers: [
      { ...record.state.offers[0], stages: { perTerm: 2 }, intake: { second: { status: 'no' } } },
      { ...record.state.offers[1], stages: { perTerm: 1 }, intake: { second: { status: 'no' } } },
    ],
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'p',
        name: 'Primeiro semestre',
        start: '2027-03-01',
        end: '2027-03-12',
        association: { status: 'defined', offers: ['integrado', 'graduacao'], term: 'first' },
      },
      {
        id: 'q',
        name: 'Segundo semestre',
        start: '2027-04-01',
        end: '2027-04-14',
        association: { status: 'defined', offers: ['integrado', 'graduacao'], term: 'second' },
      },
    ],
    events: [
      {
        id: 'stage',
        name: 'Graduação',
        requirementId: 'stage-1:graduacao',
        offers: ['graduacao'],
        start: '2027-03-01',
        end: '2027-03-12',
        kind: 'note',
        category: 'limite',
      },
    ],
  };
  await campus.write(path, { ...saveBody(record), state }, 'PUT');
  const loaded = await campus.read(path);
  assert.deepEqual(loaded.state.offers, state.offers);
  assert.equal(loaded.state.events[0].requirementId, 'stage-1:graduacao');
  assert.equal(loaded.state.offers[1].intake.second.status, 'no');
  for (const invalid of [
    {
      ...state,
      offers: [{ ...state.offers[0], intake: { second: { status: 'false' } } }, state.offers[1]],
    },
    { ...state, events: [{ ...state.events[0], offers: ['integrado'] }] },
    { ...state, year: 2028 },
    { ...state, offers: [{ ...state.offers[0], kind: 'posgraduacao' }] },
  ]) {
    await assert.rejects(campus.write(path, { ...saveBody(loaded), state: invalid }, 'PUT'));
  }
  assert.equal((await campus.read(path)).version, loaded.version);
});

test('native calendar retains the campus teacher-day choice in immutable PDF inputs and protects institutional events', async () => {
  const { as, inspect } = await fixture({
    catalogue: {
      ...initialCatalogue(),
      events: initialCatalogue().events.map((event) => ({ ...event })),
    },
  });
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
  assert.equal(
    loaded.institutionalSnapshot.find((e: CalendarActivity) => e.id === teacherDayId)!.start,
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
  assert.equal(
    loaded.institutionalEvents.find((e: CalendarActivity) => e.id === teacherDayId)!.start,
    '2027-10-15',
  );
  const full = await inspect();
  assert.equal(
    full.catalogue.events.find((e: CalendarActivity) => 'inst:' + e.id === teacherDayId)!.start,
    '2027-10-15',
  );
  assert.equal(full.calendars[0].versions[1].state.teacherDayDate, '2027-10-13');
});

test('native institutional publication requires admin confirmation and preserves earlier document snapshots', async () => {
  const { as, inspect, ids } = await fixture({
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
    record.documentSnapshot.map((doc: { id: string }) => doc.id),
    [ids.documents.prior],
  );
  assert.equal((await admin.read('/api/documents')).documents.length, 3);
  assert.deepEqual(
    (await campus.read('/api/documents')).documents.map((doc: { id: string }) => doc.id),
    [ids.documents.prior],
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
  assert.equal(
    published.documents.find((doc: { id: string }) => doc.id === ids.documents.prior)!.status,
    'arquivado',
  );
  const path = '/api/calendars/' + record.id;
  const loaded = await campus.read(path);
  assert.deepEqual(
    loaded.documentSnapshot.map((doc: { id: string }) => doc.id),
    [ids.documents.prior],
  );
  assert.deepEqual(
    loaded.currentDocuments.map((doc: { id: string }) => doc.id),
    [ids.documents.next],
  );
  await campus.write(
    path,
    {
      version: 1,
      catalogueRevision: 2,
      baseAcceptance: inspectCalendar(loaded, loaded).identity,
      state: loaded.state,
    },
    'PUT',
  );
  const updated = await campus.read(path);
  assert.equal(updated.version, 2);
  assert.deepEqual(
    updated.documentSnapshot.map((doc: { id: string }) => doc.id),
    [ids.documents.next],
  );
  const archived = (await inspect()).calendars[0].versions[0];
  assert.deepEqual(
    archived.documentSnapshot.map((doc: { id: string }) => doc.id),
    [ids.documents.prior],
  );
  await admin.write('/api/documents/next/status', { revision: 2, status: 'arquivado' });
  assert.equal((await admin.read('/api/documents')).revision, 3);
  assert.deepEqual((await campus.read(path)).currentDocuments, []);
  await admin.write('/api/documents/next/status', { revision: 3, status: 'arquivado' });
  assert.equal((await admin.read('/api/documents')).revision, 3, 'repeated status is idempotent');
  assert.deepEqual((await inspect()).calendars[0].versions[0], archived);
});

test('institutional revisions affect only calendars and reviews for the changed year', async () => {
  const { as } = await fixture({
    documents: [
      { id: 'next-year', year: 2028, type: 'norma', title: 'Norma de 2028', status: 'rascunho' },
    ],
  });
  const admin = as('admin');
  const campus = as('campus-a');
  const record = await campus.write('/api/calendars', createBody());
  const path = '/api/calendars/' + record.id;
  const reviewPath = '/api/reviews/' + record.id;
  const support = await admin.read(reviewPath);
  await admin.write(
    reviewPath,
    {
      rulesetVersion: support.rulesetVersion,
      baseIdentity: support.baseIdentity,
      revision: 0,
      calendarVersion: record.version,
      catalogueRevision: support.catalogueRevision,
      conclusion: support.initialConclusion,
      entries: reviewCriteriaFor(2027).map((criterion) => ({
        id: criterion.id,
        status: 'PENDENTE',
        notes: '',
        reviewed: false,
      })),
    },
    'PUT',
  );
  await admin.write('/api/documents/next-year/status', {
    status: 'vigente',
    confirmed: true,
    revision: 1,
  });
  assert.equal((await admin.read('/api/documents')).revision, 2);
  assert.equal((await campus.read(path)).currentCatalogueRevision, record.currentCatalogueRevision);
  assert.equal((await admin.read(reviewPath)).stale, false);
  await admin.write('/api/catalogue', {
    revision: 2,
    name: 'Evento do outro ano',
    start: '2028-04-21',
    end: '2028-04-21',
    kind: 'exclude',
    category: 'feriado',
    evidence: 'Norma sintética',
    modalities: ['integrado'],
    active: true,
  });
  const unaffected = await campus.read(path);
  assert.equal(unaffected.currentCatalogueRevision, record.currentCatalogueRevision);
  assert.equal((await admin.read(reviewPath)).stale, false);
  const saved = await campus.write(path, saveBody(unaffected), 'PUT');
  assert.equal(saved.version, 2, 'saving the original year still uses its existing base revision');
});

test('calendar pagination applies campus and trash scope before advancing its cursor', async () => {
  const { asClient, ids } = await fixture();
  const admin = asClient('admin');
  const campus = asClient('campus-a');
  const created = [];
  for (let index = 0; index < 5; index++)
    created.push(
      await admin.mutation(api.calendars.createCalendar, {
        body: { ...createBody(), campusId: ids.campuses.a, courses: 'Campus A ' + index },
      }),
    );
  for (let index = 0; index < 3; index++)
    await admin.mutation(api.calendars.createCalendar, {
      body: { ...createBody(), campusId: ids.campuses.b, courses: 'Campus B ' + index },
    });
  await admin.mutation(api.calendars.deleteCalendar, { id: created[0].id, version: 1 });
  await admin.mutation(api.calendars.deleteCalendar, { id: created[1].id, version: 1 });
  const loaded = [];
  let cursor: string | null = null;
  for (;;) {
    const result: FunctionReturnType<typeof api.calendars.calendarPage> = await admin.query(
      api.calendars.calendarPage,
      {
        campusId: ids.campuses.a,
        deleted: false,
        paginationOpts: { numItems: 2, cursor },
      },
    );
    loaded.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  assert.deepEqual(
    new Set(loaded.map((record) => record.id)),
    new Set(created.slice(2).map((record) => record.id)),
  );
  const trash = await campus.query(api.calendars.calendarPage, {
    deleted: true,
    paginationOpts: { numItems: 10, cursor: null },
  });
  assert.deepEqual(
    new Set(trash.page.map((record) => record.id)),
    new Set(created.slice(0, 2).map((record) => record.id)),
  );
  await assert.rejects(
    campus.query(api.calendars.calendarPage, {
      campusId: ids.campuses.b,
      paginationOpts: { numItems: 2, cursor: null },
    }),
    /Registro não encontrado/,
  );
});

test('document pagination applies publication access and year filters before its cursor', async () => {
  const { asClient, ids } = await fixture({
    documents: [
      {
        id: 'draft-2027',
        year: 2027,
        type: 'norma',
        title: 'Rascunho privado',
        status: 'rascunho',
      },
      {
        id: 'current-2027',
        year: 2027,
        type: 'norma',
        title: 'Norma vigente',
        status: 'vigente',
        publishedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'archived-2027',
        year: 2027,
        type: 'referencia',
        title: 'Referência preservada',
        status: 'arquivado',
        publishedAt: '2026-02-01T00:00:00Z',
      },
      {
        id: 'current-2028',
        year: 2028,
        type: 'norma',
        title: 'Norma de outro ano',
        status: 'vigente',
        publishedAt: '2026-03-01T00:00:00Z',
      },
    ],
  });
  const campus = asClient('campus-a');
  const loaded = [];
  let cursor: string | null = null;
  for (;;) {
    const result: FunctionReturnType<typeof api.documents.documentPage> = await campus.query(
      api.documents.documentPage,
      { year: 2027, paginationOpts: { numItems: 1, cursor } },
    );
    loaded.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  assert.deepEqual(
    new Set(loaded.map((document) => document.id)),
    new Set([ids.documents['current-2027'], ids.documents['archived-2027']]),
  );
  const admin = await asClient('admin').query(api.documents.documentPage, {
    year: 2027,
    paginationOpts: { numItems: 10, cursor: null },
  });
  assert.equal(admin.page.length, 3);
  assert(admin.page.some((document) => document.id === ids.documents['draft-2027']));
});

test('document status filters are administrative and paginate within the selected status and year', async () => {
  const { asClient, ids } = await fixture({
    documents: [
      { id: 'draft', year: 2027, type: 'norma', title: 'Rascunho', status: 'rascunho' },
      { id: 'draft2', year: 2027, type: 'norma', title: 'Outro rascunho', status: 'rascunho' },
      { id: 'other-year', year: 2028, type: 'norma', title: 'Outro ano', status: 'rascunho' },
      {
        id: 'current',
        year: 2027,
        type: 'norma',
        title: 'Vigente',
        status: 'vigente',
        publishedAt: 1,
      },
    ],
  });
  const admin = asClient('admin');
  const loaded = [];
  let cursor: string | null = null;
  for (;;) {
    const result: FunctionReturnType<typeof api.documents.documentPage> = await admin.query(
      api.documents.documentPage,
      {
        year: 2027,
        status: 'rascunho',
        paginationOpts: { numItems: 1, cursor },
      },
    );
    loaded.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  assert.deepEqual(
    new Set(loaded.map((document) => document.id)),
    new Set([ids.documents.draft, ids.documents.draft2]),
  );
  const allYears = await admin.query(api.documents.documentPage, {
    status: 'rascunho',
    paginationOpts: { numItems: 10, cursor: null },
  });
  assert.equal(allYears.page.length, 3);
  for (const status of ['rascunho', 'vigente', 'arquivado'] as const)
    await assert.rejects(
      asClient('campus-a').query(api.documents.documentPage, {
        status,
        paginationOpts: { numItems: 10, cursor: null },
      }),
      /Acesso exclusivo/,
    );
});

test('domain rule violations reach the client as ConvexError with their status and message', async () => {
  const { asClient, ids } = await fixture();
  const admin = asClient('admin');
  await assert.rejects(
    admin.mutation(api.calendars.createCalendar, {
      body: { ...createBody(), campusId: ids.campuses.a, year: 2027.5 },
    }),
    (error: unknown) =>
      error instanceof ConvexError &&
      error.data?.status === 400 &&
      error.data.error === 'Ano inválido.',
  );
  const page = await admin.query(api.calendars.calendarPage, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  assert.equal(page.page.length, 0, 'the rejected calendar is not created');
});
