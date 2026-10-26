import { defineConfig } from '@playwright/test';
import config from './playwright.config.ts';

import { configuredE2ETarget } from './scripts/e2e-environment.ts';

configuredE2ETarget(process.env);

export default defineConfig({
  ...config,
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  projects: [{ name: 'chromium-e2e', use: { viewport: { width: 1440, height: 1000 } } }],
});
