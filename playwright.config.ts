import { defineConfig } from '@playwright/test';
import { availableParallelism } from 'node:os';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: Math.min(4, availableParallelism()),
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: process.env.DENTEC_TEST_OUTPUT_DIR ?? 'test-results',
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFilePath}/{projectName}/{platform}/{arg}{ext}',
  updateSnapshots: 'none',
  use: {
    browserName: 'chromium',
    headless: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/*.visual.spec.ts',
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'chromium-desktop',
      testMatch: '**/*.visual.spec.ts',
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'chromium-mobile',
      testMatch: '**/*.visual.spec.ts',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
