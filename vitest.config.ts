import { defineConfig } from 'vitest/config';

// Keep unit tests independent of the app config and its deployment environment.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/runtime/**', 'test/browser/**', 'test/e2e/**'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
