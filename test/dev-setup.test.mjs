import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { tsImport } from 'tsx/esm/api';
import { environments } from '../config/environments.ts';
import { generateAuthKeys, validateAuthKeys } from '../scripts/dev-setup.ts';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';
import { initialCatalogue } from '../src/institution.mjs';

const schema = await tsImport('../convex/schema.ts', import.meta.url);
const { entityTables } = await tsImport('../convex/model.ts', import.meta.url);
const devUrl = 'https://isolated-setup-test.convex.cloud';
const ref = (name) => makeFunctionReference(name);
const initialize = (client, expectedCloudUrl = devUrl) =>
  client.mutation(ref('devSetup:initialize'), { expectedCloudUrl });

function fixture(t) {
  const previousUrl = process.env.CONVEX_CLOUD_URL;
  process.env.CONVEX_CLOUD_URL = devUrl;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.CONVEX_CLOUD_URL;
    else process.env.CONVEX_CLOUD_URL = previousUrl;
  });
  return convexTest(schema.default, {
    '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
    '../convex/devSetup.ts': () => tsImport('../convex/devSetup.ts', import.meta.url),
    '../convex/native.ts': () => tsImport('../convex/native.ts', import.meta.url),
    '../convex/nativeAuth.ts': () => tsImport('../convex/nativeAuth.ts', import.meta.url),
    '../convex/auth.ts': () => tsImport('../convex/auth.ts', import.meta.url),
  });
}

const snapshot = (client) =>
  client.run(async (ctx) => {
    const state = {};
    for (const table of Object.keys(schema.default.tables))
      state[table] = await ctx.db.query(table).collect();
    state._storage = await ctx.db.system.query('_storage').collect();
    return state;
  });

test('dev Auth key generation survives dotenv round trips and detects broken or mismatched existing keys', () => {
  const keys = generateAuthKeys();
  assert.doesNotThrow(() => validateAuthKeys(keys));
  const dotenv = Object.entries(keys)
    .map(([name, value]) => `${name}='${value}'`)
    .join('\n');
  assert.deepEqual(parseEnv(dotenv), keys);
  assert.doesNotThrow(() => validateAuthKeys(parseEnv(dotenv)));
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
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  assert.deepEqual(await initialize(client), { initialized: true, setupRequired: true });
  const seeded = await snapshot(client);
  assert.deepEqual(
    seeded.rootFields.map((row) => row.name).sort(),
    [...entityTables, 'catalogue'].sort(),
  );
  assert.equal(seeded.campuses.length, 29);
  assert.equal(new Set(seeded.campuses.map((row) => decodeValue(row.value).id)).size, 29);
  assert.deepEqual(
    decodeValue(seeded.rootFields.find((row) => row.name === 'catalogue').value),
    initialCatalogue(),
  );
  assert.equal(seeded.users.length, 0);
  assert.equal(seeded.authAccounts.length, 0);
  assert.equal(seeded.calendars.length, 0);
  assert.deepEqual(await initialize(client), { initialized: false, setupRequired: true });
  assert.deepEqual(await snapshot(client), seeded);

  await client.action(ref('nativeAuth:setup'), {
    data: {
      name: 'Dev sintético',
      code: values.DENTEC_SETUP_CODE,
      email: 'developer-setup@ifpr.edu.br',
      password: 'isolated-development-password',
    },
  });
  const signedIn = await client.action(ref('auth:signIn'), {
    provider: 'password',
    params: {
      flow: 'signIn',
      email: 'developer-setup@ifpr.edu.br',
      password: 'isolated-development-password',
    },
  });
  const payload = JSON.parse(
    Buffer.from(signedIn.tokens.token.split('.')[1], 'base64url').toString(),
  );
  const admin = client.withIdentity({ subject: payload.sub });
  const bootstrap = await admin.query(ref('native:read'), { path: '/api/bootstrap' });
  assert.equal(bootstrap.user.role, 'ADMIN');
  assert.equal(bootstrap.campuses.length, 29);
  assert.equal(bootstrap.users.length, 1);
  assert.deepEqual(bootstrap.calendars, []);
  assert.deepEqual(bootstrap.catalogue, initialCatalogue());
  const calendar = await admin.mutation(ref('native:write'), {
    path: '/api/calendars',
    method: 'POST',
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
  assert.equal(
    (await admin.query(ref('native:read'), { path: '/api/bootstrap' })).calendars.length,
    1,
  );
  const populated = await snapshot(client);
  assert.deepEqual(await initialize(client), { initialized: false, setupRequired: false });
  assert.deepEqual(await snapshot(client), populated);
  await assert.rejects(
    client.action(ref('nativeAuth:setup'), {
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
  const partials = [
    (ctx) =>
      ctx.db.insert('rootFields', {
        name: 'catalogue',
        value: encodeValue({ revision: 34, events: [] }),
      }),
    (ctx) => ctx.db.insert('calendarSnapshots', { value: encodeValue({ original: true }) }),
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
