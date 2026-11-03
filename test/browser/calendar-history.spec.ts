import { test, expect } from './test.ts';

test('the editor menu opens the history of this calendar only', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('editor'));
  await page.locator('.editor-more > summary').click();
  const link = page.getByRole('link', { name: 'Histórico do calendário', exact: true });
  await expect(link).toHaveAccessibleDescription('Operações deste calendário');
  await link.click();
  await expect(page).toHaveURL(/\/calendarios\/synthetic-calendar\/operacoes$/);
  await expect(page.locator('#editor-section-title')).toHaveText('Histórico do calendário');
  // An auxiliary page, outside the filling steps: no step number and no "continue" action.
  await expect(page.locator('.editor-title-step')).toHaveCount(0);
  await expect(page.locator('#editor-continue')).toHaveCount(0);
  const table = page.getByRole('table', { name: 'Histórico do calendário' });
  await expect(table.getByRole('columnheader')).toHaveText([
    'Data e hora',
    'Operação',
    'Responsável',
    'Versão',
  ]);
  const rows = table.locator('tbody').getByRole('row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('23/10/2026, 12:24:00');
  await expect(rows.first()).toContainText('Calendário salvo');
  await expect(page.getByRole('button', { name: 'Carregar anteriores' })).toHaveCount(0);
});
