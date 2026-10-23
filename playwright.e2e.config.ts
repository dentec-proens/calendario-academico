import { defineConfig } from '@playwright/test';
import config from './playwright.config.ts';

const required = [
  'DENTEC_NATIVE_BROWSER_URL',
  'DENTEC_NATIVE_TEST_EMAIL',
  'DENTEC_NATIVE_TEST_PASSWORD',
] as const;
if (
  process.env.DENTEC_DISPOSABLE_E2E !== '1' ||
  required.some((name) => !process.env[name]?.trim())
) {
  throw new Error(
    'Os testes E2E exigem DENTEC_DISPOSABLE_E2E=1, DENTEC_NATIVE_BROWSER_URL, ' +
      'DENTEC_NATIVE_TEST_EMAIL e DENTEC_NATIVE_TEST_PASSWORD de um deployment descartável. ' +
      'Nunca use produção ou um deployment compartilhado.',
  );
}
const target = new URL(process.env.DENTEC_NATIVE_BROWSER_URL!);
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
  throw new Error('DENTEC_NATIVE_BROWSER_URL deve ser uma URL HTTP(S) sem credenciais.');
}

export default defineConfig({
  ...config,
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  projects: [{ name: 'chromium-e2e', use: { viewport: { width: 1440, height: 1000 } } }],
});
