import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const width of [1440, 390]) {
  test(`calendar filters live in the URL and reach every calendar at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/calendarios?long-list=1');
    const rows = page.locator('#calendar-list > li');
    await expect(rows).toHaveCount(50);
    const search = page.getByRole('searchbox', { name: 'Buscar' });
    const status = page.locator('#calendar-results');
    await expect(status).toBeEmpty();
    expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // The only match sits past several pages of the server, and accents and case do not matter.
    await search.focus();
    await page.keyboard.type('INFORMATICA');
    await expect(page).toHaveURL(/busca=INFORMATICA/);
    await expect(search).toBeFocused();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('Lista 230');
    await expect(status).toHaveText('1 calendário encontrado.');

    await page.reload();
    await expect(search).toHaveValue('INFORMATICA');
    await expect(rows).toContainText('Lista 230');

    // The situation combines with the search and starts the list over.
    await page.locator('#status-filter').selectOption('rascunho');
    await expect(page).toHaveURL(/situacao=rascunho/);
    await expect(rows).toContainText('Lista 230');
    await page.locator('#status-filter').selectOption('vigente');
    const clear = page.getByRole('button', { name: 'Limpar filtros' });
    await expect(clear).toBeVisible();
    await expect(page.locator('#calendar-list')).toContainText(
      'Nenhum calendário corresponde aos filtros.',
    );
    await expect(status).toHaveText('Nenhum calendário corresponde aos filtros.');
    await page.reload();
    await expect(page.locator('#status-filter')).toHaveValue('vigente');
    await expect(clear).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);

    // Clearing takes the button away, so the focus returns to the search.
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await expect(page.locator('#status-filter')).toHaveValue('');
    await expect(page).toHaveURL(origin + '/calendarios?long-list=1');
    await expect(rows).toHaveCount(50);

    // A status alone comes from full server pages and keeps "load more".
    await page.locator('#status-filter').selectOption('vigente');
    await expect(rows).toHaveCount(50);
    await expect(status).toContainText('50 calendários encontrados até aqui');
    await page.getByRole('button', { name: 'Carregar mais calendários' }).click();
    await expect(rows).not.toHaveCount(50);
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test(`the campus gallery has search and situation, without a campus to choose, at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/calendarios?role=CAMPUS');
    await expect(page.locator('.calendar-list[data-view="gallery"]')).toBeVisible();
    await expect(page.locator('#campus-filter')).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Buscar' }).fill('sem correspondencia');
    await expect(page.locator('#calendar-list')).toContainText(
      'Nenhum calendário corresponde aos filtros.',
    );
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(page.locator('#calendar-list')).toContainText('Calendário de teste');
    await expect(page).toHaveURL(/role=CAMPUS/);
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test(`account search keeps personal data out of the URL at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/contas');
    const rows = page.locator('#user-list > li');
    const status = page.locator('#account-results');
    await expect(rows).toHaveCount(4);
    await expect(status).toHaveText('4 contas');

    const search = page.getByRole('searchbox', { name: 'Buscar' });
    expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await search.fill('PARECER@example');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('Pessoa parecerista');
    await expect(status).toHaveText('1 de 4 contas');
    await search.fill('pessoa');
    await expect(status).toHaveText('3 de 4 contas');
    await expect(page).toHaveURL(origin + '/contas');

    await page.locator('#account-role-filter').selectOption('PARECERISTA');
    await expect(page).toHaveURL(origin + '/contas?perfil=PARECERISTA');
    await expect(status).toHaveText('1 de 4 contas');
    await page.reload();
    await expect(page.locator('#account-role-filter')).toHaveValue('PARECERISTA');
    await expect(status).toHaveText('1 de 4 contas');

    await search.fill('ninguem');
    await expect(status).toHaveText('0 de 4 contas');
    const clear = page.getByRole('button', { name: 'Limpar busca' });
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(search).toBeFocused();
    await expect(rows).toHaveCount(4);
    await expect(page).toHaveURL(origin + '/contas');
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test(`institutional events are searched by name and source at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/eventos-institucionais');
    await page.evaluate(() => {
      const catalogue = window.portalRouterTest.catalogue;
      const [event] = catalogue.events;
      window.portalRouterTest.publishCatalogue({
        ...catalogue,
        events: [
          event,
          {
            ...event,
            id: 'with-link',
            name: 'Paixão de Cristo',
            evidence: 'Lei federal, ver https://example.invalid/lei?id=1.',
          },
          { ...event, id: 'unsafe', name: 'Tiradentes', evidence: 'javascript:alert(1)' },
        ],
      });
    });
    const rows = page.locator('#catalogue-list > li');
    await expect(rows).toHaveCount(3);
    const status = page.locator('#catalogue-results');
    await expect(status).toBeEmpty();

    const search = page.getByRole('searchbox', { name: 'Buscar' });
    await search.fill('PAIXAO');
    await expect(rows).toHaveCount(1);
    await expect(status).toHaveText('1 de 3 eventos');
    const link = rows.getByRole('link', { name: 'https://example.invalid/lei?id=1' });
    await expect(link).toHaveAttribute('href', 'https://example.invalid/lei?id=1');
    // A reference inside the text, not one of the record's button-like links.
    await expect(link).toHaveCSS('display', 'inline');
    await expect(link).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(link).toHaveAttribute('rel', 'noreferrer');
    await expect(rows).toContainText('Lei federal, ver');

    // By source, and a source in another scheme stays as text.
    await search.fill('JAVASCRIPT');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('javascript:alert(1)');
    await expect(rows.getByRole('link')).toHaveCount(0);

    // Editing an event and coming back keeps the search.
    await expect(page).toHaveURL(/busca=JAVASCRIPT/);
    await page.locator('[data-edit="unsafe"]').click();
    await page.locator('#cancel-catalogue').click();
    await expect(search).toHaveValue('JAVASCRIPT');
    await expect(rows).toHaveCount(1);

    await search.fill('sem correspondencia');
    await expect(rows).toHaveCount(0);
    const clear = page.getByRole('button', { name: 'Limpar busca' });
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(search).toBeFocused();
    await expect(rows).toHaveCount(3);
    await expect(page).toHaveURL(origin + '/eventos-institucionais');
    expect(await noHorizontalScroll(page)).toBe(true);
  });
}

for (const [width, oneRow] of [
  [1400, false],
  [1800, true],
] as const)
  test(`calendar filters line up, with the actions ${oneRow ? 'beside' : 'below'} them, at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/calendarios');
    const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
    const search = await box('#calendar-search');
    for (const selector of ['#status-filter', '#campus-filter']) {
      const control = await box(selector);
      expect(control.height).toBe(search.height);
      expect(control.y).toBe(search.y);
    }
    const labels = await box('.search-field');
    expect((await box('#status-filter-label')).y).toBe(labels.y);
    expect((await box('#filter-label')).y).toBe(labels.y);
    const action = await box('.page-action');
    const actionBottom = action.y + action.height;
    if (oneRow) expect(Math.abs(actionBottom - search.y - search.height)).toBeLessThan(2);
    else expect(action.y).toBeGreaterThanOrEqual(search.y + search.height);
    expect(await noHorizontalScroll(page)).toBe(true);
  });

test('filters survive a visit to the trash', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/calendarios?situacao=rascunho&busca=teste');
  await expect(page.locator('#calendar-list')).toContainText('Calendário de teste');
  await page.getByRole('link', { name: 'Lixeira', exact: true }).click();
  await page.getByRole('link', { name: 'Voltar aos calendários' }).click();
  await expect(page.locator('#status-filter')).toHaveValue('rascunho');
  await expect(page.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('teste');
});
