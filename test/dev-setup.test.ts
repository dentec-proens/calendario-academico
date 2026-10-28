import { convexModules } from './helpers/convex-modules.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { convexTest } from 'convex-test';
import type { TestContext } from 'vitest';
import type { Doc, TableNames } from '../convex/_generated/dataModel';
import { api, internal } from '../convex/_generated/api.js';
import { environments } from '../config/environments.ts';
import { generateAuthKeys, validateAuthKeys } from '../scripts/dev-setup.ts';
import { initialCatalogue } from '../src/institution.ts';
import {
  chromiumArchives,
  chromiumVersion,
  type ChromiumManifest,
} from '../src/printing/chromium-manifest.ts';

const { default: schema } = await import('../convex/schema.ts');
const devUrl = 'https://isolated-setup-test.convex.cloud';
const initialize = (client: ReturnType<typeof fixture>, expectedCloudUrl = devUrl) =>
  client.mutation(internal.devSetup.initialize, { expectedCloudUrl });

function fixture(t: TestContext) {
  const previousUrl = process.env.CONVEX_CLOUD_URL;
  process.env.CONVEX_CLOUD_URL = devUrl;
  t.onTestFinished(() => {
    if (previousUrl === undefined) delete process.env.CONVEX_CLOUD_URL;
    else process.env.CONVEX_CLOUD_URL = previousUrl;
  });
  return convexTest(schema, convexModules);
}

const snapshot = (client: ReturnType<typeof fixture>) =>
  client.run(async (ctx) => {
    const entries = await Promise.all(
      (Object.keys(schema.tables) as TableNames[]).map(
        async (table) => [table, await ctx.db.query(table).collect()] as const,
      ),
    );
    const tables = Object.fromEntries(entries) as { [T in TableNames]: Doc<T>[] };
    return { ...tables, _storage: await ctx.db.system.query('_storage').collect() };
  });

test('operational Chromium resources do not prevent initialization while other stored files remain protected', async (t) => {
  const client = fixture(t);
  const previous = process.env.DENTEC_CHROMIUM_RUNTIME;
  t.onTestFinished(() => {
    if (previous === undefined) delete process.env.DENTEC_CHROMIUM_RUNTIME;
    else process.env.DENTEC_CHROMIUM_RUNTIME = previous;
  });
  const manifest: ChromiumManifest = {
    version: chromiumVersion,
    architectures: {
      x64: {} as ChromiumManifest['architectures']['x64'],
      arm64: {} as ChromiumManifest['architectures']['arm64'],
    },
  };
  await client.run(async (ctx) => {
    for (const arch of ['x64', 'arm64'] as const)
      for (const name of chromiumArchives) {
        const storageId = await ctx.storage.store(
          new Blob([`${arch}/${name}`], { type: 'application/gzip' }),
        );
        const metadata = (await ctx.db.system.get(storageId))!;
        manifest.architectures[arch][name] = {
          storageId,
          size: metadata.size,
          sha256: Buffer.from(metadata.sha256, 'base64').toString('hex'),
        };
      }
  });
  process.env.DENTEC_CHROMIUM_RUNTIME = JSON.stringify(manifest);
  const userFile = await client.run((ctx) =>
    ctx.storage.store(new Blob(['documento da aplicação'])),
  );
  assert.deepEqual(await initialize(client), { initialized: false, setupRequired: true });
  await client.run((ctx) => ctx.storage.delete(userFile));
  assert.deepEqual(await initialize(client), { initialized: true, setupRequired: true });
  assert.equal((await snapshot(client))._storage.length, 8);
});

test('dev Auth key generation survives dotenv round trips and detects broken or mismatched existing keys', () => {
  const keys = generateAuthKeys();
  assert.doesNotThrow(() => validateAuthKeys(keys));
  const dotenv = Object.entries(keys)
    .map(([name, value]) => `${name}='${value}'`)
    .join('\n');
  assert.deepEqual(parseEnv(dotenv), keys);
  const parsed = parseEnv(dotenv);
  assert(parsed.JWT_PRIVATE_KEY && parsed.JWKS);
  assert.doesNotThrow(() =>
    validateAuthKeys({ JWT_PRIVATE_KEY: parsed.JWT_PRIVATE_KEY!, JWKS: parsed.JWKS! }),
  );
  assert.throws(
    () => validateAuthKeys({ ...keys, JWKS: JSON.stringify(keys.JWKS) }),
    /não formam um par/,
  );
  assert.throws(
    () => validateAuthKeys({ ...keys, JWKS: generateAuthKeys().JWKS }),
    /não formam um par/,
  );
  const publicJwks = JSON.parse(keys.JWKS);
  publicJwks.keys[0].p = 'synthetic-private-RSA-factor';
  assert.throws(
    () => validateAuthKeys({ ...keys, JWKS: JSON.stringify(publicJwks) }),
    /não formam um par/,
  );
  const mixedJwks = JSON.parse(keys.JWKS);
  mixedJwks.keys.push(publicJwks.keys[0]);
  assert.throws(
    () => validateAuthKeys({ ...keys, JWKS: JSON.stringify(mixedJwks) }),
    /não formam um par/,
  );
});

