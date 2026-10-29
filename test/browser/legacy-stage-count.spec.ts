import { test, expect } from './test.ts';
import { savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390])
  for (const count of [2, 3, 4] as const)
    test(`historical total ${count} requires explicit cycle configuration at ${width}px`, async ({
      page,
      fixtureServer,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(await fixtureServer('editor'));
      await expect(page.locator('#record-title')).toBeVisible();
      await page.evaluate((count) => {
        const { record } = window.editorTest;
        record.state.offers[0].organization = 'a-classificar';
        delete record.state.offers[0].stages;
        record.state.offers[0].legacyStageCount = count;
        record.state.events = Array.from({ length: count }, (_, index) => ({
          id: `preserved-stage-${index + 1}`,
          name: `${index + 1}ª etapa preservada`,
          requirementId: `stage-${index + 1}:integrado`,
          offers: ['integrado'],
          kind: 'note' as const,
          category: 'limite',
          start: `2027-0${index + 2}-01`,
          end: `2027-0${index + 2}-20`,
        }));
        record.version++;
        return window.publishReviewerCalendar();
      }, count);
      await selectEditorSection(page, 'periods');
      await expect(page.locator('[data-legacy-stage-count]')).toContainText(
        `${count} etapas do formato anterior preservadas`,
      );
      await page.locator('[data-edit-organization="integrado"]').click();
      await expect(page.locator('#offer-integrado-organization')).toHaveValue('');
      await expect(page.locator('#offer-integrado-count')).toHaveValue('');
      await expect(page.locator('#offer-integrado-apply')).toBeDisabled();
      await page.locator('#offer-integrado-organization').selectOption('anual');
      await page.locator('#offer-integrado-count').selectOption(String(count));
      await page.locator('#offer-integrado-period-0-start').fill('2027-02-01');
      await page.locator('#offer-integrado-period-0-end').fill('2027-12-17');
      await expect(page.locator('#offer-integrado-apply')).toBeEnabled();
      await page.locator('#offer-integrado-apply').click();
      const saved = await savedState(page);
      expect(saved.state.offers[0]).not.toHaveProperty('legacyStageCount');
      expect(saved.state.offers[0]).toMatchObject({
        organization: 'anual',
        stages: { perTerm: count },
      });
      await expect(page.locator('[data-legacy-stage-count]')).toHaveCount(0);
    });
