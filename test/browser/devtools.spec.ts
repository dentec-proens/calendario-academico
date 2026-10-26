import { test, expect } from './test.ts';

test('development tools require explicit opt-in and can open and close with keyboard', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/campi/novo');
  await expect(
    page.getByRole('button', { name: 'Open TanStack Devtools', exact: true }),
  ).toHaveCount(0);
  await page.goto(origin + '/campi/novo?devtools=1');
  await page.locator('#campus-name').fill('Campus inspecionável');
  const trigger = page.getByRole('button', { name: 'Open TanStack Devtools', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const close = page.getByRole('button', { name: 'Close TanStack Devtools', exact: true });
  await expect(close).toBeVisible();
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toBeVisible();
  await expect(page.locator('#campus-name')).toHaveValue('Campus inspecionável');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#campus-form button[type="submit"]')).toBeVisible();
  expect(errors).toEqual([]);
});
