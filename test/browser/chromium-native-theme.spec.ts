import { test, expect } from './test.ts';
import { chromiumFeaturesDisabledBy } from './chromium-native-theme.ts';
import { nativeSelectLaunchOptions } from './chromium-native-theme.ts';
import type { BrowserServer } from '@playwright/test';

test('macOS native-control configuration preserves installed Chromium defaults', async ({
  browserName,
  headless,
  launchOptions,
  playwright,
}) => {
  test.skip(process.platform !== 'darwin' || browserName !== 'chromium', 'macOS Chromium theme');
  const probe = await playwright.chromium.launchServer({ headless });
  try {
    const defaults = chromiumFeaturesDisabledBy(probe.process().spawnargs);
    const configured = chromiumFeaturesDisabledBy(launchOptions.args ?? []);
    expect(defaults.length).toBeGreaterThan(0);
    expect(configured).toEqual(expect.arrayContaining(defaults));
    expect(configured).toContain('OverlayScrollbar');
    expect(launchOptions.args?.filter((arg) => arg.startsWith('--disable-features='))).toHaveLength(
      1,
    );
  } finally {
    await probe.close();
  }
});

test('a failed native-theme probe leaves no temporary browser process running', async ({
  playwright,
}) => {
  let child: ReturnType<BrowserServer['process']> | undefined;
  const failure = new Error('Synthetic native-theme metadata failure');
  await expect(
    nativeSelectLaunchOptions(
      {
        async launchServer(options) {
          const server = await playwright.chromium.launchServer(options);
          child = server.process();
          return {
            process() {
              throw failure;
            },
            close: () => server.close(),
          };
        },
      },
      { headless: true },
    ),
  ).rejects.toBe(failure);
  expect(child && (child.exitCode !== null || child.signalCode !== null)).toBe(true);
});
