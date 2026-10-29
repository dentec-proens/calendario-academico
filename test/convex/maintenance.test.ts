import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';
import { api, internal } from '../../convex/_generated/api';
import { convexModules } from '../helpers/convex-modules';
import { createNativeFixture } from '../helpers/native-database';
import { assertWritesOpen } from '../../convex/lib/maintenance';

test('maintenance blocks every account, including ADMIN, until it is resumed', async () => {
  const fixture = await createNativeFixture();
  const { client } = fixture;
  const admin = fixture.asClient('admin');
  const commit = 'c'.repeat(40);
  const record = await admin.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Calendário operacional',
      purpose: 'test',
    },
  });
  const body = {
    version: record.version,
    catalogueRevision: record.catalogueRevision,
    state: record.state,
  };
  await client.mutation(internal.operations.pause, { commit });
  assert.deepEqual(await admin.query(api.operations.availability, {}), { maintenance: true });
  await assert.rejects(
    client.run((ctx) => assertWritesOpen(ctx)),
    /manutenção/,
  );
  await assert.rejects(
    admin.mutation(api.calendars.saveCalendar, { id: record.id, body }),
    /manutenção/,
  );
  await client.mutation(internal.operations.resume, { commit });
  assert.deepEqual(await admin.query(api.operations.availability, {}), { maintenance: false });
  vi.stubEnv('DENTEC_MAINTENANCE', '1');
  assert.deepEqual(await admin.query(api.operations.availability, {}), { maintenance: true });
  await assert.rejects(
    client.run((ctx) => assertWritesOpen(ctx)),
    /manutenção/,
  );
  vi.unstubAllEnvs();
  const saved = await admin.mutation(api.calendars.saveCalendar, { id: record.id, body });
  assert.equal(saved.unchanged, true);
});

afterEach(() => vi.unstubAllEnvs());

test('maintenance admits work atomically and waits for every accepted action before resuming', async () => {
  const client = convexTest(schema, convexModules);
  const commit = 'a'.repeat(40);
  const id = await client.mutation(internal.operations.begin, {
    operation: 'actions.documents.uploadDocument',
  });
  await client.mutation(internal.operations.pause, { commit });
  assert.deepEqual(await client.query(api.operations.availability, {}), { maintenance: true });
  await assert.rejects(
    client.mutation(internal.operations.begin, { operation: 'actions.history.analyzeHistory' }),
    /manutenção/,
  );
  await assert.rejects(
    client.mutation(api.campuses.createCampus, { name: 'Campus' }),
    /manutenção/,
  );
  await assert.rejects(client.mutation(internal.operations.resume, { commit }), /andamento/);
  const status = await client.query(internal.operations.status, {});
  assert.equal(status.commit, commit);
  assert.equal(status.active.length, 1);
  assert.equal(status.active[0].id, id);
  // An arbitrarily old lease remains active; elapsed time is not evidence that
  // the action finished or that its internal handlers can be removed safely.
  await client.run((ctx) => ctx.db.patch(id, { startedAt: 1 }));
  await assert.rejects(client.mutation(internal.operations.resume, { commit }), /andamento/);
  await client.mutation(internal.operations.finish, { id });
  await client.mutation(internal.operations.resume, { commit });
  assert.deepEqual(await client.query(api.operations.availability, {}), { maintenance: false });
});

test('another release cannot take over or unlock a maintenance window', async () => {
  const client = convexTest(schema, convexModules);
  await client.mutation(internal.operations.pause, { commit: 'a'.repeat(40) });
  await assert.rejects(
    client.mutation(internal.operations.pause, { commit: 'b'.repeat(40) }),
    /Outra publicação/,
  );
  await assert.rejects(
    client.mutation(internal.operations.resume, { commit: 'b'.repeat(40) }),
    /não pertence/,
  );
});

test('a rejected action releases its admission lease and maintenance rejects it before work begins', async () => {
  const client = convexTest(schema, convexModules);
  await assert.rejects(
    client.action(api.access.passwordRecovery.requestPasswordRecovery, {
      email: 'user@ifpr.edu.br',
    }),
    /não está configurada/,
  );
  assert.equal((await client.query(internal.operations.status, {})).active.length, 0);
  vi.stubEnv('DENTEC_MAINTENANCE', '1');
  await assert.rejects(
    client.action(api.access.passwordRecovery.requestPasswordRecovery, {
      email: 'user@ifpr.edu.br',
    }),
    /manutenção/,
  );
  assert.equal((await client.query(internal.operations.status, {})).active.length, 0);
});
