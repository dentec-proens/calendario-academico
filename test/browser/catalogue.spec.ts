import { test, expect } from './test.ts';
import type {} from '../fixtures/portal-router-client.ts';

for (const width of [1440, 390, 320]) {
  test(`institutional dates and status toggle are clear and usable at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/eventos-institucionais');
    const row = page.locator('#catalogue-list li').first();
    await expect(row.locator('.catalogue-date')).toHaveText('1 de janeiro de 2027');
    await expect(row).toContainText('Feriado · Técnico integrado');
    await expect(row).toContainText('Fonte: Fonte de teste');

    for (const [start, end, label] of [
      ['2027-12-20', '2027-12-24', '20 a 24 de dezembro de 2027'],
      ['2027-01-30', '2027-02-02', '30 de janeiro a 2 de fevereiro de 2027'],
      ['2027-12-20', '2028-01-02', '20 de dezembro de 2027 a 2 de janeiro de 2028'],
    ]) {
      await page.evaluate(
        ({ start, end }) => {
          const catalogue = window.portalRouterTest.catalogue;
          window.portalRouterTest.publishCatalogue({
            ...catalogue,
            revision: catalogue.revision + 1,
            events: catalogue.events.map((event) => ({ ...event, start, end })),
          });
        },
        { start, end },
      );
      await expect(row.locator('.catalogue-date')).toHaveText(label);
    }

    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    const toggle = page.getByRole('switch', { name: 'Evento ativo', exact: true });
    await expect(toggle).toBeChecked();
    await expect(toggle).toContainText('Ativo');
    await expect(page.locator('#catalogue-form .help')).toHaveCount(0);
    await expect(toggle).toBeInViewport();
    expect(
      await toggle.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.height >= 44 &&
          element.contains(
            document.elementFromPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            ),
          )
        );
      }),
    ).toBe(true);
    await page.getByRole('heading', { name: 'Editar evento institucional', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toContainText('Inativo');
    await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click();
    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await page.locator('#cancel-catalogue').click();
    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(toggle).toBeChecked();
    await toggle.click();
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page).toHaveURL(origin + '/eventos-institucionais');
    await expect(row).toContainText('Inativo');
    expect(await page.evaluate(() => window.portalRouterTest.catalogue.events[0].active)).toBe(
      false,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
