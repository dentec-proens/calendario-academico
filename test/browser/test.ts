import { test as base, expect } from '@playwright/test';
import { startFixtureServer, type FixtureServer } from './fixture-server.ts';
import { nativeSelectLaunchOptions } from './chromium-native-theme.ts';

export type Cleanup = (callback: () => unknown) => void;

// Keep fixture servers alive until the page has closed; always release every resource,
// even when a test or another teardown fails.
export const test = base.extend<{ cleanup: Cleanup }, { fixtureServer: FixtureServer }>({
  launchOptions: [
    async ({ browserName, launchOptions, playwright }, provide) => {
      await provide(
        process.platform === 'darwin' && browserName === 'chromium'
          ? await nativeSelectLaunchOptions(playwright.chromium, launchOptions)
          : launchOptions,
      );
    },
    { scope: 'worker' },
  ],
  fixtureServer: [
    async ({ browserName }, provide) => {
      const callbacks: Parameters<Cleanup>[0][] = [];
      const servers = new Map<Parameters<FixtureServer>[0], Promise<string>>();
      const fixtureServer: FixtureServer = (fixture) => {
        let server = servers.get(fixture);
        if (!server) {
          server = startFixtureServer(fixture, (callback) => callbacks.push(callback));
          servers.set(fixture, server);
        }
        return server;
      };
      const errors: unknown[] = [];
      try {
        await provide(fixtureServer);
      } catch (error) {
        errors.push(error);
      }
      for (const callback of callbacks.reverse()) {
        try {
          await callback();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, `Falha ao encerrar servidores do worker (${browserName})`);
    },
    { scope: 'worker' },
  ],
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
