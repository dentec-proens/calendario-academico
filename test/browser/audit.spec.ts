import { test, expect } from './test.ts';
import type {} from '../fixtures/audit-data.ts';

for (const width of [1440, 390]) {
  test(`audit navigation and responsive records at ${width}px`, async ({ page, fixtureServer }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(await fixtureServer('portal'));
    if (width === 390) await page.locator('.sidebar-toggle').click();
    const navigation = page.locator('#portal-navigation');
    const link = navigation.getByRole('link', {
      name: 'Registros',
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Registros');
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(link).toHaveClass(/active/);
    const table = page.getByRole('table', { name: 'Operações' });
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
    await page.getByRole('button', { name: 'Voltar às mais recentes' }).click();
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Carregar anteriores' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voltar às mais recentes' })).toHaveCount(0);
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
    'Carregando operações…',
  );
  await expect(page.locator('#log-message')).toBeEmpty();
  await expect(page.locator('#log-list')).toHaveCount(0);
  await page.evaluate(() =>
    window.auditTest.publish({ entries: [], isDone: true, continueCursor: '' }),
  );
  await expect(page.locator('#log-message')).toContainText('Nenhuma operação registrada');
  await expect(page.locator('#log-list')).toHaveCount(0);
});

test('the administration sees failures people met, in their own table', async ({
  page,
  fixtureServer,
}) => {
  const { origin } = new URL(await fixtureServer('portal'));
  await page.goto(origin + '/logs');
  await expect(page.getByRole('table', { name: 'Operações' })).toBeVisible();
  await page.evaluate(() => {
    window.auditTest.failures = {
      entries: [
        {
          at: '2026-11-04T19:34:00Z',
          kind: 'save',
          status: 409,
          message: 'Há versão mais recente. Reabra o calendário.',
          route: '/calendarios/abc',
          actor: 'Pessoa editora',
          calendar: 'Calendário 2027 — Campus de teste',
          release: 'build-identifier',
        },
      ],
      isDone: true,
      continueCursor: '',
    };
    window.auditTest.publish(window.auditTest.first);
  });
  await page.getByRole('tab', { name: 'Falhas' }).click();
  await expect(page).toHaveURL(/\/logs\?aba=falhas$/);
  const failures = page.getByRole('table', { name: 'Falhas registradas' });
  await expect(failures).toContainText(
    'Salvamento recusado (409): Há versão mais recente. Reabra o calendário. · /calendarios/abc · publicação build-id',
  );
  await expect(failures).toContainText('Pessoa editora');
});

test('the administration reads the feedback with the time left before it is removed', async ({
  page,
  fixtureServer,
}) => {
  const { origin } = new URL(await fixtureServer('portal'));
  await page.goto(origin + '/logs');
  await expect(page.getByRole('table', { name: 'Operações' })).toBeVisible();
  await page.evaluate(() => {
    const day = 24 * 60 * 60_000;
    const base = {
      route: '/calendarios/abc',
      actor: 'Pessoa editora',
      role: 'CAMPUS' as const,
      calendar: 'Calendário 2027 — Campus de teste',
    };
    window.auditTest.feedback = {
      entries: [
        {
          ...base,
          id: 'recent' as never,
          at: Date.now() - day / 2,
          context: 'submit',
          rating: 4,
          comment: 'Faltou um atalho para copiar as férias.',
        },
        {
          ...base,
          id: 'old' as never,
          at: Date.now() - 361.5 * day,
          context: 'spontaneous',
          rating: null,
          comment: 'Sugestão antiga.',
          calendar: null,
        },
      ],
      isDone: true,
      continueCursor: '',
    };
    window.auditTest.publish(window.auditTest.first);
  });
  await page.getByRole('tab', { name: 'Feedback' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Feedback' });
  await expect(panel).toContainText('apagados 1 ano depois de recebidos');
  const entries = panel.getByRole('list', { name: 'Feedback recebido' }).getByRole('listitem');
  await expect(entries).toHaveCount(2);
  await expect(panel.getByRole('status')).toHaveText('2 respostas');
  await expect(entries.first()).toContainText('Fácil');
  await expect(entries.first()).toContainText('Após enviar calendário');
  await expect(entries.first()).toContainText('Expira em 364 dias');
  await expect(entries.first().locator('.feedback-card__comment')).toHaveText(
    'Faltou um atalho para copiar as férias.',
  );
  await expect(entries.first()).toContainText('Pessoa editora · Campus');
  await expect(entries.nth(1)).toContainText('Sem nota');
  await expect(entries.nth(1).locator('.feedback-card__removal')).toHaveText('Expira em 3 dias');
  await expect(entries.nth(1).locator('.feedback-card__removal')).toHaveAttribute(
    'data-close',
    'true',
  );

  // The summary counts by rating and filters; the other filters narrow further.
  const summary = panel.getByRole('group', { name: 'Filtrar por nota' });
  await expect(summary.getByRole('button', { name: /Fácil/ }).first()).toContainText('1');
  await expect(summary.getByRole('button', { name: /^Difícil/ })).toBeDisabled();
  await summary.getByRole('button', { name: /Sem nota/ }).click();
  await expect(entries).toHaveCount(1);
  await expect(panel.getByRole('status')).toHaveText('1 de 2 respostas');
  await expect(entries.first()).toContainText('Sugestão antiga.');
  await summary.getByRole('button', { name: /Sem nota/ }).click();
  await panel.getByLabel('Origem').selectOption('submit');
  await expect(entries).toHaveCount(1);
  await panel.getByLabel('Perfil').selectOption('PARECERISTA');
  await expect(panel).toContainText('Nenhum feedback corresponde aos filtros.');
  await panel.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(entries).toHaveCount(2);
});

test('the administration switches between operations, feedback and failures in tabs', async ({
  page,
  fixtureServer,
}) => {
  const { origin } = new URL(await fixtureServer('portal'));
  await page.goto(origin + '/logs');
  const tabs = page.getByRole('tablist', { name: 'Tipo de registro' }).getByRole('tab');
  await expect(tabs).toHaveText(['Operações', 'Feedback', 'Falhas']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('tabpanel', { name: 'Operações' }).getByRole('table', { name: 'Operações' }),
  ).toBeVisible();

  // Arrows move and select, and the tab is kept in the URL for a reload or a link.
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/logs\?aba=feedback$/);
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  // Before anything arrives, the tab says so instead of staying blank.
  await page.evaluate(() => {
    window.auditTest.feedback = { entries: [], isDone: true, continueCursor: '' };
    window.auditTest.failures = { entries: [], isDone: true, continueCursor: '' };
    window.auditTest.publish(window.auditTest.first);
  });
  await expect(page.getByRole('tabpanel', { name: 'Feedback' })).toContainText(
    'Nenhum feedback recebido ainda.',
  );
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/\/logs\?aba=falhas$/);
  await expect(page.getByRole('tabpanel', { name: 'Falhas' })).toContainText(
    'Nenhuma falha registrada.',
  );
  await page.reload();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  // Home goes back to the first tab, and from it the left arrow wraps to the last one.
  await tabs.nth(2).focus();
  await page.keyboard.press('Home');
  await expect(page).toHaveURL(/\/logs$/);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/\/logs\?aba=falhas$/);
  await page.getByRole('tab', { name: 'Operações' }).click();
  await expect(page).toHaveURL(/\/logs$/);
});
