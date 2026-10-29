import { test, expect } from './test.ts';

test('calendar rules use offer columns or labeled activity cards', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/regras');
  await expect(page.locator('#rules-title')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page).toHaveScreenshot('calendar-rules.png', { fullPage: true });
});
