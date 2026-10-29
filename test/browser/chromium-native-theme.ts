import type { LaunchOptions } from '@playwright/test';

const disabledFeaturesSwitch = '--disable-features=';

export function chromiumFeaturesDisabledBy(args: readonly string[]): string[] {
  return args
    .filter((arg) => arg.startsWith(disabledFeaturesSwitch))
    .flatMap((arg) => arg.slice(disabledFeaturesSwitch.length).split(','))
    .filter(Boolean);
}

/** Chromium uses the last switch: merge instead of replacing Playwright's defaults. */
export function nativeSelectArguments(
  defaultArgs: readonly string[],
  projectArgs: readonly string[],
) {
  const disabled = new Set([
    ...chromiumFeaturesDisabledBy(defaultArgs),
    ...chromiumFeaturesDisabledBy(projectArgs),
    'OverlayScrollbar',
  ]);
  return [
    ...projectArgs.filter((arg) => !arg.startsWith(disabledFeaturesSwitch)),
    disabledFeaturesSwitch + [...disabled].join(','),
  ];
}

interface ChromiumLauncher {
  launchServer(options: LaunchOptions): Promise<{
    process(): { spawnargs: string[] };
    close(): Promise<void>;
  }>;
}

/** Inspect public launch metadata, without reading Playwright internals or user preferences. */
export async function nativeSelectLaunchOptions(
  chromium: ChromiumLauncher,
  options: LaunchOptions,
): Promise<LaunchOptions> {
  const probe = await chromium.launchServer({ ...options, headless: true });
  try {
    return {
      ...options,
      args: nativeSelectArguments(probe.process().spawnargs, options.args ?? []),
    };
  } finally {
    await probe.close();
  }
}
