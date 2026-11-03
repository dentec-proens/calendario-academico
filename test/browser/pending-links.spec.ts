import { test, expect } from './test.ts';
import {
  activityKey,
  type ActivityRef,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { savedState, selectEditorSection } from './editor-navigation.ts';
import {
  ivaiporaAnnual,
  ivaiporaDraft,
  stagePositionsToConfirm,
} from '../fixtures/pending-links-2027.ts';
import type {} from '../fixtures/editor-client.ts';

const linked = (events: { id: string; activity?: unknown }[]) =>
  Object.fromEntries(
    events.flatMap(({ id, activity }) =>
      activity ? [[id, activityKey(activity as ActivityRef)]] : [],
    ),
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
    // No activity selector: the kept link is shown read-only.
    await expect(page.locator('#event-requirement')).toHaveCount(0);
    await expect(page.locator('#event-kept-link')).toContainText('recognition:cycle:second');
    await page.locator('#event-name').fill('Reconhecimento revisado');
    await page.locator('#event-end').fill('2027-07-30');
    await page.locator('#event-form button[type="submit"]').click();
    const edited = await savedState(page);
    expect(linked(edited.state.events)).toEqual(links);
    expect(edited.state.events.find((event) => event.id === pending)).toMatchObject({
      name: 'Reconhecimento revisado',
      end: '2027-07-30',
      activity: { activityId: 'recognition', term: 'second' },
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
      stages: { status: 'defined', perTerm: 2 },
    });
    expect(linked(organized.state.events)).toMatchObject(links);
  });
}

for (const width of [1440, 390]) {
  test(`the organization preview lists the stage positions left to review at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    const fixture = stagePositionsToConfirm();
    await page.evaluate(async (state) => {
      const { record } = window.editorTest;
      record.offerKinds = ['integrado', 'subsequente'];
      Object.assign(record.state, state);
      record.version++;
      await window.publishReviewerCalendar();
    }, fixture);
    await selectEditorSection(page, 'periods');
    await page.locator('[data-edit-organization="integrado"]').click();
    await page.locator('#offer-integrado-organization [data-choice="anual"]').click();
    await page.locator('#offer-integrado-count [data-choice="3"]').click();
    // Only the position a single date reports is filled; the duplicated one is left empty.
    await expect(page.locator('#offer-integrado-stage-0-start')).toHaveValue('2027-02-01');
    await expect(page.locator('#offer-integrado-stage-1-start')).toHaveValue('');
    await expect(page.locator('#offer-integrado-stage-2-start')).toHaveValue('');
    await page.locator('#offer-integrado-period-0-start').fill('2027-02-01');
    await page.locator('#offer-integrado-period-0-end').fill('2027-12-17');
    for (const [index, [start, end]] of [
      ['2027-05-03', '2027-07-30'],
      ['2027-08-02', '2027-12-17'],
    ].entries()) {
      await page.locator(`#offer-integrado-stage-${index + 1}-start`).fill(start);
      await page.locator(`#offer-integrado-stage-${index + 1}-end`).fill(end);
    }
    const warnings = page.locator('#offer-integrado-link-warnings li');
    await expect(warnings).toHaveText([
      '“Data sintética stage-two-a” ficará em Vínculo a conferir (Classificação pendente).',
      '“Data sintética stage-two-b” ficará em Vínculo a conferir (Classificação pendente).',
      '“Data sintética stage-four” ficará em Vínculo a conferir (Classificação pendente).',
    ]);
    await page.locator('#offer-integrado-apply').click();
    const organized = await savedState(page);
    expect(organized.saves).toBeGreaterThan(0);
    const saved = linked(organized.state.events);
    expect(saved).toMatchObject({
      'stage-one': 'stage:stage:annual:1:integrado',
      'results-one': 'results:stage:annual:1:integrado',
      'stage-two-a': linked(fixture.events)['stage-two-a'],
      'stage-two-b': linked(fixture.events)['stage-two-b'],
      'stage-four': linked(fixture.events)['stage-four'],
    });
  });
}

for (const width of [1440, 390]) {
  test(`one of the 21 audited dates has its linked activity corrected by keyboard at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    const fixture = ivaiporaAnnual();
    await page.evaluate(async (state) => {
      const { record } = window.editorTest;
      record.offerKinds = ['integrado', 'subsequente'];
      Object.assign(record.state, state);
      record.version++;
      await window.publishReviewerCalendar();
    }, fixture);
    await selectEditorSection(page, 'events');
    const review = page.locator('#link-review');
    await expect(review.locator('h4')).toHaveText('Vínculo a conferir (11)');
    const id = 'ivaipora-final-1';
    const original = fixture.events.find((event) => event.id === id)!;
    await review.locator(`[data-open-event="${id}"]`).click();
    await expect(page.locator('#link-review-reason')).toContainText('Classificação pendente');

    // Opening and cancelling by keyboard returns the focus to the action.
    const action = page.locator(`[data-change-activity="${id}"]`);
    await action.focus();
    await page.keyboard.press('Enter');
    const select = page.locator('#activity-change-select');
    await expect(select).toBeFocused();
    await expect(page.locator('#activity-change-confirm')).toBeDisabled();
    await page.locator('#activity-change-cancel').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#activity-change-form')).toHaveCount(0);
    await expect(action).toBeFocused();

    // The preview keeps the date and shows both links before anything is applied.
    await page.keyboard.press('Enter');
    await expect(select).toBeFocused();
    // The activity of the same declaration comes first.
    await expect(select.locator('option').nth(1)).toHaveText(/resultado final.*ano letivo/i);
    await select.selectOption({ index: 1 });
    const preview = page.locator('#activity-change-preview');
    await expect(preview).toContainText('Data sintética final-1 · 22/06/2027 a 22/06/2027');
    await expect(preview).toContainText('(sem alteração)');
    await expect(preview).toContainText('final:cycle:first — Classificação pendente');
    await expect(preview).toContainText('A data deixa Vínculo a conferir');
    // Nothing is applied before the confirmation.
    const before = await page.evaluate(() => ({
      state: window.editorTest.record.state,
      saves: window.editorTest.calls.saves,
    }));
    expect(before.state.events.find((event) => event.id === id)?.activity).toEqual(
      original.activity,
    );
    await page.keyboard.press('Tab');
    await expect(page.locator('#activity-change-confirm')).toBeFocused();
    await page.keyboard.press('Enter');

    const saved = await savedState(page);
    expect(saved.saves).toBeGreaterThan(before.saves);
    expect(saved.state.events.find((event) => event.id === id)).toEqual({
      ...original,
      activity: { activityId: 'final', term: 'annual' },
    });
    expect(linked(saved.state.events)).toEqual({
      ...linked(fixture.events),
      [id]: 'final:cycle:annual',
    });
    await expect(page.locator('#link-review-reason')).toHaveCount(0);
    await expect(page.locator(`[data-edit-event="${id}"]`)).toBeFocused();
    await expect(page.locator('#event-panel')).toContainText(
      'Atividade vinculada: Prazo de lançamento do resultado final',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator('#close-event-panel').click();
    await expect(review.locator('h4')).toHaveText('Vínculo a conferir (10)');
    await expect(review.locator(`[data-date-row="${id}"]`)).toHaveCount(0);
  });
}
