import { test, expect } from './test.ts';

const events = '/calendarios/synthetic-calendar/atividades';

test('activities of two offers carry badges and the by-date view says what it counts', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor-mixed-offers')).origin;
  await page.goto(`${origin}${events}?atividadeAssunto=teaching`);
  await expect(page.locator('[data-offer-badge]').first()).toBeVisible();
  await expect(page).toHaveScreenshot('activities-two-offers.png', { fullPage: true });
  await page.locator('#activity-mode-data').check();
  await expect(page.locator('#activities-without-dates')).toBeVisible();
  await expect(page).toHaveScreenshot('activities-by-date.png', { fullPage: true });
});

test('the form of an activity offers to go on to the next pending one', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor-mixed-offers')).origin;
  await page.goto(`${origin}${events}`);
  // The capture is about the panel. A pointer click would first scroll the row into view, and the
  // page behind would then settle at a timing-dependent position; the event opens it in place.
  await page.locator('[data-activity-open="pit:semester:first"]').dispatchEvent('click');
  await expect(page.locator('#apply-and-next-pending')).toBeVisible();
  await expect(page).toHaveScreenshot('activity-form-next-pending.png');
});

test('the review groups an activity of two offers in one row', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('editor-mixed-offers')).origin;
  await page.goto(`${origin}/calendarios/synthetic-calendar/pendencias`);
  await expect(page.locator('[data-issue="activity:pit:semester:first"]')).toBeVisible();
  await expect(page).toHaveScreenshot('review-two-offers.png', { fullPage: true });
});
