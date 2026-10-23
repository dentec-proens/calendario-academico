import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
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
    trace: 'retain-on-failure',
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
