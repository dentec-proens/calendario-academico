import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { convexModules } from '../helpers/convex-modules';
import { passwordCrypto } from '../../convex/authCrypto';
import { environments } from '../../config/environments';

afterEach(() => vi.unstubAllEnvs());
const expectedCloudUrl = 'https://synthetic-e2e-development.convex.cloud';
const runId = 'aabbccddeeff';
const secret = await passwordCrypto.hashSecret('SyntheticE2EPassword!');

test('E2E preparation refuses production and mismatched deployments before writing any row', async () => {
  const client = convexTest(schema, convexModules);
  for (const actual of [environments.production.url, 'https://another-development.convex.cloud']) {
    vi.stubEnv('CONVEX_CLOUD_URL', actual);
    await assert.rejects(
      client.mutation(internal.devSetup.prepareE2E, {
        expectedCloudUrl,
        runId,
        secret,
        preferredYear: 7000,
      }),
      /nunca produção/,
    );
  }
  await client.run(async (ctx) => {
    for (const table of ['users', 'campuses', 'calendars', 'documents'] as const)
      assert.equal((await ctx.db.query(table).collect()).length, 0);
  });
});

test('E2E reserves its own year/campus/account and publishing its fixture preserves preexisting catalogue and documents', async () => {
  vi.stubEnv('CONVEX_CLOUD_URL', expectedCloudUrl);
  const client = convexTest(schema, convexModules);
  const prior = await client.run(async (ctx) => {
    const campusId = await ctx.db.insert('campuses', {
      name: 'Unidade existente',
      archived: false,
    });
    const userId = await ctx.db.insert('users', {
      name: 'Admin existente',
      email: 'existing@ifpr.edu.br',
      active: true,
      role: 'ADMIN',
      loginMethod: 'local',
    });
    const calendarId = await ctx.db.insert('calendars', {
      campusId,
      year: 7001,
      offerKinds: ['integrado'],
      status: 'rascunho' as const,
      statusRevision: 0,
      courses: 'Existente',
      classes: '',
      shifts: '',
      version: 9,
      updatedAt: 1,
    });
    const eventId = await ctx.db.insert('institutionalEvents', {
      code: 'existing',
      year: 7002,
      name: 'Evento existente',
      start: '7002-01-01',
      end: '7002-01-01',
      effect: 'note',
      category: 'outro',
      evidence: 'Fonte existente',
      modalities: ['integrado'],
      active: true,
    });
    await ctx.db.insert('institutionSettings', { key: 'catalogue', revision: 7 });
    return {
      campus: await ctx.db.get(campusId),
      user: await ctx.db.get(userId),
      calendar: await ctx.db.get(calendarId),
      event: await ctx.db.get(eventId),
    };
  });
  const prepared = await client.mutation(internal.devSetup.prepareE2E, {
    expectedCloudUrl,
    runId,
    secret,
    preferredYear: 7001,
  });
  assert.equal(prepared.year, 7003);
  assert.notEqual(prepared.campusId, prior.campus!._id);
  assert.notEqual(prepared.userId, prior.user!._id);
  await client.run(async (ctx) => {
    for (const row of Object.values(prior)) assert.deepEqual(await ctx.db.get(row!._id), row);
    assert.equal(
      await ctx.db
        .query('calendars')
        .withIndex('by_campusId_and_year_and_status', (q) =>
          q.eq('campusId', prepared.campusId).eq('year', prepared.year),
        )
        .first(),
      null,
    );
  });
});
