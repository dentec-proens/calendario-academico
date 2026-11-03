import { test, expect } from './test.ts';

test('review step with a pending norm and grouped issues', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/pendencias');
  await expect(page.locator('#review-summary')).toBeVisible();
  // The whole page: an element screenshot scrolls under the sticky teaching-day bar.
  await expect(page).toHaveScreenshot('review-step.png', { fullPage: true });
});
