import test from 'node:test';
import assert from 'node:assert/strict';
import { createConvexTestDatabase } from './helpers/convex-database.mjs';
import { persistentSessions, consumeLoginAttempt } from '../src/session-store.mjs';
import { openConvexStore } from '../src/convex-store.mjs';

const calendarState = () => ({
  year: 2027,
  campus: 'Campus A',
  offer: 'integrado',
  modalities: ['integrado', 'graduacao'],
  periods: [{ id: 'period', start: '2027-02-01', end: '2027-12-17' }],
  events: [{ id: 'event', name: 'Original', kind: 'note', optional: undefined }],
  teacherVacations: { secondStart: undefined, evidence: null },
});

function graph() {
  const snapshot = {
    version: 1,
    at: '2026-10-20T12:00:00.000Z',
    catalogueRevision: 7,
    state: calendarState(),
    documentSnapshot: [{ id: 'doc', hash: 'document-hash', unknown: [false, 0, '', null] }],
    institutionalEvents: [],
    future: { detail: 'Complete immutable revision', optional: undefined },
  };
  const state = {
    users: [
      { id: 'u1', email: 'one@ifpr.edu.br', role: 'ADMIN', active: true },
      { id: 'u2', email: 'two@ifpr.edu.br', role: 'CAMPUS', campusId: 'b', active: true },
    ],
    campuses: [
      { id: 'a', name: 'Campus A' },
      { id: 'b', name: 'Campus B' },
    ],
    calendars: ['one', 'two'].map((id, i) => ({
      id,
      campusId: i ? 'b' : 'a',
      state: calendarState(),
      version: 3,
      catalogueRevision: 7,
      versions: [structuredClone(snapshot), structuredClone(snapshot)],
      deletedAt: null,
    })),
    histories: [
      {
        id: 'h1',
        calendarId: 'one',
        campusId: 'a',
        data: Buffer.from('%PDF-fixture').toString('base64'),
      },
      { id: 'h2', calendarId: 'two', campusId: 'b', analysis: { pages: [], optional: undefined } },
    ],
    audit: [{ action: 'IMPORT' }, { action: 'IMPORT' }],
    catalogue: { revision: 7, events: [] },
    sessions: [
      { id: 'session-one', userId: 'u1', expires: 9999999999999 },
      { id: 'session-two', userId: 'u2', expires: 9999999999999 },
    ],
    reviews: [
      { calendarId: 'one', revision: 2, history: [{ revision: 1, extra: { preserve: true } }] },
      { calendarId: 'two', revision: 1, history: [] },
    ],
    documents: [{ id: 'doc', data: Buffer.from('%PDF-document').toString('base64') }],
    uploads: [],
    optional: undefined,
    counter: 0,
    future: JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"retain":true},"nested":[{},[],null,0,false,""]}',
    ),
  };
  Object.defineProperty(state, '__proto__', {
    value: { storedAsData: true },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return state;
}

test('Convex import/export retains exact document shapes, bytes, duplicate revisions and extensions', async (t) => {
  const { store, reopen } = await createConvexTestDatabase(t, { seed: false });
  const original = graph();
  assert.deepEqual(await store.exportState(), {});
  await store.importState(original);
  assert.deepEqual(await store.exportState(), original);
  assert.deepEqual(await (await reopen()).exportState(), original);
  assert.equal({}.polluted, undefined);
  await assert.rejects(store.importState(original), /vazio/);
  assert.deepEqual(await store.exportState(), original);
});

test('Convex selected reads match calendar, campus, user, session and full-history projections', async (t) => {
  const { store } = await createConvexTestDatabase(t, { seed: false });
  const original = graph();
  await store.importState(original);
  const scoped = await store.read({
    fields: ['calendars', 'histories', 'reviews'],
    calendarId: 'one',
    campusId: 'a',
  });
  assert.deepEqual(Object.keys(scoped).sort(), ['calendars', 'histories', 'reviews']);
  assert.deepEqual(
    scoped.calendars.map((item) => item.id),
    ['one'],
  );
  assert.deepEqual(
    scoped.histories.map((item) => item.id),
    ['h1'],
  );
  assert.deepEqual(
    scoped.reviews.map((item) => item.calendarId),
    ['one'],
  );
  assert.deepEqual(
    scoped.calendars[0].versions,
    original.calendars[0].versions.map(({ version, at, catalogueRevision }) => ({
      version,
      at,
      catalogueRevision,
    })),
  );
  assert.deepEqual(
    (await store.read({ fields: ['calendars'], calendarId: 'one', campusId: 'b' })).calendars,
    [],
  );
  assert.deepEqual((await store.read({ fields: ['users'], email: "' OR true --" })).users, []);
  assert.deepEqual(
    (await store.read({ fields: ['users'], userId: 'u1', email: 'two@ifpr.edu.br' })).users,
    [original.users[0]],
  );
  assert.deepEqual(
    (await store.read({ fields: ['sessions'], sessionHash: 'session-two' })).sessions,
    [original.sessions[1]],
  );
  assert.deepEqual(await store.read({ fields: ['absent'] }), {});
  assert.deepEqual(await store.read({ fields: ['optional'] }), { optional: undefined });
  const full = await store.read({
    fields: ['calendars'],
    calendarId: 'one',
    campusId: 'b',
    full: true,
  });
  assert.deepEqual(full.calendars, original.calendars);
  const summary = (await store.read({ fields: ['calendars'], calendarId: 'one', summary: true }))
    .calendars[0];
  assert.deepEqual(summary.state, {
    year: 2027,
    offer: 'integrado',
    modalities: ['integrado', 'graduacao'],
    campus: 'Campus A',
  });
  assert.equal(Object.hasOwn(summary, 'versions'), false);
});

test('Convex scoped changes append complete immutable revisions and preserve unselected entities and order', async (t) => {
  const { store } = await createConvexTestDatabase(t, { seed: false });
  const original = graph();
  await store.importState(original);
  const saved = await store.change(
    (db) => {
      const calendar = db.calendars[0];
      calendar.versions.push({
        version: calendar.version,
        state: structuredClone(calendar.state),
        at: 'now',
        unknown: { retained: true },
      });
      calendar.version++;
      calendar.state.events[0].name = 'Updated';
      db.audit.push({ action: 'SAVE', id: calendar.id });
      return { version: calendar.version };
    },
    { fields: ['calendars', 'audit'], calendarId: 'two', appendOnlyAudit: true },
  );
  assert.deepEqual(saved, { version: 4 });
  const after = await store.exportState();
  assert.deepEqual(after.calendars[0], original.calendars[0]);
  assert.deepEqual(after.calendars[1].versions.slice(0, 2), original.calendars[1].versions);
  assert.equal(after.calendars[1].versions[2].state.events[0].name, 'Original');
  assert.equal(after.calendars[1].state.events[0].name, 'Updated');
  assert.deepEqual(
    after.calendars.map((item) => item.id),
    ['one', 'two'],
  );
  assert.deepEqual(after.audit, [...original.audit, { action: 'SAVE', id: 'two' }]);
  await store.change((db) => db.campuses.reverse(), { fields: ['campuses'] });
  assert.deepEqual((await store.exportState()).campuses, original.campuses.toReversed());
});

test('Convex rejects destructive calendar, revision, review and audit edits atomically', async (t) => {
  const { store } = await createConvexTestDatabase(t, { seed: false });
  const original = graph();
  await store.importState(original);
  const cases = [
    [
      (db) => {
        db.calendars = [];
      },
      { fields: ['calendars'] },
      /preservados/,
    ],
    [
      (db) => {
        db.calendars.reverse();
      },
      { fields: ['calendars'] },
      /preservados/,
    ],
    [
      (db) => {
        delete db.calendars;
      },
      { fields: ['calendars'], calendarId: 'absent' },
      /preservados/,
    ],
    [
      (db) => {
        db.calendars[0].versions = [];
      },
      { fields: ['calendars'], calendarId: 'one' },
      /histórico/,
    ],
    [
      (db) => {
        db.calendars.push({ id: 'other' });
      },
      { fields: ['calendars'], calendarId: 'one' },
      /fora do calendário/,
    ],
    [
      (db) => {
        db.reviews = [];
      },
      { fields: ['reviews'] },
      /pareceres/,
    ],
    [
      (db) => {
        db.reviews[0].history = [];
      },
      { fields: ['reviews'], calendarId: 'one' },
      /pareceres/,
    ],
    [
      (db) => {
        db.audit[0].action = 'REWRITE';
      },
      { fields: ['audit'] },
      /auditoria/,
    ],
    [
      (db) => {
        delete db.audit;
      },
      { fields: ['audit'], appendOnlyAudit: true },
      /auditoria/,
    ],
    [
      (db) => {
        delete db.sessions;
      },
      { fields: ['sessions'], sessionHash: 'absent' },
      /coleção selecionada/,
    ],
  ];
  for (const [change, options, message] of cases) {
    await assert.rejects(store.change(change, options), message);
    assert.deepEqual(await store.exportState(), original);
  }
});

test('Convex rejects invalid imports without leaving partially imported documents', async (t) => {
  const { store } = await createConvexTestDatabase(t, { seed: false });
  await assert.rejects(
    store.importState({ users: [{ id: 'duplicate' }, { id: 'duplicate' }] }),
    /duplicado/,
  );
  assert.deepEqual(await store.exportState(), {});
  await assert.rejects(store.importState([]), /inválido/);
  assert.deepEqual(await store.exportState(), {});
});

test('Convex rejects imported identities that are missing or collide after storage-key conversion', async (t) => {
  for (const users of [
    [{}, { id: '0' }],
    [{ id: null }, { id: '0' }],
    [{ id: 1 }, { id: '1' }],
  ]) {
    const { store } = await createConvexTestDatabase(t, { seed: false });
    await assert.rejects(store.importState({ users }), /ausente|inválido|duplicado/);
    assert.deepEqual(await store.exportState(), {});
  }
});

test('Convex rejects imports beyond readable entity and revision bounds before retaining any data', async (t) => {
  const states = [
    { campuses: Array.from({ length: 1001 }, (_, index) => ({ id: 'campus-' + index })) },
    {
      calendars: [
        {
          id: 'too-many-versions',
          versions: Array.from({ length: 5001 }, (_, version) => ({ version })),
        },
      ],
    },
    {
      reviews: [
        {
          calendarId: 'too-many-reviews',
          history: Array.from({ length: 5001 }, (_, revision) => ({ revision })),
        },
      ],
    },
  ];
  for (const state of states) {
    const { store } = await createConvexTestDatabase(t, { seed: false });
    await assert.rejects(store.importState(state), /Limite|1000 registros/);
    assert.deepEqual(await store.exportState(), {});
  }
});

test('Convex queries and mutations reject callers without the server bridge secret', async (t) => {
  const { store, client } = await createConvexTestDatabase(t, { seed: false });
  await store.importState({ counter: 0 });
  const unauthorized = await openConvexStore('https://isolated-test.convex.cloud', {
    client,
    secret: 'incorrect-test-bridge-secret-value',
    seed: false,
  });
  await assert.rejects(unauthorized.read(), /não autorizado/);
  await assert.rejects(unauthorized.importState({ counter: 1 }), /não autorizado/);
  assert.deepEqual(await store.exportState(), { counter: 0 });
});

test('Convex no-op callbacks and thrown errors preserve all data and callback results', async (t) => {
  const { store } = await createConvexTestDatabase(t, { seed: false });
  const original = graph();
  await store.importState(original);
  assert.deepEqual(
    await store.change(() => ({ unchanged: true }), { fields: ['calendars'], calendarId: 'one' }),
    { unchanged: true },
  );
  await assert.rejects(
    store.change((db) => {
      db.counter = 900;
      db.users = [];
      throw Error('fixture rollback');
    }),
    /fixture rollback/,
  );
  assert.deepEqual(await store.exportState(), original);
});

test('Convex stale snapshots rerun callbacks and retain increments from independent clients', async (t) => {
  const { store, reopen } = await createConvexTestDatabase(t, { seed: false });
  await store.importState({ counter: 0 });
  const second = await reopen();
  let enter,
    release,
    attempts = 0;
  const entered = new Promise((resolve) => {
    enter = resolve;
  });
  const released = new Promise((resolve) => {
    release = resolve;
  });
  const first = store.change(
    async (db) => {
      attempts++;
      db.counter++;
      if (attempts === 1) {
        enter();
        await released;
      }
      return db.counter;
    },
    { fields: ['counter'] },
  );
  await entered;
  await second.change(
    (db) => {
      db.counter++;
    },
    { fields: ['counter'] },
  );
  release();
  assert.equal(await first, 2);
  assert.equal(attempts, 2);
  assert.equal((await store.exportState()).counter, 2);
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? store : second).change(
        (db) => {
          db.counter++;
        },
        { fields: ['counter'] },
      ),
    ),
  );
  assert.equal((await store.exportState()).counter, 14);
});

