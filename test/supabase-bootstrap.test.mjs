import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/database.mjs';

test('active PostgreSQL schema has entity tables and no JSON persistence or anonymous privileges', async (t) => {
  const { pg, store } = await createTestDatabase(t);
  const tables = (
    await pg.query(
      "SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='dentec' AND c.relkind='r'",
    )
  ).rows;
  for (const table of [
    'users',
    'campuses',
    'calendars',
    'calendar_events',
    'calendar_periods',
    'calendar_revisions',
    'sessions',
    'documents',
    'reviews',
    'audit',
  ])
    assert(
      tables.some((row) => row.relname === table),
      table,
    );
  assert(tables.every((row) => row.relrowsecurity));
  const serialized = (
    await pg.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='dentec' AND data_type IN ('json','jsonb')",
    )
  ).rows;
  assert.deepEqual(serialized, []);
  assert.equal(
    (await pg.query("SELECT to_regclass('dentec.app_state') AS legacy")).rows[0].legacy,
    null,
  );
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(
      (await pg.query("SELECT has_schema_privilege($1,'dentec','USAGE') AS allowed", [role]))
        .rows[0].allowed,
      false,
    );
    await pg.exec('SET ROLE ' + role);
    await assert.rejects(pg.query('SELECT * FROM dentec.users'), /permission denied/);
    await pg.exec('RESET ROLE');
  }
  const state = await store.exportState();
  assert.equal(state.users.length, 0);
  assert.equal(state.calendars.length, 0);
  assert(state.campuses.length);
});
