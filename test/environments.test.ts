import type { TestContext } from 'vitest';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { environments } from '../config/environments.ts';
import {
  assertNoTargetOverrides,
  assertProductionTarget,
  readLocalEnvironment,
  readDevEnvironment,
  validateDevEnvironment,
  validateProductionBuild,
} from '../scripts/environment.ts';

const repository = fileURLToPath(new URL('../', import.meta.url));
const oceanic = {
  CONVEX_DEPLOYMENT: 'dev:oceanic-gazelle-652',
  VITE_CONVEX_URL: 'https://oceanic-gazelle-652.convex.cloud',
  VITE_CONVEX_SITE_URL: 'https://oceanic-gazelle-652.convex.site',
  PORT: '4183',
};
const targetKeys = [
  'CONVEX_DEPLOY_KEY',
  'CONVEX_DEPLOYMENT_TOKEN',
  'CONVEX_SELF_HOSTED_URL',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
];

async function directory(t: TestContext) {
  const result = await mkdtemp(join(tmpdir(), 'calendario-environments-'));
  t.onTestFinished(() => rm(result, { recursive: true, force: true }));
  return result;
}

async function localFixture(t: TestContext, values: Record<string, string> = oceanic) {
  const result = await directory(t);
  await writeFile(
    join(result, '.env.local'),
    '# Existing developer configuration\n' +
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') +
      '\n',
    { mode: 0o600 },
  );
  return result;
}

test('development reports a missing local environment without creating or guessing one', async (t) => {
  const path = await directory(t);
  assert.equal(readLocalEnvironment(path), undefined);
  assert.throws(() => readDevEnvironment(path, {}), /Falta \.env\.local.*dev:setup/);
  assert.deepEqual(await readdir(path), []);
});

test('existing Oceanic dev configuration is read without changing its contents, mode or selector', async (t) => {
  const path = await localFixture(t, { ...oceanic, LOCAL_NOTE: 'preserve-this-value' });
  const file = join(path, '.env.local');
  const before = await readFile(file);
  const beforeStat = await stat(file);
  assert.equal(readLocalEnvironment(path)!.LOCAL_NOTE, 'preserve-this-value');
  assert.deepEqual(readDevEnvironment(path, {}), oceanic);
  assert.deepEqual(await readFile(file), before);
  assert.equal((await stat(file)).mode, beforeStat.mode);
  assert.deepEqual(await readdir(path), ['.env.local']);
});

test('each developer may use a different cloud dev and omit the derived site URL', () => {
  const env = Object.freeze({
    CONVEX_DEPLOYMENT: 'dev:individual-developer-123',
    VITE_CONVEX_URL: 'https://individual-developer-123.convex.cloud',
  });
  assert.deepEqual(validateDevEnvironment(env), {
    ...env,
    VITE_CONVEX_SITE_URL: 'https://individual-developer-123.convex.site',
    PORT: '4183',
  });
});

test('development rejects production selectors and cross-wired cloud or site URLs', () => {
  for (const selector of [
    `prod:${environments.production.deployment}`,
    `dev:${environments.production.deployment}`,
    'prod:another-production',
    'oceanic-gazelle-652',
    'dev:INVALID',
    '',
  ]) {
    assert.throws(
      () => validateDevEnvironment({ ...oceanic, CONVEX_DEPLOYMENT: selector }),
      /dev:seu-deployment/,
    );
  }
  for (const urls of [
    { VITE_CONVEX_URL: environments.production.url },
    { VITE_CONVEX_SITE_URL: environments.production.siteUrl },
    { VITE_CONVEX_URL: 'https://other-development.convex.cloud' },
    { VITE_CONVEX_SITE_URL: 'https://other-development.convex.site' },
    { VITE_CONVEX_URL: 'http://oceanic-gazelle-652.convex.cloud' },
    { VITE_CONVEX_URL: undefined },
  ]) {
    assert.throws(() => validateDevEnvironment({ ...oceanic, ...urls }), /mesmo deployment dev/);
  }
});

test('developer ports are validated before use', () => {
  for (const PORT of ['0', '65536', '4183.5', '-1', 'invalid'])
    assert.throws(() => validateDevEnvironment({ ...oceanic, PORT }), /PORT/);
  assert.equal(validateDevEnvironment({ ...oceanic, PORT: '4184' }).PORT, '4184');
});

test('deployment keys and self-hosted selectors cannot override a developer target', async (t) => {
  const path = await localFixture(t);
  for (const key of targetKeys) {
    assert.throws(() => assertNoTargetOverrides({ [key]: 'synthetic-override' }), new RegExp(key));
    assert.throws(() => readDevEnvironment(path, { [key]: 'synthetic-override' }), new RegExp(key));
    const local = await localFixture(t, { ...oceanic, [key]: 'synthetic-local-override' });
    assert.throws(() => readDevEnvironment(local, {}), new RegExp(key));
  }
});

test('shell target conflicts are rejected while a matching target and explicit local port work', async (t) => {
  const path = await localFixture(t);
  for (const [key, value] of Object.entries({
    CONVEX_DEPLOYMENT: `prod:${environments.production.deployment}`,
    VITE_CONVEX_URL: environments.production.url,
    VITE_CONVEX_SITE_URL: environments.production.siteUrl,
  })) {
    assert.throws(() => readDevEnvironment(path, { [key]: value }), /shell diverge/);
  }
  assert.deepEqual(readDevEnvironment(path, { ...oceanic, PORT: '4184' }), {
    ...oceanic,
    PORT: '4184',
  });
});

