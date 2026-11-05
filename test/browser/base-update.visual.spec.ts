import { test, expect } from './test.ts';
import { publishBaseUpdate } from './base-update.ts';

test('institutional base changes', async ({ page, fixtureServer }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  await page.goto(await fixtureServer('editor'));
  await publishBaseUpdate(page);
  const card = page.locator('.base-update-card');
  await expect(
    card.getByRole('button', { name: 'Incorporar mudanças ao calendário' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect(page).toHaveScreenshot('base-update-expanded.png', { fullPage: true });
});

test('newer rules leave only an informative notice', async ({ page, fixtureServer }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.rulesetVersion = 'consup-292-2027-v6';
    record.version++;
    return window.publishReviewerCalendar();
  });
  const notice = page.locator('#base-changes-notice');
  await expect(notice).toContainText('As novas regras não alteraram suas datas.');
  await expect(notice).toHaveScreenshot('rules-notice.png');
});
