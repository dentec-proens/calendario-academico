import { defineConfig } from 'vitest/config';

// Keep unit tests independent of the app config and its deployment environment.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
