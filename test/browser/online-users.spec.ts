import { test, expect } from './test.ts';
import type {} from '../fixtures/online-users.ts';

test('online users renders live totals, search, campus filters and mobile layout', async ({
  page,
  fixtureServer,
}) => {
  const fixtureUrl = await fixtureServer('online-users');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(fixtureUrl);
  await expect(page.locator('.loading-indicator-bar')).toBeVisible();
  await expect(page.locator('.loading-indicator').getByRole('status')).toHaveText(
    'Carregando usuários online…',
  );
  await expect(page.locator('.loading-indicator').getByRole('status')).toHaveCSS(
    'clip-path',
    'inset(50%)',
  );
  const users = [
    {
      id: 'a',
      name: 'Ana',
      email: 'ana@ifpr.edu.br',
      campusId: 'campus-a',
      campusName: 'Campus A',
      role: 'CAMPUS',
    },
    {
      id: 'b',
      name: 'Bruno',
      email: 'bruno@ifpr.edu.br',
      campusId: null,
      campusName: 'Institucional',
      role: 'ADMIN',
    },
  ];
  await page.evaluate((users) => window.setOnlineFixture({ users, truncated: false }), users);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('.online-summary')).toContainText(/2 usuário.*1 campus/);
  await page.getByRole('searchbox').fill('ana@ifpr');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('combobox').selectOption('institutional');
  await expect(page.locator('tbody')).toContainText('Bruno');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.evaluate(() => window.setOnlineFixture({ users: [], truncated: false }));
  await expect(page.getByText('Nenhum usuário online no momento.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
