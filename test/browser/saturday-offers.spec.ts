import { test, expect } from './test.ts';
import { savedState, selectEditorSection } from './editor-navigation.ts';
import type { Page } from '@playwright/test';
import type {} from '../fixtures/editor-client.ts';

async function openStep(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('#record-title')).toBeVisible();
  await selectEditorSection(page, 'days');
}
const offer = (page: Page, id: string) =>
  page.locator(`#saturday-offers [data-saturday-offer="${id}"]`);
const editOffer = (page: Page, id: string) =>
  page.locator(`#saturday-edit-offers [data-saturday-offer="${id}"]`);
const check = (page: Page, date: string) =>
  page.locator(`#saturday-dates input[value="${date}"]`).check();
const saturdays = async (page: Page) =>
  (await savedState(page)).state.events.filter((event) => event.category === 'sabado');
const annual = async (page: Page, label: string) =>
  page.locator('.teaching-day-current', { hasText: label }).locator('strong').textContent();

for (const width of [1440, 390]) {
  const compact = width === 390;
  const openPanel = async (page: Page) => {
    if (compact) await page.locator('#saturday-open-panel').click();
  };

  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: compact ? 844 : 1000 });
    });

    test('an offer without periods is named and does not block the other one', async ({
      page,
      fixtureServer,
    }) => {
      await openStep(page, await fixtureServer('editor-offer-without-periods'));
      await expect(page.locator('#saturday-prerequisites')).toContainText(
        'Graduação sem período letivo',
      );
      await expect(page.locator('#saturday-prerequisites').getByRole('link')).toHaveText(
        'Organização por oferta',
      );
      // Available for the offer with periods, and the date says who stays out.
      const date = page.locator('#saturday-dates input[value="2027-03-06"]');
      await expect(date).toBeEnabled();
      await expect(date).toHaveAttribute('aria-label', /Graduação: sem período letivo nesta data/);
      // No offer in period: the blocked date names them, in text visible on a touch screen.
      await expect(page.locator('[data-saturday="2027-01-02"]')).toHaveAttribute(
        'data-status',
        'outside',
      );
      await expect(
        page
          .locator('.saturday-month', { hasText: 'Janeiro' })
          .locator('[data-saturday-period-note]'),
      ).toHaveText(
        '2, 9, 16, 23, 30 Técnico integrado e Graduação: sem período letivo nestas datas',
      );

      await check(page, '2027-03-06');
      await openPanel(page);
      await expect(offer(page, 'integrado').locator('input')).toBeChecked();
      await expect(offer(page, 'graduacao').locator('input')).toBeDisabled();
      await expect(offer(page, 'graduacao')).toContainText(
        'Sem período letivo nas datas selecionadas',
      );
      await page.locator('#saturday-name').fill('Reposição');
      await page.locator('#saturday-submit').click();
      await expect
        .poll(async () => (await saturdays(page)).map((e) => e.offers))
        .toEqual([['integrado']]);
    });

    test('a date is applied only to the marked offers and the other count stays', async ({
      page,
      fixtureServer,
    }) => {
      await openStep(page, await fixtureServer('editor-mixed-offers'));
      const integrated = await annual(page, 'Técnico integrado');
      const undergraduate = await annual(page, 'Graduação');
      await check(page, '2027-03-06');
      await openPanel(page);
      await expect(offer(page, 'integrado').locator('input')).toBeChecked();
      const graduation = offer(page, 'graduacao').locator('input');
      await expect(graduation).toBeChecked();
      await graduation.focus();
      await page.keyboard.press('Space');
      await expect(graduation).not.toBeChecked();
      // The control and its whole label are a comfortable target, on both layouts.
      const box = await offer(page, 'integrado').boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await page.locator('#saturday-name').fill('Só para o técnico');
      await page.locator('#saturday-submit').click();
      await expect
        .poll(async () => (await saturdays(page)).map((e) => e.offers))
        .toEqual([['integrado']]);
      await expect.poll(() => annual(page, 'Técnico integrado')).not.toBe(integrated);
      expect(await annual(page, 'Graduação')).toBe(undergraduate);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });

    test('dates with different possible offers say what stays out', async ({
      page,
      fixtureServer,
    }) => {
      await openStep(page, await fixtureServer('editor-mixed-offers'));
      await expect(
        page
          .locator('.saturday-month', { hasText: 'Julho' })
          .locator('[data-saturday-period-note]'),
      ).toContainText('Graduação: sem período letivo nestas datas');
      await check(page, '2027-03-06');
      await check(page, '2027-07-17');
      await openPanel(page);
      await expect(offer(page, 'graduacao')).toContainText(
        'Sem período letivo em 17 jul: esta data fica de fora.',
      );
      await page.locator('#saturday-name').fill('Reposição');

      // With no marked offer for one date the panel says so and adding it is refused.
      await offer(page, 'integrado').locator('input').uncheck();
      await expect(page.locator('#saturday-unreached')).toContainText('17 jul');
      await page.locator('#saturday-submit').click();
      await expect(page.locator('#saturday-panel [role="alert"]')).toContainText(
        'nenhuma oferta marcada',
      );
      expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);

      await offer(page, 'integrado').locator('input').check();
      await expect(page.locator('#saturday-unreached')).toBeHidden();
      await page.locator('#saturday-submit').click();
      await expect
        .poll(async () => (await saturdays(page)).map((event) => [event.start, event.offers]))
        .toEqual([
          ['2027-03-06', ['integrado', 'graduacao']],
          ['2027-07-17', ['integrado']],
        ]);
    });

    test('editing shows and adjusts the offers of a registered Saturday', async ({
      page,
      fixtureServer,
    }) => {
      await openStep(page, await fixtureServer('editor-mixed-offers'));
      await check(page, '2027-07-17');
      await check(page, '2027-03-06');
      await openPanel(page);
      await offer(page, 'integrado').locator('input').uncheck();
      await offer(page, 'integrado').locator('input').check();
      await page.locator('#saturday-name').fill('Reposição');
      await page.locator('#saturday-submit').click();

      // A stored partial Saturday is marked in the grid and listed with its offers.
      const july = page.locator('[data-saturday="2027-07-17"] [data-edit-saturday]');
      await expect(july).toHaveAttribute('aria-label', /vale para Técnico integrado/);
      await july.click();
      await expect(editOffer(page, 'integrado').locator('input')).toBeChecked();
      const out = editOffer(page, 'graduacao');
      await expect(out.locator('input')).toBeDisabled();
      await expect(out).toContainText('Sem período letivo nesta data.');
      await page.locator('#saturday-edit-close').click();

      await page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]').click();
      const graduation = editOffer(page, 'graduacao').locator('input');
      await expect(graduation).toBeChecked();
      await graduation.uncheck();
      await expect(page.locator('#saturday-edit-discard')).toBeVisible();
      // Checking it again returns to what is saved: nothing is left to apply.
      await graduation.check();
      await expect(page.locator('#saturday-edit-discard')).toBeHidden();
      await graduation.uncheck();
      await page.locator('#saturday-edit-save').click();
      await expect
        .poll(
          async () => (await saturdays(page)).find((event) => event.start === '2027-03-06')?.offers,
        )
        .toEqual(['integrado']);
    });

    test('a calendar with one offer has nothing to choose', async ({ page, fixtureServer }) => {
      await openStep(page, await fixtureServer('editor-reviewer-saturdays'));
      await page.locator('[data-saturday="2027-03-06"] button').click();
      await expect(page.locator('#saturday-edit-name')).toBeVisible();
      await expect(page.locator('#saturday-edit-offers')).toHaveCount(0);
    });

    test('with no offer in period the empty state names them and the place to correct', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor-offer-without-periods'));
      await expect(page.locator('#record-title')).toBeVisible();
      await page.evaluate(() => {
        window.editorTest.record.state.periods = [];
        window.editorTest.record.version += 1;
        return window.publishReviewerCalendar();
      });
      await selectEditorSection(page, 'days');
      const empty = page.locator('#saturday-none-available');
      await expect(empty).toContainText('Técnico integrado e Graduação sem período letivo');
      await expect(empty.getByRole('link')).toHaveText('Organização por oferta');
      await expect(page.locator('#saturday-prerequisites')).toContainText(
        'Nenhum sábado pode ser selecionado ainda',
      );
    });
  });
}
