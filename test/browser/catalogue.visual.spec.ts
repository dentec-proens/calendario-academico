import { test, expect } from './test.ts';

test('institutional event form highlights its active status', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/eventos-institucionais/synthetic-event/editar');
  const toggle = page.getByRole('switch', { name: 'Evento ativo', exact: true });
  await expect(toggle).toBeChecked();
  await expect(page).toHaveScreenshot('institutional-event-active.png', { fullPage: true });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await toggle.blur();
  await expect(page).toHaveScreenshot('institutional-event-inactive.png', { fullPage: true });
});
