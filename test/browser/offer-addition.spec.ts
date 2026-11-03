import { test, expect } from './test.ts';
import { configureOffer, savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { readCalendarDates } from '../../src/domain/calendar/civil-dates.ts';

for (const width of [1440, 390]) {
  test(`a new offer is included only with its complete organization at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    const original = await page.evaluate(() => structuredClone(window.editorTest.record.state));
    await selectEditorSection(page, 'periods');
    await expect(page.locator('.offer-organization')).toHaveCount(1);
    // Creation sits beside the step heading, as in the Activities step.
    await expect(page.locator('.editor-section-heading #add-offer')).toBeVisible();
    await page.locator('#add-offer').click();
    await page.locator('#offer-new-kind').selectOption('graduacao');
    await page.locator(`#offer-new-organization [data-choice="anual"]`).click();
    await page.locator('#offer-new-period-0-start').fill('2027-03-01');
    await expect(page.locator('#offer-new-apply')).toBeDisabled();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    expect(
      await page.evaluate(() => window.editorTest.record.state.offers.map((offer) => offer.id)),
    ).toEqual(['integrado']);
    await expect(page.locator('#unapplied-status')).toBeVisible();
    await page.locator('#offer-new-cancel').click();
    await expect(page.locator('#add-offer')).toBeFocused();
    await expect(page.locator('#offer-new-form')).toHaveCount(0);
    await expect(page.locator('#unapplied-status')).toBeHidden();
    expect(
      await page.evaluate(() => window.editorTest.record.state.offers.map((offer) => offer.id)),
    ).toEqual(['integrado']);
    await configureOffer(page, 'graduacao', '2027-03-01', '2027-03-26');
    const saved = await savedState(page);
    expect(saved.state.offers.map((offer) => offer.id)).toEqual(['integrado', 'graduacao']);
    expect(saved.state.periods[0].association).toEqual({
      status: 'defined',
      offers: ['graduacao'],
      term: 'annual',
    });
    expect(
      saved.state.events.filter(
        (event) =>
          event.activity && 'offerId' in event.activity && event.activity.offerId === 'graduacao',
      ),
    ).toHaveLength(2);
    expect(
      saved.state.events.filter((event) => original.events.some((old) => old.id === event.id)),
    ).toEqual(original.events);
    await expect(page.locator('[data-offer="graduacao"]')).not.toContainText('Não incluída');
    await expect(page.locator('[data-edit-organization="graduacao"]')).toHaveText('Editar');
    // Native tests verify persisted storage; this fixture resets its module state on reload.
    await selectEditorSection(page, 'events');
    await selectEditorSection(page, 'periods');
    await expect(page.locator('[data-offer="graduacao"]')).toContainText('2 etapas no ano');
    await expect(page.locator('[data-edit-organization="graduacao"]')).toHaveText('Editar');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

/** Count of one offer over the local dates, as the editor counts it without the base. */
function teachingDays(state: Window['editorTest']['record']['state'], offerId: string) {
  const dated = readCalendarDates(state);
  return evaluateCalendar(dated, dated.events).byOffer[offerId];
}

for (const width of [1440, 390]) {
  test(`a new offer neither extends nor confirms earlier scopes and keeps their count at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    // A date converted from format 4 without offers (unconfirmed) and one chosen by the campus.
    await page.evaluate(async () => {
      const { record } = window.editorTest;
      record.state.periods = [
        {
          id: 'integrated-year',
          name: 'Ano letivo',
          start: '2027-02-01',
          end: '2027-12-17',
          association: { status: 'defined', offers: ['integrado'], term: 'annual' },
        },
      ];
      record.state.events = [
        {
          id: 'legacy-holiday',
          name: 'Feriado municipal convertido',
          start: '2027-03-10',
          end: '2027-03-10',
          effect: 'exclude',
          category: 'feriado',
          scope: { offers: ['integrado'], confirmed: false },
        },
        {
          id: 'chosen-holiday',
          name: 'Recesso escolhido pelo campus',
          start: '2027-03-11',
          end: '2027-03-11',
          effect: 'exclude',
          category: 'recesso',
          scope: { offers: ['integrado'], confirmed: true },
        },
      ];
      record.version++;
      await window.publishReviewerCalendar();
    });
    const original = await page.evaluate(() => structuredClone(window.editorTest.record.state));
    const integrated = teachingDays(original, 'integrado');
    await selectEditorSection(page, 'periods');
    await configureOffer(page, 'graduacao', '2027-03-01', '2027-03-26');
    const saved = await savedState(page);
    expect(saved.state.offers.map((offer) => offer.id)).toEqual(['integrado', 'graduacao']);
    expect(
      saved.state.events.filter((event) => original.events.some((old) => old.id === event.id)),
    ).toEqual(original.events);
    const counted = teachingDays(saved.state, 'integrado');
    expect(counted.total).toBe(integrated.total);
    expect(counted.ledger).toEqual(integrated.ledger);
    // Neither date reaches the new offer: its days stay counted.
    const undergraduate = teachingDays(saved.state, 'graduacao');
    for (const date of ['2027-03-10', '2027-03-11'])
      expect(undergraduate.ledger.find((day) => day.date === date)?.counted).toBe(true);
  });
}
