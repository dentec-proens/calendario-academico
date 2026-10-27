import { test, expect } from './test.ts';
import { addPeriod } from './editor-navigation.ts';

test('unified periods and assessment page', async ({ page, fixtureServer }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await addPeriod(page, '2027-02-15', '2027-12-20');
  await page.locator('[data-assessment-modality="integrado"]').selectOption('4');
  await page.getByRole('button', { name: 'Definir etapas', exact: true }).click();
  await expect(page.locator('#assessment-checklist [data-activity-open]')).toHaveCount(4);
  await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'saved');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#editor-section-title').focus();
  await expect(page).toHaveScreenshot('periods-assessments.png', { fullPage: true });
});
