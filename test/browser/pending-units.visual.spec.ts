import { test, expect } from './test.ts';
import { fillRequiredVacations, selectEditorSection } from './editor-navigation.ts';

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
  await page.locator('[data-activity-open="pit:semester:first"]').click();
  await expect(page.locator('#apply-and-next-pending')).toBeVisible();
  await expect(page).toHaveScreenshot('activity-form-next-pending.png');
});

test('the review groups an activity of two offers in one row', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('editor-mixed-offers')).origin;
  await page.goto(`${origin}/calendarios/synthetic-calendar/pendencias`);
  await expect(page.locator('[data-issue="activity:pit:semester:first"]')).toBeVisible();
  await expect(page).toHaveScreenshot('review-two-offers.png', { fullPage: true });
  await fillRequiredVacations(page);
  await selectEditorSection(page, 'issues');
  await page.locator('[data-lifecycle-footer-action="submit"]').click();
  const dialog = page.locator('dialog.confirmation-dialog--warning[open]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveScreenshot('submission-two-offers.png');
});
