import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/database.mjs';

test('relational reads scope calendars and credentials while ordinary requests omit full revision bodies', async (t) => {
  const { store, pg } = await createTestDatabase(t);
  const { campuses } = await store.read({ fields: ['campuses'] });
  const snapshot = {
    version: 1,
    at: '2026-10-22T00:00:00.000Z',
    state: { year: 2027, offer: 'integrado', events: [], description: 'x'.repeat(20000) },
    unknown: { preserve: true },
  };
  await store.change((db) => {
    db.users.push({
      id: 'one',
      name: 'One',
      email: 'one@ifpr.edu.br',
      active: true,
      role: 'CAMPUS',
      campusId: campuses[0].id,
    });
    db.users.push({
      id: 'two',
      name: 'Two',
      email: 'two@ifpr.edu.br',
      active: true,
      role: 'CAMPUS',
      campusId: campuses[1].id,
    });
    db.sessions = [
      { id: 'hash-one', userId: 'one', expires: 9999999999999 },
      { id: 'hash-two', userId: 'two', expires: 9999999999999 },
    ];
    db.calendars = [1, 2].map((n, i) => ({
      id: 'c' + n,
      campusId: campuses[i].id,
      name: 'Calendar ' + n,
      version: 2,
      state: {
        year: 2027,
        campus: campuses[i].name,
        offer: 'integrado',
        modalities: ['integrado'],
        periods: [],
        events: [],
      },
      versions: [structuredClone(snapshot)],
    }));
  });
  const scoped = await store.read({
    fields: ['calendars'],
    calendarId: 'c1',
    campusId: campuses[0].id,
  });
  assert.equal(scoped.calendars.length, 1);
  assert.equal(scoped.users, undefined);
  assert.equal(scoped.calendars[0].versions[0].state, undefined);
  assert.equal(
    (await store.read({ fields: ['calendars'], calendarId: 'c1', campusId: campuses[1].id }))
      .calendars.length,
    0,
  );
  assert.deepEqual(
    (await store.read({ fields: ['sessions'], sessionHash: 'hash-one' })).sessions.map(
      (row) => row.userId,
    ),
    ['one'],
  );
  assert.equal((await store.read({ fields: ['users'], email: "' OR true --" })).users.length, 0);
  const full = await store.exportState();
  assert.deepEqual(full.calendars[0].versions, [snapshot]);
  await store.change(
    (db) => {
      db.calendars[0].state.events.push({
        id: 'event',
        name: 'New',
        start: '2027-03-01',
        end: '2027-03-01',
        kind: 'note',
        evidence: 'Test',
      });
      db.calendars[0].version++;
    },
    { fields: ['calendars'], calendarId: 'c2' },
  );
  const saved = await store.exportState();
  assert.deepEqual(saved.calendars[0], full.calendars[0]);
  assert.equal(saved.calendars[1].state.events.length, 1);
  assert.equal(
    (await pg.query('SELECT count(*)::integer AS n FROM dentec.calendar_events')).rows[0].n,
    1,
  );
  assert.equal(
    (await pg.query('SELECT count(*)::integer AS n FROM dentec.calendar_revisions')).rows[0].n,
    2,
  );
  await assert.rejects(
    store.change(
      (db) => {
        db.calendars[0].versions = [];
      },
      { fields: ['calendars'], calendarId: 'c1' },
    ),
    /histórico/,
  );
  assert.deepEqual((await store.exportState()).calendars[0].versions, [snapshot]);
});