test('empty dev initializes coherent collections, supports first ADMIN and creates a native calendar', async (t) => {
  const client = fixture(t);
  const values = {
    ...generateAuthKeys(),
    CONVEX_SITE_URL: devUrl.replace('.cloud', '.site'),
    SITE_URL: 'http://127.0.0.1:4183',
    DENTEC_SETUP_CODE: 'isolated-development-setup-code',
  };
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.onTestFinished(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  assert.deepEqual(await initialize(client), { initialized: true, setupRequired: true });
  const seeded = await snapshot(client);
  assert.equal(seeded.campuses.length, 29);
  assert.equal(new Set(seeded.campuses.map((row) => row._id)).size, 29);
  assert.equal(new Set(seeded.campuses.map((row) => row.name)).size, 29);
  assert.deepEqual(
    seeded.institutionSettings.map(({ key, revision }) => ({ key, revision })),
    [{ key: 'catalogue', revision: 1 }],
  );
  assert.deepEqual(
    seeded.catalogueRevisions.map(({ year, revision }) => ({ year, revision })),
    [{ year: 2027, revision: 1 }],
  );
  assert.deepEqual(
    {
      revision: seeded.catalogueRevisions[0].revision,
      events: seeded.institutionalEvents.map(
        ({ _id, _creationTime, code: id, year: _year, modalities, ...event }) => ({
          id,
          ...event,
          modalities,
        }),
      ),
    },
    initialCatalogue(),
  );
  assert.equal(seeded.users.length, 0);
  assert.equal(seeded.authAccounts.length, 0);
  assert.equal(seeded.calendars.length, 0);
  assert.deepEqual(await initialize(client), { initialized: false, setupRequired: true });
  assert.deepEqual(await snapshot(client), seeded);

  await client.action(api.access.setup.setup, {
    data: {
      name: 'Dev sintético',
      code: values.DENTEC_SETUP_CODE,
      email: 'developer-setup@ifpr.edu.br',
      password: 'isolated-development-password',
    },
  });
  const signedIn = await client.action(api.auth.signIn, {
    provider: 'password',
    params: {
      flow: 'signIn',
      email: 'developer-setup@ifpr.edu.br',
      password: 'isolated-development-password',
    },
  });
  assert(signedIn.tokens);
  const payload = JSON.parse(
    Buffer.from(signedIn.tokens.token.split('.')[1], 'base64url').toString(),
  );
  const admin = client.withIdentity({ subject: payload.sub });
  const bootstrap = await admin.query(api.workspace.bootstrap, {});
  assert.equal(bootstrap.user.role, 'ADMIN');
  assert.equal(bootstrap.campuses.length, 29);
  assert.equal(bootstrap.users.length, 1);
  assert.deepEqual(bootstrap.calendars, []);
  assert.deepEqual(bootstrap.catalogue, initialCatalogue());
  const calendar = await admin.mutation(api.calendars.createCalendar, {
    body: {
      campusId: bootstrap.campuses[0].id,
      year: 2027,
      modalities: ['integrado'],
      regime: 'anual',
      courses: 'Curso sintético',
      purpose: 'test',
    },
  });
  assert.ok(calendar.id);
  assert.equal((await admin.query(api.workspace.bootstrap, {})).calendars.length, 1);
  const populated = await snapshot(client);
  assert.deepEqual(await initialize(client), { initialized: false, setupRequired: false });
  assert.deepEqual(await snapshot(client), populated);
  await assert.rejects(
    client.action(api.access.setup.setup, {
      data: {
        name: 'Outro',
        code: values.DENTEC_SETUP_CODE,
        email: 'other-setup@ifpr.edu.br',
        password: 'isolated-development-password',
      },
    }),
    /ADMIN já criada/,
  );
});

test('dev setup preserves every partial dataset, including isolated snapshots, Auth state and Storage', async (t) => {
  const partials: ((
    ctx: Parameters<Parameters<ReturnType<typeof fixture>['run']>[0]>[0],
  ) => Promise<unknown>)[] = [
    (ctx) => ctx.db.insert('institutionSettings', { key: 'catalogue', revision: 34 }),
    (ctx) =>
      ctx.db.insert('calendarSnapshots', {
        state: {
          schemaVersion: 2,
          year: 2027,
          campus: 'Snapshot original',
          modalities: ['integrado'],
          offer: 'integrado',
          regime: 'anual',
          weekdays: [1, 2, 3, 4, 5],
          weekConfirmed: false,
          periods: [],
          events: [],
          assessmentStagesByModality: {},
        },
        at: 1,
        catalogueRevision: 34,
        institutionalEvents: [],
        documentSnapshot: [],
      }),
    (ctx) =>
      ctx.db.insert('authRateLimits', {
        identifier: 'synthetic',
        lastAttemptTime: 1,
        attemptsLeft: 3,
      }),
    (ctx) => ctx.storage.store(new Blob(['existing development PDF'], { type: 'application/pdf' })),
  ];
  for (const insert of partials) {
    const client = fixture(t);
    await client.run(insert);
    const before = await snapshot(client);
    assert.deepEqual(await initialize(client), { initialized: false, setupRequired: true });
    assert.deepEqual(await snapshot(client), before);
  }
});

test('dev initialization rejects production and URL mismatch before writing any data', async (t) => {
  const client = fixture(t);
  for (const [actual, expected] of [
    [environments.production.url, environments.production.url],
    [environments.production.url, devUrl],
    [devUrl, environments.production.url],
    [devUrl, 'https://other-development.convex.cloud'],
    [undefined, devUrl],
    [devUrl, 'http://127.0.0.1:4183'],
  ]) {
    if (actual === undefined) delete process.env.CONVEX_CLOUD_URL;
    else process.env.CONVEX_CLOUD_URL = actual;
    await assert.rejects(initialize(client, expected), /mesmo deployment dev validado/);
    const current = await snapshot(client);
    assert(Object.values(current).every((rows) => rows.length === 0));
  }
});
