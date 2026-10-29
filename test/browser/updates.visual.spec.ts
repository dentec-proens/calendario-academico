import { test, expect } from './test.ts';
import { startUpdateServer } from './update-server.ts';

test('public version notice remains readable and leaves controls reachable', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  server.selectManifest('b');
  await page.goto(server.origin + '/calendarios/novo');
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  await expect(page.locator('.portal-update')).toHaveScreenshot('update-ready.png');
  await page.locator('#calendar-courses').fill('Curso em preenchimento');
  await expect(page.locator('#calendar-courses')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toHaveCount(0);
  await expect(page.locator('.portal-update')).toHaveScreenshot('update-blocked.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#calendar-courses').fill('');
  await page.getByRole('button', { name: 'Atualizar agora' }).focus();
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeFocused();
});
