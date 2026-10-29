import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { parseEnv } from 'node:util';
import { serializeE2EEnvironment, validateE2EEnvironment } from '../../scripts/e2e-environment.ts';
import { environments } from '../../config/environments.ts';

const deploymentVariables = [
  'DENTEC_NATIVE_BROWSER_URL',
  'DENTEC_NATIVE_TEST_EMAIL',
  'DENTEC_NATIVE_TEST_PASSWORD',
] as const;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DENTEC_DISPOSABLE_E2E', '1');
  vi.stubEnv('DENTEC_DEVELOPMENT_E2E', undefined);
  vi.stubEnv('DENTEC_NATIVE_BROWSER_URL', 'https://synthetic-e2e.example.com');
  vi.stubEnv('DENTEC_NATIVE_TEST_EMAIL', 'synthetic@example.com');
  vi.stubEnv('DENTEC_NATIVE_TEST_PASSWORD', 'SyntheticDisposable!');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test.each([undefined, '', '0', 'true'])(
  'E2E collection rejects credentials without explicit disposable opt-in (%s)',
  async (optIn) => {
    vi.stubEnv('DENTEC_DISPOSABLE_E2E', optIn);
    await expect(import('../../playwright.e2e.config.ts')).rejects.toThrow(/E2E|descartável/);
  },
);

test.each(deploymentVariables)(
  'E2E collection rejects missing or blank %s before launching a browser',
  async (name) => {
    for (const value of [undefined, ' \t ']) {
      vi.stubEnv(name, value);
      vi.resetModules();
      await expect(import('../../playwright.e2e.config.ts')).rejects.toThrow(/E2E|descartável/);
    }
  },
);

test.each([
  'not a URL',
  'file:///tmp/synthetic-portal.html',
  'javascript:alert(1)',
  'ftp://synthetic-e2e.example.com',
  'https://synthetic:secret@synthetic-e2e.example.com',
  'https://synthetic@synthetic-e2e.example.com',
  'https://:secret@synthetic-e2e.example.com',
])('E2E collection rejects unsafe target %s', async (url) => {
  vi.stubEnv('DENTEC_NATIVE_BROWSER_URL', url);
  await expect(import('../../playwright.e2e.config.ts')).rejects.toThrow();
});

test('explicit disposable credentials enable isolated E2E collection', async () => {
  const { default: config } = await import('../../playwright.e2e.config.ts');
  expect(config.testDir).toBe('./test/e2e');
  expect(config.workers).toBe(1);
  expect(config.fullyParallel).toBe(false);
});

test('default browser collection stays local even when disposable credentials exist', async () => {
  const { default: config } = await import('../../playwright.config.ts');
  expect(config.testDir).toBe('./test/browser');
});

const development = {
  CONVEX_DEPLOYMENT: 'dev:synthetic-development',
  VITE_CONVEX_URL: 'https://synthetic-development.convex.cloud',
  PORT: '4183',
};
const scoped = {
  DENTEC_DEVELOPMENT_E2E: '1',
  DENTEC_NATIVE_BROWSER_URL: 'http://127.0.0.1:4183',
  DENTEC_NATIVE_BACKEND_URL: development.VITE_CONVEX_URL,
  DENTEC_NATIVE_DEPLOYMENT: development.CONVEX_DEPLOYMENT,
  DENTEC_NATIVE_TEST_RUN_ID: 'aabbccddeeff',
  DENTEC_NATIVE_TEST_CAMPUS_ID: 'synthetic-campus',
  DENTEC_NATIVE_TEST_YEAR: '7097',
  DENTEC_NATIVE_TEST_EMAIL: 'e2e-aabbccddeeff@ifpr.edu.br',
  DENTEC_NATIVE_TEST_PASSWORD: 'SyntheticDevelopment!',
};

test('development E2E requires the verified local frontend, deployment and dedicated data scope', () => {
  expect(validateE2EEnvironment(scoped, development).mode).toBe('development');
  for (const change of [
    { DENTEC_NATIVE_BACKEND_URL: environments.production.url },
    { DENTEC_NATIVE_DEPLOYMENT: `prod:${environments.production.deployment}` },
    { DENTEC_NATIVE_BROWSER_URL: environments.production.portalUrl },
    { DENTEC_NATIVE_BROWSER_URL: 'http://127.0.0.1:9999' },
    { DENTEC_NATIVE_BROWSER_URL: 'https://shared.example.com' },
    { DENTEC_NATIVE_TEST_EMAIL: 'existing@ifpr.edu.br' },
    { DENTEC_NATIVE_TEST_RUN_ID: '' },
    { DENTEC_NATIVE_TEST_CAMPUS_ID: '' },
    { DENTEC_NATIVE_TEST_YEAR: '2027' },
    { DENTEC_DISPOSABLE_E2E: '1' },
  ])
    expect(() => validateE2EEnvironment({ ...scoped, ...change }, development)).toThrow();
  expect(() => validateE2EEnvironment(scoped)).toThrow(/conferir/);
});

test('even an explicit disposable opt-in cannot target the known production portal', () => {
  expect(() =>
    validateE2EEnvironment({
      ...scoped,
      DENTEC_DEVELOPMENT_E2E: undefined,
      DENTEC_DISPOSABLE_E2E: '1',
      DENTEC_NATIVE_BROWSER_URL: environments.production.portalUrl,
    }),
  ).toThrow(/produção/);
  expect(() =>
    validateE2EEnvironment(scoped, {
      ...development,
      CONVEX_DEPLOYMENT: `prod:${environments.production.deployment}`,
      VITE_CONVEX_URL: environments.production.url,
    }),
  ).toThrow(/nunca produção/);
});

test('E2E dotenv serialization preserves Windows paths with apostrophes and credential delimiters', () => {
  const values = {
    DENTEC_NATIVE_RESTORE_FIXTURE: String.raw`C:\Users\O'Connor\new-work\test\restoration.json`,
    DENTEC_NATIVE_TEST_PASSWORD: `Synthetic'Password"`,
    DENTEC_NATIVE_BROWSER_URL: 'http://127.0.0.1:4183',
  };
  expect(parseEnv(serializeE2EEnvironment(values))).toEqual(values);
});
