import { test, expect } from './test.ts';

test('operation records use a table or compact labeled blocks', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/logs');
  await expect(page.locator('#log-list tbody tr')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page).toHaveScreenshot('operation-records.png', { fullPage: true });
});
