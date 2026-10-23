import test from 'node:test';
import assert from 'node:assert/strict';
import { getFunctionName } from 'convex/server';
import { openConvexStore } from '../src/convex-store.mjs';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';

const secret = 'fixture-server-bridge-secret';

function fakeClient(state, { keys = {}, snapshots = [], commits = [] } = {}) {
  const queries = [],
    mutations = [];
  return {
    queries,
    mutations,
    async query(reference, args) {
      queries.push({ name: getFunctionName(reference), args });
      const current = snapshots.shift() || {
        state,
        keys,
        tokens: [{ key: 'fixture:all', revision: 1 }],
      };
      return { ...current, state: encodeValue(current.state) };
    },
    async mutation(reference, args) {
      const name = getFunctionName(reference);
      mutations.push({ name, args });
      return name === 'store:commit' ? commits.shift() || { committed: true } : null;
    },
  };
}

async function fixture(state, options = {}) {
  const client = fakeClient(state, options),
    store = await openConvexStore('https://fixture.convex.cloud', { secret, client, seed: false });
  return { client, store };
}

test('Convex no-op mutations return the exact domain result without a commit', async () => {
  const { client, store } = await fixture({ users: [], extension: { value: undefined } });
  const marker = {};
  assert.equal(await store.change(() => marker), marker);
  assert.equal(client.mutations.length, 0);
  assert.equal(client.queries[0].name, 'store:snapshot');
  assert.equal(client.queries[0].args.secret, secret);
  assert.deepEqual(await store.read({ fields: ['extension'], calendarId: undefined }), {
    users: [],
    extension: { value: undefined },
  });
  assert.deepEqual(client.queries[1].args.options, { fields: ['extension'] });
});

test('Convex deltas preserve root presence, empty arrays and undefined values', async () => {
  const { client, store } = await fixture({ users: [], deleted: undefined, untouched: 1 });
  await store.change((state) => {
    delete state.deleted;
    state.uploads = [];
    state.extension = { explicit: undefined, $data: ['test'] };
  });
  const changes = client.mutations[0].args.changes;
  assert.deepEqual(
    changes.find((change) => change.field === 'deleted'),
    {
      field: 'deleted',
      removeRoot: true,
    },
  );
  assert.deepEqual(
    changes.find((change) => change.field === 'uploads'),
    {
      field: 'uploads',
      upserts: [],
      deleteKeys: [],
    },
  );
  assert.deepEqual(decodeValue(changes.find((change) => change.field === 'extension').value), {
    explicit: undefined,
    $data: ['test'],
  });
  assert.equal(
    changes.some((change) => change.field === 'untouched'),
    false,
  );
});

test('scoped changes retain keys and positions, delete only selected rows and append new rows', async () => {
  const { client, store } = await fixture(
    {
      histories: [
        { id: 'old', calendarId: 'calendar-a' },
        { id: 'kept', calendarId: 'calendar-a' },
      ],
    },
    {
      keys: {
        histories: [
          { key: 'old-key', position: 9 },
          { key: 'kept-key', position: 42 },
        ],
      },
    },
  );
  await store.change(
    (state) => {
      state.histories.shift();
      state.histories[0].name = 'updated';
      state.histories.push({ id: 'new', calendarId: 'calendar-a' });
    },
    { calendarId: 'calendar-a', fields: ['histories'] },
  );
  const change = client.mutations[0].args.changes[0];
  assert.deepEqual(change.deleteKeys, ['old-key']);
  assert.equal(change.upserts[0].key, 'kept-key');
  assert.equal(change.upserts[0].position, 42);
  assert.equal(change.upserts[1].position, null);
  assert.equal(decodeValue(change.upserts[1].value).id, 'new');
});

test('unscoped arrays retain identities while reordering positions and reject duplicate IDs', async () => {
  const initial = { users: [{ id: 'a' }, { id: 'b' }] },
    keys = {
      users: [
        { key: 'key-a', position: 0 },
        { key: 'key-b', position: 1 },
      ],
    };
  const { client, store } = await fixture(initial, { keys });
  await store.change((state) => state.users.reverse());
  assert.deepEqual(
    client.mutations[0].args.changes[0].upserts.map(({ key, position }) => ({ key, position })),
    [
      { key: 'key-b', position: 0 },
      { key: 'key-a', position: 1 },
    ],
  );
  await assert.rejects(
    store.change((state) => state.users.push({ id: 'a' })),
    /Identificador duplicado/,
  );
});

