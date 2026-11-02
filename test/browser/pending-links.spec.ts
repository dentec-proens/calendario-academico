import { test, expect } from './test.ts';
import { savedState, selectEditorSection } from './editor-navigation.ts';
import { ivaiporaDraft } from '../fixtures/pending-links-2027.ts';
import type {} from '../fixtures/editor-client.ts';

const linked = (events: { id: string; requirementId?: string }[]) =>
  Object.fromEntries(
    events.flatMap(({ id, requirementId }) => (requirementId ? [[id, requirementId]] : [])),
  );

for (const width of [1440, 390]) {
  test(`a draft with links to review saves, edits a pending date and confirms an offer at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    const fixture = ivaiporaDraft();
    await page.evaluate(async (state) => {
      const { record } = window.editorTest;
      record.offerKinds = ['integrado', 'subsequente'];
      Object.assign(record.state, state);
      record.version++;
      await window.publishReviewerCalendar();
    }, fixture);
    const links = linked(fixture.events);
    expect(Object.keys(links)).toHaveLength(11);

    // An unrelated change is saved with every link.
    await selectEditorSection(page, 'events');
    const annual = 'ivaipora-annual-final';
    await page.locator(`[data-open-event="${annual}"]`).click();
    await page.locator(`[data-edit-event="${annual}"]`).click();
    await page.locator('#event-name').fill('Registro anual revisado');
    await page.locator('#event-form button[type="submit"]').click();
    const unrelated = await savedState(page);
    expect(unrelated.saves).toBeGreaterThan(0);
    expect(linked(unrelated.state.events)).toEqual(links);
    await page.locator('#close-event-panel').click();

    // A pending date is edited: description and end change, the link stays.
    const pending = 'ivaipora-recognition-2';
    await page.locator(`[data-open-event="${pending}"]`).click();
    await page.locator(`[data-edit-event="${pending}"]`).click();
    await expect(page.locator('#event-panel #event-form')).toBeVisible();
    await page.locator('#event-name').fill('Reconhecimento revisado');
    await page.locator('#event-end').fill('2027-07-30');
    await page.locator('#event-form button[type="submit"]').click();
    const edited = await savedState(page);
    expect(linked(edited.state.events)).toEqual(links);
    expect(edited.state.events.find((event) => event.id === pending)).toMatchObject({
      name: 'Reconhecimento revisado',
      end: '2027-07-30',
      requirementId: 'recognition-2',
    });

    // Confirming the organization previews the dates to review and keeps their links.
    await page.locator('#close-event-panel').click();
    await selectEditorSection(page, 'periods');
    await page.locator('[data-edit-organization="integrado"]').click();
    await page.locator('#offer-integrado-organization [data-choice="anual"]').click();
    await page.locator('#offer-integrado-period-0-start').fill('2027-02-01');
    await page.locator('#offer-integrado-period-0-end').fill('2027-12-17');
    await page.locator('#offer-integrado-count [data-choice="2"]').click();
    for (const [index, [start, end]] of [
      ['2027-02-01', '2027-06-30'],
      ['2027-07-26', '2027-12-17'],
    ].entries()) {
      await page.locator(`#offer-integrado-stage-${index}-start`).fill(start);
      await page.locator(`#offer-integrado-stage-${index}-end`).fill(end);
    }
    const warnings = page.locator('#offer-integrado-link-warnings li');
    await expect(warnings).toHaveCount(11);
    await expect(warnings.first()).toContainText('ficará em Vínculo a conferir');
    await page.locator('#offer-integrado-apply').click();
    const organized = await savedState(page);
    expect(organized.saves).toBeGreaterThan(edited.saves);
    expect(organized.state.offers.find((offer) => offer.id === 'integrado')).toMatchObject({
      organization: 'anual',
      stages: { perTerm: 2 },
    });
    expect(linked(organized.state.events)).toMatchObject(links);
  });
}