test('Convex retries when an unchanged read collection gains an entity before commit', async (t) => {
  const { store, reopen } = await createConvexTestDatabase(t, { seed: false });
  await store.importState({ users: [], counter: -1 });
  const second = await reopen();
  let enter,
    release,
    attempts = 0;
  const entered = new Promise((resolve) => {
    enter = resolve;
  });
  const released = new Promise((resolve) => {
    release = resolve;
  });
  const first = store.change(
    async (db) => {
      attempts++;
      db.counter = db.users.length;
      if (attempts === 1) {
        enter();
        await released;
      }
      return db.counter;
    },
    { fields: ['users', 'counter'] },
  );
  await entered;
  await second.change((db) => db.users.push({ id: 'new-user' }), { fields: ['users'] });
  release();
  assert.equal(await first, 1);
  assert.equal(attempts, 2);
  assert.equal((await store.exportState()).counter, 1);
});

test('Convex deleting selected sessions and histories retains records outside the selected scope', async (t) => {
  const { store } = await createConvexTestDatabase(t, { seed: false });
  const original = graph();
  await store.importState(original);
  await store.change(
    (db) => {
      db.sessions = [];
    },
    { fields: ['sessions'], sessionHash: 'session-one' },
  );
  await store.change(
    (db) => {
      db.histories = [];
    },
    { fields: ['histories'], calendarId: 'one', campusId: 'a' },
  );
  const after = await store.exportState();
  assert.deepEqual(after.sessions, [original.sessions[1]]);
  assert.deepEqual(after.histories, [original.histories[1]]);
  assert.deepEqual(after.calendars, original.calendars);
});

