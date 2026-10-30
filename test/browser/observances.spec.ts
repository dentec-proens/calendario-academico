import { test, expect } from './test.ts';
import { savedState, selectCampusEvents, selectEditorSection } from './editor-navigation.ts';
import { inheritedEvents, initialCatalogue } from '../../src/domain/institution/catalogue.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`Servidor choices apply, preserve drafts and restore the reference at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    const events = inheritedEvents(initialCatalogue(), 2027, [
      { id: 'integrado', kind: 'integrado', delivery: 'presencial', organization: 'anual' },
    ]).map(({ deadlineAdjustment: _adjustment, kind, ...event }) => {
      if (kind !== 'exclude' && kind !== 'include' && kind !== 'note')
        throw Error('Efeito inválido no catálogo de teste.');
      return {
        id: event.id,
        name: event.name,
        start: event.start,
        end: event.end,
        kind,
        evidence: event.evidence,
        category: event.category,
        institutional: true,
        offers: event.offers,
      } as const;
    });
    await page.evaluate(async (base) => {
      window.editorTest.record.institutionalEvents = base;
      window.editorTest.record.institutionalSnapshot = structuredClone(base);
      await window.publishReviewerCalendar();
    }, events);
    await selectEditorSection(page, 'events');
    await selectCampusEvents(page);
    const opener = page.locator('#open-observance-public-servant-day');
    await opener.click();
    const date = page.locator('#observance-date-public-servant-day');
    await expect(page.locator('#observance-help-public-servant-day')).toHaveCount(0);
    await expect(date).not.toHaveAttribute('aria-describedby');
    await expect(date.locator('option')).toHaveText([
      '28/10/2027 — data institucional',
      '29/10/2027',
    ]);
    await date.selectOption('2027-10-29');
    expect(
      await page.evaluate(() => window.editorTest.record.state.observanceDates),
    ).toBeUndefined();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(date).toHaveValue('2027-10-29');
    await page.locator('#apply-observance-public-servant-day').click();
    expect((await savedState(page)).state.observanceDates).toEqual({
      'public-servant-day': '2027-10-29',
    });
    await page.locator('#reset-observance-public-servant-day').click();
    expect((await savedState(page)).state.observanceDates).toBeUndefined();
    await expect(date).toHaveValue('2027-10-28');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`an orphaned observance stays accessible and can be cleared at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await page.evaluate(async () => {
      const record = window.editorTest.record;
      record.state.observanceDates = { 'retired-observance': '2027-10-13' };
      record.version++;
      await window.publishReviewerCalendar();
    });
    await selectEditorSection(page, 'events');
    await selectCampusEvents(page);
    await page.locator('#open-orphan-observance-retired-observance').click();
    await expect(page.locator('#event-panel')).toContainText('não está disponível');
    await page.locator('#reset-observance-retired-observance').click();
    expect((await savedState(page)).state.observanceDates).toBeUndefined();
  });
}
