import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-session-client.ts';

test('maintenance and interrupted access have a single readable instruction', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.maintenance(true));
  const notice = page.locator('#editor-access-notice');
  await expect(notice.getByRole('heading')).toHaveText('Portal em manutenção');
  await expect(notice).toHaveScreenshot('editor-maintenance.png');
  await page.evaluate(() => window.editorSessionTest.expire());
  await expect(notice.getByRole('button')).toHaveCount(0);
  await page.evaluate(() => window.editorSessionTest.maintenance(false));
  await expect(notice.getByRole('heading')).toHaveText('Entre novamente para continuar');
  const login = notice.getByRole('button', { name: 'Entrar novamente', exact: true });
  await expect(notice).toHaveScreenshot('editor-sign-in.png');
  // A real click also proves the action is reachable, including at mobile width.
  await login.click();
  await expect(page.locator('#email')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('checking access gives a waiting instruction without actions', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.bootstrapLoading(true));
  const notice = page.locator('#editor-access-notice');
  await expect(notice.getByRole('heading')).toHaveText('Verificando seu acesso');
  await expect(notice).toHaveScreenshot('editor-checking-access.png');
});
