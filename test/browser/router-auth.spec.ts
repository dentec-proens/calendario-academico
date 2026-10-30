import { test, expect } from './test.ts';
import type {} from '../fixtures/router-auth-client.ts';

test('unauthenticated editor and audit URLs return to login with the requested destination', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('router-auth')).origin;
  for (const destination of [
    '/calendarios/calendar-a/historico',
    '/calendarios/calendar-a/eventos#calendario-anterior',
    '/logs',
    '/documentos/document-a/abrir',
  ]) {
    await page.goto(origin + destination);
    await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
    const url = new URL(page.url());
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('retorno')).toBe(destination);
  }
});

test('public activation removes the fragment and submits its token without requiring login', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('router-auth')).origin;
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) remoteRequests.push(request.url());
    expect(request.url()).not.toContain('private-invitation');
  });
  await page.goto(origin + '/ativar-conta#token=private-invitation');
  await expect(page.locator('#activation-form')).toBeVisible();
  await expect(page).toHaveURL(origin + '/ativar-conta');
  await page.locator('#activation-email').fill('convite@example.invalid');
  await page.locator('#activation-password').fill('senha-sintetica-2027');
  await page.locator('#activation-confirm').fill('senha-sintetica-2027');
  await page.locator('#activate-button').click();
  await expect(page.locator('#invite-message')).toContainText('Conta ativada');
  expect(await page.evaluate(() => window.routerAuthTest.acceptedToken)).toBe('private-invitation');
  expect(remoteRequests).toEqual([]);
});

test('public password reset removes the fragment and retains the token for submission', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('router-auth')).origin;
  await page.goto(origin + '/recuperar-senha#token=private-reset');
  await expect(page.locator('#reset-form')).toBeVisible();
  await expect(page).toHaveURL(origin + '/recuperar-senha');
  await page.locator('#password').fill('senha-sintetica-2027');
  await page.locator('#confirmation').fill('senha-sintetica-2027');
  await page.locator('#reset-form button').click();
  await expect(page.getByText('Senha sintética atualizada.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.routerAuthTest.resetToken)).toBe('private-reset');
  await expect(page.locator('#reset-form')).toBeHidden();
});
