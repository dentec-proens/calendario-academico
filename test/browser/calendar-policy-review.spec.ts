import { test, expect } from './test.ts';
import { openActivity, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`optional veterans activities have no contradictory missing-date instruction at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'events');
    await openActivity(page, 'enrolment-0');
    const card = page.locator('#event-panel .activity-details');
    await expect(card).toContainText('Técnico integrado: Opcional');
    await expect(card).not.toContainText('Pendente de data e fonte');
    await page.evaluate(() => {
      const { record } = window.editorTest;
      record.state.offers = (['integrado', 'graduacao'] as const).map((kind) => ({
        id: kind,
        kind,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      }));
      record.offerKinds = record.state.offers.map((offer) => offer.kind);
      record.state.offers = record.state.offers.map((offer) => ({
        ...offer,
        organization:
          offer.id === 'integrado'
            ? ('anual' as const)
            : offer.id === 'graduacao'
              ? ('anual' as const)
              : ('a-classificar' as const),
      }));
      record.version++;
      return window.publishReviewerCalendar();
    });
    await expect(card).toContainText('Graduação: Obrigatório · Planejamento pendente');
    await expect(card).toContainText('Técnico integrado: Opcional');
    await expect(card).not.toContainText('Pendente de data e fonte');
  });
}
