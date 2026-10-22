import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaver, saveCalendarSnapshot } from '../web/autosave.js';

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const tick = async (t, ms) => {
  t.mock.timers.tick(ms);
  await settle();
};

test('autosave groups nearby applied changes and leaves unchanged records idle', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let state = { value: 0 },
    dirty = false,
    status;
  const writes = [];
  const saver = createAutosaver({
    isDirty: () => dirty,
    snapshot: () => state,
    write: async (sent) => {
      writes.push(sent);
      return {};
    },
    onSaved: () => (dirty = false),
    onStatus: (s) => (status = s),
  });
  saver.schedule();
  await tick(t, 3000);
  assert.equal(writes.length, 0);
  state.value = 1;
  dirty = true;
  saver.schedule();
  assert.equal(status, 'scheduled');
  await tick(t, 1000);
  assert.equal(writes.length, 0);
  state.value = 2;
  saver.schedule();
  await tick(t, 1499);
  assert.equal(writes.length, 0);
  await tick(t, 1);
  assert.deepEqual(writes, [{ value: 2 }]);
  assert.equal(status, 'saved');
  assert(!dirty);
  await tick(t, 30000);
  assert.equal(writes.length, 1);
});

test('autosave serializes writes and reschedules edits when their timer expires during a request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let state = { value: 1 },
    dirty = true,
    version = 1,
    resolve,
    status;
  const writes = [];
  const saver = createAutosaver({
    isDirty: () => dirty,
    snapshot: () => ({ state, version }),
    write: (sent) => {
      writes.push(sent);
      return writes.length === 1
        ? new Promise((r) => (resolve = r))
        : Promise.resolve({ version: 3 });
    },
    onSaved: (saved, sent) => {
      version = saved.version;
      dirty = JSON.stringify(state) !== JSON.stringify(sent.state);
    },
    onStatus: (s) => (status = s),
  });
  saver.schedule();
  await tick(t, 1500);
  const first = saver.save();
  state.value = 2;
  saver.schedule();
  assert.equal(status, 'saving');
  await tick(t, 1500);
  assert.equal(writes.length, 1);
  assert.equal(saver.save(true), first);
  resolve({ version: 2 });
  await first;
  assert.equal(status, 'scheduled');
  assert(dirty);
  assert.equal(state.value, 2);
  await tick(t, 1500);
  assert.deepEqual(writes, [
    { state: { value: 1 }, version: 1 },
    { state: { value: 2 }, version: 2 },
  ]);
  assert.equal(version, 3);
  assert.equal(status, 'saved');
  assert(!dirty);
});

test('manual saves cancel the scheduled write rather than producing a duplicate', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let dirty = true,
    calls = 0;
  const saver = createAutosaver({
    isDirty: () => dirty,
    snapshot: () => ({ value: 1 }),
    write: async () => {
      calls++;
      return {};
    },
    onSaved: () => (dirty = false),
    onStatus: () => {},
  });
  saver.schedule();
  await tick(t, 1000);
  await saver.save(true);
  assert.equal(calls, 1);
  await tick(t, 30000);
  assert.equal(calls, 1);
  assert(!dirty);
});

test('a later applied change keeps its debounce deadline while the prior write completes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let state = 1,
    dirty = true,
    resolve;
  const writes = [];
  const saver = createAutosaver({
    isDirty: () => dirty,
    snapshot: () => state,
    write: (sent) => {
      writes.push(sent);
      return writes.length === 1 ? new Promise((r) => (resolve = r)) : Promise.resolve({});
    },
    onSaved: (_, sent) => (dirty = state !== sent),
    onStatus: () => {},
  });
  const first = saver.save();
  await settle();
  state = 2;
  saver.schedule();
  await tick(t, 1000);
  resolve({});
  await first;
  await tick(t, 499);
  assert.equal(writes.length, 1);
  await tick(t, 1);
  assert.deepEqual(writes, [1, 2]);
  assert(!dirty);
});

test('conflicts and expired sessions preserve edits and block scheduled or manual retries', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const code of [409, 401]) {
    let dirty = true,
      calls = 0,
      status,
      message;
    const saver = createAutosaver({
      isDirty: () => dirty,
      snapshot: () => ({ value: 1 }),
      write: async () => {
        calls++;
        throw Object.assign(Error('Reopen before saving'), { status: code });
      },
      onSaved: () => assert.fail(),
      onStatus: (s, error) => {
        status = s;
        message = error?.message;
      },
    });
    saver.schedule();
    await tick(t, 1500);
    assert.equal(status, 'blocked');
    saver.schedule();
    await tick(t, 30000);
    await saver.save(true);
    assert.equal(calls, 1);
    assert(dirty);
    assert.equal(status, 'blocked');
    assert.equal(message, 'Reopen before saving');
  }
});

test('connection failures remain paused after further edits until a manual retry succeeds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let dirty = true,
    calls = 0,
    status;
  const saver = createAutosaver({
    isDirty: () => dirty,
    snapshot: () => ({ state: { value: 1 } }),
    write: async () => {
      if (++calls === 1) throw Error('Offline');
      return { version: 2 };
    },
    onSaved: () => (dirty = false),
    onStatus: (s) => (status = s),
  });
  saver.schedule();
  await tick(t, 1500);
  assert.equal(status, 'error');
  assert(dirty);
  saver.schedule();
  await tick(t, 30000);
  await saver.save();
  assert.equal(calls, 1);
  assert.equal(status, 'error');
  await saver.save(true);
  assert.equal(status, 'saved');
  assert(!dirty);
  await tick(t, 30000);
  assert.equal(calls, 2);
});

test('gateway HTML errors preserve HTTP status and never report a save', async () => {
  await assert.rejects(
    saveCalendarSnapshot(
      '/api/calendars/test',
      {},
      { fetcher: async () => new Response('<html>Gateway timeout</html>', { status: 504 }) },
    ),
    (error) => error.status === 504 && /indisponível/.test(error.message),
  );
  await assert.rejects(
    saveCalendarSnapshot('/api/calendars/test', {}, { fetcher: async () => new Response('{}') }),
    /não confirmou/,
  );
});

test('unresponsive saves time out rather than remaining pending indefinitely', async () => {
  const keepAlive = setTimeout(() => {}, 200);
  try {
    await assert.rejects(
      saveCalendarSnapshot(
        '/api/calendars/test',
        {},
        {
          timeoutMs: 5,
          fetcher: (_url, { signal }) =>
            new Promise((_resolve, reject) =>
              signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
            ),
        },
      ),
      /a tempo/,
    );
  } finally {
    clearTimeout(keepAlive);
  }
});
