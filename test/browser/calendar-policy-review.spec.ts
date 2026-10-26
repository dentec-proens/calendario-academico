import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
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
    const card = page.locator('[data-activity-row="family-meeting"]');
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
    const card = page.locator('[data-activity-row="enrolment-0"]');
    await expect(card).toContainText('Técnico integrado: Opcional');
    await expect(card).not.toContainText('Pendente de data e fonte');
    await page.evaluate(() => {
      const { record } = window.editorTest;
      record.modalities = record.state.modalities = ['integrado', 'graduacao'];
      record.state.organizationByModality = { integrado: 'anual', graduacao: 'anual' };
      record.version++;
      return window.publishReviewerCalendar();
    });
    await expect(card).toContainText('Graduação: Obrigatório · Planejamento pendente');
    await expect(card).toContainText('Técnico integrado: Opcional');
    await expect(card).not.toContainText('Pendente de data e fonte');
  });
}
