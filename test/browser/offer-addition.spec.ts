import { test, expect } from './test.ts';
import { configureOffer, savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

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
      saved.state.events.filter((event) => event.requirementId?.endsWith(':graduacao')),
    ).toHaveLength(2);
    expect(
      saved.state.events.filter((event) => original.events.some((old) => old.id === event.id)),
    ).toEqual(original.events);
    await expect(page.locator('[data-offer="graduacao"]')).not.toContainText('Não incluída');
    await expect(page.locator('[data-edit-organization="graduacao"]')).toHaveText(
      'Editar organização',
    );
    // Native tests verify persisted storage; this fixture resets its module state on reload.
    await selectEditorSection(page, 'events');
    await selectEditorSection(page, 'periods');
    await expect(page.locator('[data-offer="graduacao"]')).toContainText('2 etapas no ano');
    await expect(page.locator('[data-edit-organization="graduacao"]')).toHaveText(
      'Editar organização',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
