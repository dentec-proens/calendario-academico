import { defineConfig } from 'vitest/config';

if (process.platform !== 'linux') {
  throw new Error('O runtime de PDF exige Linux. Use pnpm test:runtime:linux com Docker.');
}

export default defineConfig({
  test: {
    include: ['test/runtime/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
