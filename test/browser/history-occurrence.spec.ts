import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-event-drafts-client.ts';

for (const width of [1440, 390]) {
  test(`a heading-year occurrence links to the existing manual event only after confirmation at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
    await page.evaluate(() => {
      const { record } = window.editorTest;
      record.state.events = [
        {
          id: 'manual-prior',
          name: 'Feriado municipal',
          start: '2026-05-01',
          end: '2026-05-01',
          kind: 'note',
          recordType: 'prior-reference',
          evidence: 'Fonte manual sintética',
          modalities: ['integrado'],
        },
      ];
      const { analysis } = window.editorHistoryTest;
      analysis.pages[0].text = 'MAIO 2026\n01 Feriado municipal';
      analysis.candidates[0].excerpt = '01 Feriado municipal';
      Object.assign(analysis.candidates[0].dates!, {
        sourceYear: null,
        endYear: null,
        headerYear: 2026,
        yearSource: 'heading',
      });
      record.version++;
      return window.publishReviewerCalendar();
    });
    const before = await page.evaluate(() => window.editorTest.record.state.events[0]);
    await selectEditorSection(page, 'history');
    await page.locator('[data-analyze-history="history-a"]').click();
    const candidate = page.locator('[data-history-item="0"]');
    await expect(candidate).toContainText('Possível registro existente: Feriado municipal');
    const link = candidate.getByRole('button', {
      name: 'Conferir e vincular procedência ao evento existente',
    });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#event-form-title')).toBeFocused();
    await expect(page.locator('#event-form-title')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#event-start')).toHaveValue('2026-05-01');
    await expect(page.locator('#event-end')).toHaveValue('2026-05-01');
    // Only provenance is linked; the existing record is shown for consultation.
    await expect(page.locator('#event-link-only')).toBeVisible();
    await expect(page.locator('#event-start')).toBeDisabled();
    await expect(page.locator('#event-evidence')).toBeDisabled();
    expect(
      await page.evaluate(() => window.editorTest.record.state.events[0].historicalSource),
    ).toBeUndefined();
    await expect(page.locator('#event-form button[type="submit"]')).toHaveText(
      'Aplicar vínculo ao registro existente',
    );
    await page.locator('#event-form button[type="submit"]').click();
    await expect
      .poll(() =>
        page.evaluate(() => window.editorTest.record.state.events[0].historicalSource?.analysisId),
      )
      .toBe('analysis-a');
    const events = await page.evaluate(() => window.editorTest.record.state.events);
    expect(events).toHaveLength(1);
    const { historicalSource: _linked, ...unchanged } = events[0];
    expect(unchanged).toEqual(before);
    expect(events[0]).toMatchObject({
      id: 'manual-prior',
      name: 'Feriado municipal',
      start: '2026-05-01',
      end: '2026-05-01',
      evidence: 'Fonte manual sintética',
    });
    await expect(candidate).toContainText('Registro vinculado');
  });
}
