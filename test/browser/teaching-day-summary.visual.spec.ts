import { test, expect } from './test.ts';
import { addPeriod, configureOffer, savedState, selectEditorSection } from './editor-navigation.ts';

test('persistent teaching days and expanded period details', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#weekdays')).toBeVisible();
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await configureOffer(page, 'graduacao', '2027-03-08', '2027-05-14');
  await savedState(page);
  await selectEditorSection(page, 'issues');
  await page.locator('#calendar-scope').selectOption('covered');

  await page.locator('#scope-form button[type="submit"]').click();
  await savedState(page);
  await selectEditorSection(page, 'periods');
  await page.locator('.teaching-day-summary > summary').click();
  await expect(
    page.getByRole('region', { name: 'Dias letivos por oferta e período' }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot('teaching-day-details.png');
});