test('calendar versions, review histories and audit entries retain their immutable prefixes', async () => {
  for (const [initial, mutate, message] of [
    [
      { calendars: [{ id: 'a', versions: [{ version: 1 }] }] },
      (state) => {
        state.calendars[0].versions[0].version = 2;
      },
      /histórico existente/,
    ],
    [
      { calendars: [{ id: 'a' }] },
      (state) => {
        state.calendars = [];
      },
      /calendários existentes/,
    ],
    [
      { reviews: [{ calendarId: 'a', history: [{ text: 'original' }] }] },
      (state) => {
        state.reviews[0].history = [];
      },
      /histórico de pareceres/,
    ],
    [
      { reviews: [{ calendarId: 'a' }] },
      (state) => {
        state.reviews = [];
      },
      /histórico de pareceres/,
    ],
    [
      { audit: [{ action: 'original' }] },
      (state) => {
        state.audit[0].action = 'replacement';
      },
      /auditoria existente/,
    ],
  ]) {
    const { client, store } = await fixture(initial);
    await assert.rejects(store.change(mutate), message);
    assert.equal(client.mutations.length, 0);
  }
  const { client, store } = await fixture({ audit: [] });
  await store.change((state) => state.audit.push({ action: 'first' }, { action: 'second' }), {
    appendOnlyAudit: true,
  });
  const appended = client.mutations[0].args.changes[0].upserts;
  assert.notEqual(appended[0].key, appended[1].key);
  assert.equal(appended[0].position, null);
  assert.equal(appended[1].position, null);
});

test('calendar scopes reject records from another calendar before committing', async () => {
  for (const [field, item] of [
    ['calendars', { id: 'other-calendar' }],
    ['histories', { id: 'history', calendarId: 'other-calendar' }],
    ['reviews', { calendarId: 'other-calendar' }],
  ]) {
    const { client, store } = await fixture({ [field]: [] });
    await assert.rejects(
      store.change((state) => state[field].push(item), { calendarId: 'selected' }),
      /fora do calendário/,
    );
    assert.equal(client.mutations.length, 0);
  }
  const { store } = await fixture({ sessions: [] });
  await assert.rejects(
    store.change(
      (state) => {
        delete state.sessions;
      },
      { sessionHash: 'selected' },
    ),
    /coleção selecionada/,
  );
});

test('conflicts rerun the domain callback against a fresh snapshot and return its successful result', async () => {
  const { client, store } = await fixture(
    {},
    {
      snapshots: [
        { state: { counter: 1 }, keys: {}, tokens: [{ key: 'counter', revision: 1 }] },
        { state: { counter: 2 }, keys: {}, tokens: [{ key: 'counter', revision: 2 }] },
      ],
      commits: [{ committed: false }, { committed: true }],
    },
  );
  const calls = [],
    result = await store.change((state) => {
      calls.push(state.counter);
      state.counter++;
      return { value: state.counter };
    });
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(result, { value: 3 });
  assert.deepEqual(client.mutations[1].args.tokens, [{ key: 'counter', revision: 2 }]);
});

test('bounded conflict retries produce a useful HTTP 409', async () => {
  const client = fakeClient(
      { counter: 1 },
      { commits: [{ committed: false }, { committed: false }] },
    ),
    store = await openConvexStore('https://fixture.convex.cloud', {
      secret,
      client,
      seed: false,
      retries: 1,
    });
  await assert.rejects(
    store.change((state) => state.counter++),
    { status: 409, code: 'DENTEC_CONFLICT' },
  );
  assert.equal(client.mutations.length, 2);
});

test('initialization is explicit and imports return a full export after the atomic backend check', async () => {
  const client = fakeClient({ imported: true }),
    store = await openConvexStore('https://fixture.convex.cloud', { secret, client });
  assert.equal(client.mutations[0].name, 'store:initialize');
  const seed = decodeValue(client.mutations[0].args.state);
  assert.equal(seed.users.length, 0);
  assert.equal(seed.campuses.length > 0, true);
  assert.equal(seed.calendars.length, 0);
  assert.deepEqual(await store.importState({ imported: true }), { imported: true });
  assert.equal(client.mutations[1].name, 'store:importState');
  assert.deepEqual(client.queries[0].args.options, { full: true });
  await assert.rejects(store.importState([]), /Documento de importação inválido/);
  await store.close();
});
