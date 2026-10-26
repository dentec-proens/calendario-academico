import { test, expect } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';
import { publishBaseUpdate } from './base-update.ts';

test('institutional base changes collapsed and expanded', async ({ page, cleanup }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  await page.goto(await startFixtureServer('editor', cleanup));
  await publishBaseUpdate(page);
  const card = page.locator('.base-update-card');
  await expect(card).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect(card).toHaveScreenshot('base-update-collapsed.png');
  await card.locator('summary').click();
  await expect(
    card.getByRole('button', { name: 'Incorporar mudanças ao calendário' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect(card).toHaveScreenshot('base-update-expanded.png');
});
