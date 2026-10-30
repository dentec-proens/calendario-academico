import { test, expect } from './test.ts';
import type {} from '../fixtures/review-session-client.ts';

for (const loading of ['bootstrap', 'authentication'] as const) {
  test(`review observations survive calendar campus filters and transient ${loading} loading`, async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(await fixtureServer('review-session'));
    await page.locator('[data-open-review]').first().click();
    const criterion = page.locator('#review-items > li').first();
    await criterion.locator('[data-choice="NAO_ATENDIDO"]').click();
    await criterion.locator('.review-item__notes summary').click();
    await criterion.locator('textarea').fill('Observação ainda não salva após filtrar campus.');
    await page.locator('[data-page="calendars"]').click();
    await page.locator('#campus-filter').selectOption('other-campus');
    await expect(page.locator('[data-delete-calendar="synthetic-review"]')).toHaveCount(0);
    await page.evaluate((mode) => {
      if (mode === 'bootstrap') window.reviewSessionTest.bootstrapLoading(true);
      else window.reviewSessionTest.authenticationLoading(true);
    }, loading);
    await expect(page.locator('#account')).toContainText('Verificando sessão');
    await page.evaluate((mode) => {
      if (mode === 'bootstrap') window.reviewSessionTest.bootstrapLoading(false);
      else window.reviewSessionTest.authenticationLoading(false);
    }, loading);
    await expect(page.locator('#campus-filter')).toHaveValue('other-campus');
    await page.locator('#campus-filter').selectOption('');
    await page.locator('[data-page="review-panel"]').click();
    await page.locator('[data-open-review="synthetic-review"]').click();
    await expect(page.locator('#review-items > li').first().locator('textarea')).toHaveValue(
      'Observação ainda não salva após filtrar campus.',
    );
    await expect(
      page.locator('#review-items > li').first().locator('[data-choice="NAO_ATENDIDO"]'),
    ).toHaveAttribute('aria-checked', 'true');
  });
}
