import { test } from 'vitest';
import assert from 'node:assert/strict';
import { api } from '../convex/_generated/api.js';
import { createNativeFixture } from './helpers/native-database.ts';

test('historical versions are available by native calendar ID, paginated and campus scoped', async () => {
  const { as, asClient, client: database } = await createNativeFixture();
  const campus = as('campus-a');
  const created = await campus.write('/api/calendars', {
    campusId: 'a',
    year: 2027,
    modalities: ['integrado'],
    regime: 'anual',
    courses: 'Curso',
    purpose: 'test',
  });
  for (let version = 1; version <= 3; version++) {
    const record = await campus.read('/api/calendars/' + created.id);
    await campus.write(
      '/api/calendars/' + created.id,
      {
        version,
        catalogueRevision: record.currentCatalogueRevision,
        state: { ...record.state, weekEvidence: 'Registro ' + version },
      },
      'PUT',
    );
  }
  const client = asClient('campus-a');
  await database.run((ctx) =>
    ctx.db.insert('calendarAliases', { alias: 'original-editor-uuid', calendarId: created.id }),
  );
  assert.equal(
    await client.query(api.native.resolveCalendarId, { reference: 'original-editor-uuid' }),
    created.id,
  );
  assert.equal(
    await client.query(api.native.resolveCalendarId, { reference: created.id }),
    created.id,
  );
  await assert.rejects(
    asClient('campus-b').query(api.native.resolveCalendarId, { reference: 'original-editor-uuid' }),
    /Registro não encontrado/,
  );
  const first = await client.query(api.native.calendarHistory, {
    id: created.id,
    paginationOpts: { numItems: 2, cursor: null },
  });
  assert.deepEqual(
    first.page.map((row) => row.version),
    [3, 2],
  );
  const last = await client.query(api.native.calendarHistory, {
    id: created.id,
    paginationOpts: { numItems: 2, cursor: first.continueCursor },
  });
  assert.deepEqual(
    last.page.map((row) => row.version),
    [1],
  );
  assert.equal(last.isDone, true);
  const initial = await client.query(api.native.calendarVersion, { id: created.id, version: 1 });
  assert.equal(initial.state.weekEvidence, '');
  const second = await client.query(api.native.calendarVersion, { id: created.id, version: 2 });
  assert.equal(second.state.weekEvidence, 'Registro 1');
  await assert.rejects(
    asClient('campus-b').query(api.native.calendarVersion, { id: created.id, version: 1 }),
    /Registro não encontrado/,
  );
  await assert.rejects(
    client.query(api.native.calendarHistory, {
      id: created.id,
      paginationOpts: { numItems: 500, cursor: null },
    }),
    /até 100/,
  );
});
