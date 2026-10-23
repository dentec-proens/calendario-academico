import { test as base, expect } from '@playwright/test';

export type Cleanup = (callback: () => unknown) => void;

// Keep fixture servers alive until the page has closed; always release every resource,
// even when a test or another teardown fails.
export const test = base.extend<{ cleanup: Cleanup }>({
  // Resolve cleanup before Playwright's context so its teardown runs after context/page teardown.
  context: async ({ cleanup: _cleanup, context }, provide) => {
    await provide(context);
  },
  cleanup: async ({ browserName }, provide) => {
    const callbacks: Parameters<Cleanup>[0][] = [];
    await provide((callback) => callbacks.push(callback));
    const errors: unknown[] = [];
    for (const callback of callbacks.reverse()) {
      try {
        await callback();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, `Falha ao encerrar fixtures de navegador (${browserName})`);
  },
});

export { expect };
