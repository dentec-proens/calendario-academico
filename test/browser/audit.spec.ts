import { test, expect } from './test.ts';
import type {} from '../fixtures/audit-data.ts';

for (const width of [1440, 390]) {
  test(`audit navigation and responsive records at ${width}px`, async ({ page, fixtureServer }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(await fixtureServer('portal'));
    if (width === 390) await page.locator('.sidebar-toggle').click();
    const navigation = page.locator('#portal-navigation');
    const link = navigation.getByRole('link', {
      name: 'Registro de operações',
      exact: true,
      includeHidden: true,
    });
    const peer = navigation.getByRole('link', { name: 'Contas e acessos', exact: true });
    const styles = await Promise.all(
      [link, peer].map((item) =>
        item.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            weight: style.fontWeight,
            size: style.fontSize,
            gap: style.gap,
            padding: style.padding,
          };
        }),
      ),
    );
    expect(styles[0]).toEqual(styles[1]);
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/logs$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Registro de operações');
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(link).toHaveClass(/active/);
    const table = page.getByRole('table', { name: 'Registro de operações' });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Data e hora',
      'Operação',
      'Calendário',
      'Responsável',
      'Versão',
    ]);
    const rows = table.locator('tbody').getByRole('row');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('23/10/2026, 12:24:00');
    await expect(rows.first()).toContainText('Calendário salvo');
    await expect(rows.nth(1).getByRole('cell').nth(2)).toContainText('—');
    const tops = await rows
      .first()
      .getByRole('cell')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().top));
    expect(tops.every((top) => top === tops[0])).toBe(width === 1440);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => {
      window.auditTest.deferMore = true;
    });
    const more = page.locator('#more-logs');
    await more.click();
    await expect(more).toBeDisabled();
    await expect(more).toHaveAttribute('aria-busy', 'true');
    await expect(more).toContainText('Carregar anteriores');
    await expect(more.locator('.loading-indicator-bar')).toBeVisible();
    await expect(more.getByRole('status')).toHaveText('Carregando registros anteriores…');
    await expect(more.getByRole('status')).toHaveCSS('clip-path', 'inset(50%)');
    const button = await more.boundingBox();
    const bar = await more.locator('.loading-indicator-bar').boundingBox();
    expect(button && bar && bar.x >= button.x && bar.x + bar.width <= button.x + button.width).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/loading-action-${width}.png` });
    await expect.poll(() => page.evaluate(() => window.auditTest.pending)).toBe(true);
    await page.evaluate(() => window.auditTest.finishMore());
    await expect(rows).toHaveCount(4);
    await expect(rows.last()).toContainText('Unidade cadastrada');
    await expect(more).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.auditTest.cursors))
      .toEqual(['older-audit-page']);
    await page.getByRole('button', { name: 'Atualizar registros' }).click();
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Carregar anteriores' })).toBeVisible();
  });
}

test('audit keeps existing records on pagination failure', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/logs');
  const rows = page.locator('#log-list tbody tr');
  await expect(rows).toHaveCount(3);
  await page.evaluate(() => {
    window.auditTest.failMore = true;
  });
  await page.getByRole('button', { name: 'Carregar anteriores' }).click();
  await expect(page.locator('#log-message')).toContainText(
    'Falha ao carregar registros anteriores.',
  );
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Carregar anteriores' })).toBeEnabled();
});

test('audit explains the initial loading and empty states', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/logs?audit-loading');
  await expect(page.locator('.loading-indicator-bar')).toBeVisible();
  await expect(page.locator('.loading-indicator').getByRole('status')).toHaveText(
    'Carregando histórico…',
  );
  await expect(page.locator('#log-message')).toBeEmpty();
  await expect(page.locator('#log-list')).toHaveCount(0);
  await page.evaluate(() =>
    window.auditTest.publish({ entries: [], isDone: true, continueCursor: '' }),
  );
  await expect(page.locator('#log-message')).toContainText('Nenhuma operação registrada');
  await expect(page.locator('#log-list')).toHaveCount(0);
});