test('production cloud publication accepts only the known Dentec production URL', () => {
  assert.equal(environments.production.deployment, 'exuberant-cheetah-138');
  assert.equal(environments.production.url, 'https://exuberant-cheetah-138.convex.cloud');
  assert.equal(environments.production.siteUrl, 'https://exuberant-cheetah-138.convex.site');
  assert.equal(environments.production.portalUrl, 'https://calendario-academico-phi.vercel.app');
  assert.doesNotThrow(() => assertProductionTarget(environments.production.url));
  for (const url of [
    undefined,
    '',
    oceanic.VITE_CONVEX_URL,
    `${environments.production.url}/`,
    'https://other-production.convex.cloud',
  ])
    assert.throws(() => assertProductionTarget(url), /publicação exige/);
});

test('Vercel production builds require matching production cloud and site URLs while local and CI builds stay independent', () => {
  const production = {
    VERCEL_ENV: 'production',
    VITE_CONVEX_URL: environments.production.url,
    VITE_CONVEX_SITE_URL: environments.production.siteUrl,
  };
  assert.doesNotThrow(() => validateProductionBuild(production));
  for (const values of [
    { VITE_CONVEX_URL: oceanic.VITE_CONVEX_URL },
    { VITE_CONVEX_SITE_URL: oceanic.VITE_CONVEX_SITE_URL },
    { VITE_CONVEX_URL: undefined },
    { VITE_CONVEX_SITE_URL: undefined },
  ])
    assert.throws(() => validateProductionBuild({ ...production, ...values }));
  assert.doesNotThrow(() => validateProductionBuild({}));
  assert.doesNotThrow(() => validateProductionBuild({ CI: 'true' }));
  assert.doesNotThrow(() => validateProductionBuild({ ...oceanic, VERCEL_ENV: 'development' }));
});

const trapPreload = `
import cp from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const reject = (name) => () => {
  appendFileSync(process.env.DENTEC_TOOL_TEST_TRAP_LOG, name + '\\n');
  throw Error('Unexpected command or network access: ' + name);
};
for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork']) cp[name] = reject(name);
for (const module of [http, https]) for (const name of ['request', 'get']) module[name] = reject(name);
for (const name of ['connect', 'createConnection']) net[name] = reject(name);
tls.connect = reject('tls.connect');
globalThis.fetch = reject('fetch');
syncBuiltinESMExports();
`;

async function childFixture(t: TestContext) {
  const path = await localFixture(t);
  await mkdir(join(path, 'scripts'));
  await mkdir(join(path, 'config'));
  await writeFile(join(path, 'package.json'), '{"type":"module"}\n');
  await copyFile(join(repository, 'config/environments.ts'), join(path, 'config/environments.ts'));
  for (const name of [
    'environment.ts',
    'doctor.ts',
    'deploy-production.ts',
    'assert-production-target.ts',
  ])
    await copyFile(join(repository, 'scripts', name), join(path, 'scripts', name));
  const preload = join(path, 'no-effects.mjs');
  await writeFile(preload, trapPreload);
  const log = join(path, 'unexpected-effects.log');
  const env: NodeJS.ProcessEnv = { ...process.env, DENTEC_TOOL_TEST_TRAP_LOG: log };
  for (const key of Object.keys(env))
    if (/^(CONVEX_|VITE_)/.test(key) || key === 'NODE_OPTIONS' || key === 'npm_execpath')
      delete env[key];
  const run = (file: string, args: string[] = [], overrides: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, ['--import', preload, join(path, 'scripts', file), ...args], {
      cwd: path,
      env: { ...env, ...overrides },
      encoding: 'utf8',
      timeout: 15_000,
    });
  const noEffects = async () => assert.rejects(readFile(log), { code: 'ENOENT' });
  return { path, run, noEffects };
}

test('doctor runs entirely from a local dev file without commands, network or configuration changes', async (t) => {
  const fixture = await childFixture(t);
  const file = join(fixture.path, '.env.local');
  const before = await readFile(file);
  const result = fixture.run('doctor.ts');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dev individual: dev:oceanic-gazelle-652/);
  assert.match(result.stdout, /Nenhuma conexão ou alteração remota/);
  await fixture.noEffects();
  assert.deepEqual(await readFile(file), before);
});

test('production dry run executes no child command or network request and leaves the environment untouched', async (t) => {
  const fixture = await childFixture(t);
  const before = await readFile(join(fixture.path, '.env.local'));
  const result = fixture.run('deploy-production.ts', ['--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Simulação: nenhum comando/);
  assert.match(result.stdout, /exuberant-cheetah-138/);
  await fixture.noEffects();
  assert.deepEqual(await readFile(join(fixture.path, '.env.local')), before);
  assert.deepEqual((await readdir(fixture.path)).sort(), [
    '.env.local',
    'config',
    'no-effects.mjs',
    'package.json',
    'scripts',
  ]);
});

test('unknown or repeated release arguments are rejected before any command or network access', async (t) => {
  const fixture = await childFixture(t);
  for (const args of [['--unknown'], ['--dry-run', '--unknown'], ['--dry-run', '--dry-run']]) {
    const result = fixture.run('deploy-production.ts', args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Uso: pnpm deploy:production/);
  }
  await fixture.noEffects();
});

test('the Convex pre-publication hook rejects a wrong resolved deployment URL without remote effects', async (t) => {
  const fixture = await childFixture(t);
  const valid = fixture.run('assert-production-target.ts', [], {
    DENTEC_DEPLOYMENT_URL: environments.production.url,
  });
  assert.equal(valid.status, 0, valid.stderr);
  const invalid = fixture.run('assert-production-target.ts', [], {
    DENTEC_DEPLOYMENT_URL: oceanic.VITE_CONVEX_URL,
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /publicação exige/);
  await fixture.noEffects();
});
