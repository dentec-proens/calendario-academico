import { test, expect } from './test.ts';

test('notice exposes tone, announcement, title, icon, actions and hidden state accessibly', async ({
  page,
  fixtureServer,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(await fixtureServer('notice'));
  await expect(page.locator('#notice-info')).toBeVisible();

  // Static notices are part of the page; only announced ones become live regions.
  await expect(page.locator('#notice-info')).not.toHaveAttribute('role');
  await expect(page.locator('#notice-success')).toHaveAttribute('role', 'status');
  await expect(page.locator('#notice-danger')).toHaveAttribute('role', 'alert');
  for (const tone of ['info', 'success', 'warning', 'danger'])
    await expect(page.locator(`#notice-${tone}`)).toHaveAttribute('data-tone', tone);

  // Every tone has a decorative default icon; a screen can replace or drop it.
  for (const id of ['info', 'success', 'warning', 'danger', 'custom-icon'])
    await expect(page.locator(`#notice-${id} > svg[aria-hidden="true"]`)).toHaveCount(1);
  await expect(page.locator('#notice-custom-icon > svg')).toHaveClass(/lucide-calendar-days/);
  await expect(page.locator('#notice-no-icon > svg')).toHaveCount(0);

  const warning = page.locator('#notice-warning');
  await expect(warning).toHaveJSProperty('tagName', 'SECTION');
  await expect(
    page.getByRole('region', { name: 'Nenhum sábado pode ser selecionado ainda' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    'Nenhum sábado pode ser selecionado ainda',
  );
  await page.locator('#notice-warning-title').focus();
  await expect(page.locator('#notice-warning-title')).toBeFocused();
  await expect(warning.getByRole('link', { name: 'Períodos letivos' })).toBeVisible();
  await expect(warning.locator('#notice-action')).toBeVisible();

  await expect(page.locator('#notice-hidden')).toBeHidden();
  expect(errors).toEqual([]);
});
