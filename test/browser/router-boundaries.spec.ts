import { test, expect } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';

test('canceling an editor exit preserves the route, draft and React document', async ({
  page,
  cleanup,
}) => {
  const fixture = await startFixtureServer('editor', cleanup);
  const origin = new URL(fixture).origin;
  await page.goto(fixture);
  await page.locator('[data-view="events"]').click();
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Alteração ainda não aplicada');
  const initial = page.url();
  const documentOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.locator('.portal-back').click();
  await expect(page.getByRole('alertdialog', { name: 'Sair deste calendário?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL(initial);
  await expect(page.locator('#event-name')).toHaveValue('Alteração ainda não aplicada');
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentOrigin);
  await page.locator('.portal-back').click();
  await page.getByRole('button', { name: 'Salvar e sair', exact: true }).click();
  await expect(page).toHaveURL(origin + '/calendarios');
  await expect(page.locator('#calendar-list')).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentOrigin);
});

test('sections and browser history preserve an unapplied event without an exit prompt', async ({
  page,
  cleanup,
}) => {
  const fixture = await startFixtureServer('editor', cleanup);
  await page.goto(fixture);
  await page.locator('[data-view="events"]').click();
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Evento conservado entre seções');
  const documentOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.locator('[data-view="periods"]').click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('#event-name')).toHaveValue('Evento conservado entre seções');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentOrigin);
});
