import { defineConfig } from '@playwright/test';
import { availableParallelism } from 'node:os';

// Measured: repeated runs differ by at most 0.006 per pixel, while a subtle token swap such as
// #172b25 -> #1d2328 differs by 0.023; the default 0.2 let whole palette changes pass. The
// full-page activity capture compares through toMatchSnapshot, so both share the tolerance;
// see docs/verificacao.md.
const screenshotTolerance = { threshold: 0.01, maxDiffPixels: 10 };

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      ...screenshotTolerance,
    },
    toMatchSnapshot: screenshotTolerance,
  },
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  // Measured: each worker runs Chromium plus a Vite server per fixture, so memory, not cores,
  // bounds the useful count; see docs/verificacao.md.
  workers: Math.min(8, availableParallelism()),
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
