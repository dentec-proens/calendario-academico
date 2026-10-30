import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import { fullPageScreenshot } from './full-page-screenshot.ts';

test('full-page capture preserves the editor scroll, focus and image', async ({
  page,
  fixtureServer,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await selectEditorSection(page, 'events');
  const heading = page.locator('#editor-section-title');
  await expect(heading).toBeFocused();
  await expect(page.locator('#activity-checklist')).toBeVisible();
  const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const first = await fullPageScreenshot(page);
  await expect(heading).toBeFocused();
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(before);
  const second = await fullPageScreenshot(page);
  await expect(heading).toBeFocused();
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(before);
  expect(second.equals(first), 'capturing the page again must preserve every image pixel').toBe(
    true,
  );
});