test('Convex concurrent calendar scopes append every audit record without losing either calendar', async (t) => {
  const { store, reopen } = await createConvexTestDatabase(t, { seed: false });
  await store.importState(graph());
  const second = await reopen();
  await Promise.all(
    ['one', 'two'].map((calendarId, index) =>
      (index ? store : second).change(
        (db) => {
          assert.deepEqual(db.audit, []);
          db.calendars[0].version++;
          db.audit.push({ action: 'SAVE', id: calendarId });
        },
        { fields: ['calendars', 'audit'], calendarId, appendOnlyAudit: true },
      ),
    ),
  );
  const after = await store.exportState();
  assert.deepEqual(
    after.calendars.map((item) => item.version),
    [4, 4],
  );
  assert.equal(after.audit.length, 4);
  assert.deepEqual(
    after.audit
      .slice(2)
      .map((item) => item.id)
      .sort(),
    ['one', 'two'],
  );
});

test('Convex campus logs retain imported and newly created targets when audit is the first root field', async (t) => {
  const { store } = await createConvexTestDatabase(t, { seed: false });
  await store.importState({
    audit: [{ action: 'CREATE_CALENDAR', id: 'imported', actor: 'admin', at: 'before' }],
    calendars: [
      {
        id: 'imported',
        campusId: 'campus',
        state: { year: 2027, campus: 'Imported' },
        versions: [],
      },
    ],
    histories: [],
    users: [{ id: 'admin', name: 'Administrator' }],
  });
  const user = { id: 'campus-user', role: 'CAMPUS', campusId: 'campus' };
  let page = await store.auditPage(user);
  assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].calendar, 'Calendário 2027 - Campus Imported');
  await store.change(
    (db) => {
      db.calendars.push({
        id: 'created',
        campusId: 'campus',
        state: { year: 2028, campus: 'Created' },
        versions: [],
      });
      db.audit.push({ action: 'CREATE_CALENDAR', id: 'created', actor: 'admin', at: 'after' });
    },
    { appendOnlyAudit: true },
  );
  page = await store.auditPage(user);
  assert.equal(page.entries.length, 2);
  assert.deepEqual(
    page.entries.map((entry) => entry.calendar),
    ['Calendário 2028 - Campus Created', 'Calendário 2027 - Campus Imported'],
  );
});

test('Convex sessions survive reopened stores and shared login throttling keeps its limit', async (t) => {
  const { store, reopen } = await createConvexTestDatabase(t, { seed: false });
  await store.importState({ users: [{ id: 'user' }], sessions: [] });
  const second = await reopen();
  const token = 'a'.repeat(64);
  await persistentSessions(store).set(token, { userId: 'user', expires: Date.now() + 600000 });
  assert.equal((await persistentSessions(second).get(token)).userId, 'user');
  assert(!JSON.stringify(await store.exportState()).includes(token));
  await persistentSessions(second).delete(token);
  assert.equal(await persistentSessions(store).get(token), undefined);
  const allowed = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      consumeLoginAttempt(i % 2 ? store : second, 'synthetic-login'),
    ),
  );
  assert.equal(allowed.filter(Boolean).length, 15);
});
