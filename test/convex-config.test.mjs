import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { convexRuntimeConfiguration, persistenceBackend } from '../src/convex-config.mjs';

const development = {
  DENTEC_BACKEND: 'convex',
  CONVEX_URL: 'https://fixture.convex.cloud',
  DENTEC_CONVEX_BRIDGE_SECRET: 'x'.repeat(32),
};

test('the Convex experiment is explicit and rejects unknown persistence backends', () => {
  assert.equal(persistenceBackend({}), 'postgres');
  assert.equal(persistenceBackend(development), 'convex');
  assert.throws(() => persistenceBackend({ DENTEC_BACKEND: 'typo' }), {
    code: 'DENTEC_CONFIG',
  });
});

test('Convex local configuration uses its own deployment and port without SQL or Supabase', () => {
  const config = convexRuntimeConfiguration(development);
  assert.equal(config.backend, 'convex');
  assert.equal(config.convexUrl, development.CONVEX_URL);
  assert.equal(config.bridgeSecret, development.DENTEC_CONVEX_BRIDGE_SECRET);
  assert.equal(config.port, 4183);
  assert.equal(config.publicOrigin, 'http://127.0.0.1:4183');
  assert.equal(config.setupCode, undefined);
  assert.equal(config.setupEmail, undefined);
  assert.equal(config.production, false);
  assert.equal(config.hosted, false);
  assert.equal('connectionString' in config, false);
  assert.equal('storage' in config, false);
  assert.equal(
    convexRuntimeConfiguration({ ...development, PORT: '4184' }).publicOrigin,
    'http://127.0.0.1:4184',
  );
});

test('Convex configuration requires a deployment URL and a server bridge secret', () => {
  for (const missing of ['CONVEX_URL', 'DENTEC_CONVEX_BRIDGE_SECRET'])
    assert.throws(() => convexRuntimeConfiguration({ ...development, [missing]: '' }), {
      code: 'DENTEC_CONFIG',
    });
  assert.throws(
    () => convexRuntimeConfiguration({ ...development, DENTEC_CONVEX_BRIDGE_SECRET: 'too-short' }),
    /DENTEC_CONVEX_BRIDGE_SECRET/,
  );
  for (const port of ['0', '65536', 'text', '4183.5'])
    assert.throws(() => convexRuntimeConfiguration({ ...development, PORT: port }), /PORT/);
});

test('Convex URLs reject credential leaks, paths and insecure remote endpoints', () => {
  for (const field of ['CONVEX_URL', 'DENTEC_PUBLIC_URL']) {
    for (const url of [
      'invalid-sensitive-password',
      'https://sensitive-password@fixture.convex.cloud',
      'http://fixture.convex.cloud',
      'https://fixture.convex.cloud/path',
      'https://fixture.convex.cloud/?secret=sensitive-password',
    ])
      assert.throws(
        () => convexRuntimeConfiguration({ ...development, [field]: url }),
        (error) => error.code === 'DENTEC_CONFIG' && !error.message.includes('sensitive-password'),
      );
  }
  assert.equal(
    convexRuntimeConfiguration({ ...development, CONVEX_URL: 'http://127.0.0.1:3210' }).convexUrl,
    'http://127.0.0.1:3210',
  );
});

test('Convex production retains HTTPS and installation identity requirements', () => {
  const deployed = {
    ...development,
    VERCEL: '1',
    VERCEL_URL: 'calendar.example.test',
    DENTEC_SETUP_EMAIL: 'Admin@IFPR.edu.br',
    DENTEC_SETUP_CODE: 'y'.repeat(32),
  };
  const config = convexRuntimeConfiguration(deployed);
  assert.equal(config.setupEmail, 'admin@ifpr.edu.br');
  assert.equal(config.publicOrigin, 'https://calendar.example.test');
  assert.equal(config.production, true);
  for (const missing of ['DENTEC_SETUP_EMAIL', 'DENTEC_SETUP_CODE'])
    assert.throws(() => convexRuntimeConfiguration({ ...deployed, [missing]: '' }), {
      code: 'DENTEC_CONFIG',
    });
  assert.throws(
    () => convexRuntimeConfiguration({ ...deployed, CONVEX_URL: 'http://localhost:3210' }),
    /CONVEX_URL/,
  );
  assert.throws(
    () =>
      convexRuntimeConfiguration({
        ...development,
        NODE_ENV: 'production',
        DENTEC_SETUP_EMAIL: deployed.DENTEC_SETUP_EMAIL,
        DENTEC_SETUP_CODE: deployed.DENTEC_SETUP_CODE,
      }),
    /DENTEC_PUBLIC_URL/,
  );
});

test('Convex startup fails at its own configuration without opening PostgreSQL', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../server.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        DENTEC_BACKEND: 'convex',
        CONVEX_URL: development.CONVEX_URL,
        DENTEC_CONVEX_BRIDGE_SECRET: '',
        POSTGRES_URL: 'postgresql://sensitive-password@invalid.example.test/dentec',
        DATABASE_URL: '',
        VERCEL: '0',
        NODE_ENV: 'development',
      },
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /DENTEC_CONFIG/);
  assert.match(result.stderr, /DENTEC_CONVEX_BRIDGE_SECRET/);
  assert.doesNotMatch(result.stderr + result.stdout, /sensitive-password|DENTEC_DB_TRANSPORT/);
  assert.doesNotMatch(result.stdout, /abra http/);
});
