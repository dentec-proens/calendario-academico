import { test, expect } from './test.ts';
import { openActivity, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`a current 2026 review is reflected in its activity card at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
    await page.evaluate(() => {
      const { record } = window.editorTest;
      record.year = record.state.year = 2026;
      record.state.rulesetVersion = 'legacy-2026-v1';
      record.state.events = [];
      record.institutionalEvents = record.institutionalSnapshot = [];
      record.readiness.humanReview = { current: false, reviewedCriterionIds: [] };
      record.version++;
      return window.publishReviewerCalendar();
    });
    await selectEditorSection(page, 'events');
    await openActivity(page, 'family-meeting');
    const card = page.locator('#event-panel .activity-details');
    await expect(card).toContainText('Conferência humana: aguardando revisão atualizada');
    await page.evaluate(() => {
      window.editorTest.record.readiness.humanReview = {
        current: true,
        reviewedCriterionIds: ['XVI'],
      };
      return window.publishReviewerCalendar();
    });
    await expect(card).toContainText('Conferência humana: revisado no conjunto vigente');
    await expect(card).not.toContainText('aguardando revisão atualizada');
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  });

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
