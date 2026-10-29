import { expect, test, vi } from 'vitest';
import {
  chromiumFeaturesDisabledBy,
  nativeSelectArguments,
  nativeSelectLaunchOptions,
} from '../browser/chromium-native-theme.ts';

test('native-select launch arguments preserve every installed default and project option', () => {
  const defaults = [
    '/synthetic/chromium',
    '--disable-features=PaintHolding,FuturePlaywrightDefault',
    '--enable-features=CDPScreenshotNewSurface',
    '--headless',
  ];
  const project = [
    '--disable-features=ProjectFeature,PaintHolding',
    '--custom-project-option',
    '--enable-features=ProjectEnabledFeature',
    '--disable-features=AnotherProjectFeature',
  ];
  const before = { defaults: [...defaults], project: [...project] };
  const merged = nativeSelectArguments(defaults, project);
  expect(merged).toEqual([
    '--custom-project-option',
    '--enable-features=ProjectEnabledFeature',
    '--disable-features=PaintHolding,FuturePlaywrightDefault,ProjectFeature,AnotherProjectFeature,OverlayScrollbar',
  ]);
  expect(chromiumFeaturesDisabledBy(merged)).toEqual([
    'PaintHolding',
    'FuturePlaywrightDefault',
    'ProjectFeature',
    'AnotherProjectFeature',
    'OverlayScrollbar',
  ]);
  expect({ defaults, project }).toEqual(before);
});

test('native-select launch arguments handle absent feature switches and avoid duplication', () => {
  expect(nativeSelectArguments([], [])).toEqual(['--disable-features=OverlayScrollbar']);
  expect(
    nativeSelectArguments(
      ['--disable-features=OverlayScrollbar,Existing'],
      ['--disable-features=Existing,OverlayScrollbar'],
    ),
  ).toEqual(['--disable-features=OverlayScrollbar,Existing']);
});

test('the probe uses public launch metadata and closes before providing options', async () => {
  const close = vi.fn(async () => undefined);
  const launchServer = vi.fn(async () => ({
    process: () => ({ spawnargs: ['chromium', '--disable-features=InstalledDefault'] }),
    close,
  }));
  const options = {
    headless: false,
    args: ['--project-option'],
    timeout: 12_345,
    ignoreDefaultArgs: ['--ignored-project-default'],
  };
  expect(await nativeSelectLaunchOptions({ launchServer }, options)).toEqual({
    ...options,
    args: ['--project-option', '--disable-features=InstalledDefault,OverlayScrollbar'],
  });
  expect(launchServer).toHaveBeenCalledExactlyOnceWith({ ...options, headless: true });
  expect(close).toHaveBeenCalledTimes(1);
});

test('the temporary browser closes even if its metadata cannot be read', async () => {
  const close = vi.fn(async () => undefined);
  const failure = new Error('Synthetic launch metadata failure');
  const launchServer = vi.fn(async () => ({
    process: () => {
      throw failure;
    },
    close,
  }));
  await expect(nativeSelectLaunchOptions({ launchServer }, {})).rejects.toBe(failure);
  expect(close).toHaveBeenCalledTimes(1);
});
