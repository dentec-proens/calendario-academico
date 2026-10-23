import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const deploymentVariables = [
  'DENTEC_NATIVE_BROWSER_URL',
  'DENTEC_NATIVE_TEST_EMAIL',
  'DENTEC_NATIVE_TEST_PASSWORD',
] as const;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DENTEC_DISPOSABLE_E2E', '1');
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
    await expect(import('../playwright.e2e.config.ts')).rejects.toThrow(/deployment descartável/);
  },
);

test.each(deploymentVariables)(
  'E2E collection rejects missing or blank %s before launching a browser',
  async (name) => {
    for (const value of [undefined, ' \t ']) {
      vi.stubEnv(name, value);
      vi.resetModules();
      await expect(import('../playwright.e2e.config.ts')).rejects.toThrow(/deployment descartável/);
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
  await expect(import('../playwright.e2e.config.ts')).rejects.toThrow();
});

test('explicit disposable credentials enable isolated E2E collection', async () => {
  const { default: config } = await import('../playwright.e2e.config.ts');
  expect(config.testDir).toBe('./test/e2e');
  expect(config.workers).toBe(1);
});

test('default browser collection stays local even when disposable credentials exist', async () => {
  const { default: config } = await import('../playwright.config.ts');
  expect(config.testDir).toBe('./test/browser');
});
