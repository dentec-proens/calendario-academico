import { test, expect } from './test.ts';

test('the vacations step lists both kinds, with their particularities', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/ferias');
  await page.locator('#vacation-add-school').click();
  await page.locator('#vacation-start').fill('2027-07-05');
  await page.locator('#vacation-end').fill('2027-07-25');
  await page.locator('#vacation-apply').click();
  await page.locator('#vacation-add-school').click();
  await page.locator('#vacation-name').fill('Recesso escolar');
  await page.locator('#vacation-start').fill('2027-12-23');
  await page.locator('#vacation-end').fill('2027-12-31');
  await page.locator('#vacation-apply').click();
  await page.getByRole('button', { name: 'Usar os períodos das escolares' }).click();
  await expect(page.locator('#vacation-teacher-summary')).toBeVisible();
  await expect(page.locator('#vacations')).toHaveScreenshot('vacations-step.png');
  await page.locator('#vacation-add-teacher').click();
  await expect(page.locator('#vacation-form')).toHaveScreenshot('vacations-form.png');
});
