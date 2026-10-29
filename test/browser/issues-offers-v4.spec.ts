import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize-v4.ts';
import type { CalendarState } from '../../web/features/calendar-editor/types.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`calendar checks identify each undergraduate offer at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    const state = normalizeOfferCalendar(calendarOffersV4Fixture()) as CalendarState;
    await page.evaluate(async (state) => {
      const { record } = window.editorTest;
      record.state = { ...state, campus: record.state.campus };
      record.offerKinds = ['integrado', 'graduacao'];
      record.version++;
      await window.publishReviewerCalendar();
    }, state);
    await selectEditorSection(page, 'issues');
    for (const label of [
      'Licenciatura em Química',
      'Engenharia Elétrica',
      'Tecnologia em Análise de Sistemas',
    ]) {
      await expect(page.locator('#goal')).toContainText(label);
      await expect(
        page
          .locator('#issue-list .issue-item strong')
          .filter({ hasText: new RegExp(`^${label} —`) })
          .first(),
      ).toBeVisible();
    }
    await expect(page.locator('#issue-list')).not.toContainText('undefined');
    await page.evaluate(async () => {
      const { record } = window.editorTest;
      record.state.offers = record.state.offers.map((offer) =>
        offer.id === 'graduacao-2'
          ? { ...offer, organization: 'a-classificar', stages: undefined }
          : offer,
      );
      record.state.periods = record.state.periods.map((period) =>
        period.association.status === 'defined' && period.association.offers.includes('graduacao-2')
          ? { ...period, association: { status: 'a-classificar' } }
          : period,
      );
      record.version++;
      await window.publishReviewerCalendar();
    });
    await expect(page.locator('#issue-list')).toContainText('Organização — Engenharia Elétrica');
    await expect(page.locator('#issue-list')).not.toContainText('undefined');
  });
}
