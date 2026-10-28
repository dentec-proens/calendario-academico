import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import {
  openActivity,
  savedState,
  selectCampusEvents,
  selectEditorSection,
  editCampusEvent,
} from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

// Data contracts of the step 6 flows: each test pins what is written, not how the form looks.

async function applyEvent(page: Page) {
  await page.locator('#event-form button[type="submit"]').click();
}

async function savedEvent(page: Page, match: (name: string, id: string) => boolean) {
  const { state } = await savedState(page);
  return state.events.find((event) => match(event.name, event.id));
}

test('a new activity record keeps the prepared link, offer, effect and category', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  const title = (await page
    .locator('[data-activity-row="family-meeting"] .activity-row-name')
    .textContent())!.trim();
  await openActivity(page, 'family-meeting');
  await page.locator('#event-start').fill('2027-05-08');
  await page.locator('#event-end').fill('2027-05-08');

  await applyEvent(page);
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.events.length))
    .toBe(3);
  const event = await savedEvent(page, (_, id) => !['local-event', 'activity-event'].includes(id));
  expect(event).toMatchObject({
    name: title,
    requirementId: 'family-meeting',
    kind: 'note',
    category: 'prazo',
    modalities: ['integrado'],
    start: '2027-05-08',
    end: '2027-05-08',
  });
  expect(event?.recordType ?? 'event').toBe('event');
});

test('editing a linked record that changes the count keeps its effect, category and identity', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.events.push({
      id: 'linked-exclusion',
      name: 'Encontro com recesso',
      requirementId: 'family-meeting',
      start: '2027-05-10',
      end: '2027-05-10',
      kind: 'exclude',
      category: 'recesso',
      modalities: ['integrado'],
    });
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'events');
  const original = await page.evaluate(() =>
    window.editorTest.record.state.events.find((event) => event.id === 'linked-exclusion'),
  );
  await openActivity(page, 'family-meeting');
  await page.locator('[data-edit-activity-event="linked-exclusion"]').click();
  await expect(page.locator('#event-kind')).toHaveValue('exclude');
  await page.locator('#event-name').fill('Encontro com recesso retificado');

  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find((event) => event.id === 'linked-exclusion')
            ?.name,
      ),
    )
    .toBe('Encontro com recesso retificado');
  const event = await savedEvent(page, (_, id) => id === 'linked-exclusion');
  const preserved = original!;
  expect(event).toMatchObject({ ...preserved, name: 'Encontro com recesso retificado' });
  expect(event).not.toHaveProperty('evidence');
});

test('a free admission notice is registered without an activity link', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Edital local de transferência');
  await chooseNoticeType(page);
  await page.locator('#event-admission-type').selectOption('transfer');
  await page.locator('#event-publication-status').selectOption('planned');
  await page.locator('#event-admission-year').fill('2027');
  await page.locator('#event-admission-term').selectOption('second');
  await page.locator('#event-start').fill('2027-05-03');
  await page.locator('#event-end').fill('2027-05-07');

  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events.some(
          (event) => event.name === 'Edital local de transferência',
        ),
      ),
    )
    .toBe(true);
  const event = await savedEvent(page, (name) => name === 'Edital local de transferência');
  expect(event).toMatchObject({
    kind: 'note',
    category: 'prazo',
    publicationStatus: 'planned',
    admission: { type: 'transfer', year: 2027, term: 'second' },
  });
  expect(event?.requirementId).toBeUndefined();
});

async function chooseNoticeType(page: Page) {
  await page.locator('#event-type-notice').check();
}

test('activity creation shows the known link as context and keeps it changeable', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  const title = (await page
    .locator('[data-activity-row="family-meeting"] .activity-row-name')
    .textContent())!.trim();
  await openActivity(page, 'family-meeting');
  await expect(page.locator('#event-activity-header')).toContainText('Vinculado a esta atividade');
  await expect(page.locator('#event-activity-header')).not.toContainText(title);
  await expect(page.locator('#event-hours')).toHaveCount(0);
  await expect(page.locator('#event-requirement')).toHaveCount(0);
  await expect(page.locator('#event-record-type')).toHaveCount(0);
  await expect(page.locator('#event-modalities')).toHaveText(/Técnico integrado/);
  await expect(page.locator('#event-modalities input')).toHaveCount(0);
  await expect(page.locator('#event-more-options')).not.toHaveAttribute('open');
  await expect(page.locator('#event-name')).toBeHidden();

  // A field hidden in the collapsed group is revealed when the browser rejects it.
  await page.locator('#event-more-options > summary').click();
  await page.locator('#event-name').fill('');
  await page.locator('#event-more-options > summary').click();
  await page.locator('#event-start').fill('2027-05-08');
  await page.locator('#event-end').fill('2027-05-08');

  await applyEvent(page);
  await expect(page.locator('#event-more-options')).toHaveAttribute('open', '');
  await expect(page.locator('#event-name')).toBeFocused();
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(2);
});

test('changing the activity link keeps the filled values until it is applied or removed', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  const title = (await page
    .locator('[data-activity-row="family-meeting"] .activity-row-name')
    .textContent())!.trim();
  await openActivity(page, 'family-meeting');
  await page.locator('#event-start').fill('2027-06-12');
  await page.locator('#event-end').fill('2027-06-12');

  await page.locator('#change-event-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#event-requirement')).toBeFocused();
  await page.locator('#event-requirement').selectOption('alumni-meeting');
  await expect(page.locator('#event-panel #event-form')).toBeVisible();
  await expect(page.locator('#event-panel-title')).toContainText('egressos');
  await expect(page.locator('#event-form')).toHaveCount(1);
  await expect(page.locator('#event-start')).toHaveValue('2027-06-12');
  await expect(page.locator('#event-evidence')).toHaveCount(0);

  await page.locator('#close-event-panel').click();
  await expect(page.locator('#event-panel')).toBeHidden();
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await expect(page.locator('#pending-event')).toBeVisible();
  await page.locator('#resume-pending-event').click();
  await expect(page.locator('#event-requirement')).toHaveValue('alumni-meeting');
  await expect(page.locator('#event-end')).toHaveValue('2027-06-12');
  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find(
            (event) => event.requirementId === 'alumni-meeting',
          )?.start,
      ),
    )
    .toBe('2027-06-12');
  const linked = await savedEvent(page, (_, id) => !['local-event', 'activity-event'].includes(id));
  // The description chosen at creation is not replaced by the new activity's name.
  expect(linked).toMatchObject({ name: title, start: '2027-06-12', end: '2027-06-12' });

  await page.locator('#close-event-panel').click();
  await openActivity(page, 'alumni-meeting');
  await page.locator(`[data-edit-activity-event="${linked!.id}"]`).click();
  await page.locator('#event-requirement').selectOption('');
  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          window.editorTest.record.state.events.find((event) => event.id === id)?.requirementId,
        linked!.id,
      ),
    )
    .toBeUndefined();
  await expect(page.locator('#event-list')).toContainText(title);
  const unlinked = await savedEvent(page, (_, id) => id === linked!.id);
  expect(unlinked).toMatchObject({ ...linked, requirementId: undefined });
});

test('the free event form opens in the side panel with a labelled offer group', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.modalities = record.state.modalities = ['integrado', 'graduacao'];
    record.state.organizationByModality = { integrado: 'anual', graduacao: 'anual' };
    record.state.assessmentStagesByModality = { integrado: 2 };
    record.version++;
    return window.publishReviewerCalendar();
  });
  // Periods and assessments are edited together, without an offer checkbox group.
  await selectEditorSection(page, 'assessments');
  await page.locator('[data-edit-organization="integrado"]').click();
  await expect(page.locator('[data-offer="integrado"] form')).toBeVisible();
  await expect(page.locator('[data-offer="integrado"] input[type="checkbox"]')).toHaveCount(0);
  await selectEditorSection(page, 'events');
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await expect(page.locator('#event-panel #event-form')).toBeVisible();
  const offers = page.locator('fieldset#event-modalities');
  await expect(offers.locator(':scope > legend')).toHaveText('Ofertas abrangidas');
  await expect(offers.locator('input')).toHaveCount(2);
  await expect(page.locator('#event-record-type')).toBeVisible();
  await expect(page.locator('#close-event-panel')).toHaveAccessibleName('Fechar painel');
  await expect(page.locator('#event-form .form-actions button')).toHaveCount(1);
  await expect(page.locator('#discard-event-form')).toBeHidden();
});

test('a free event asks what it is and the answer sets its effect and category', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await expect(page.locator('#event-type > legend')).toHaveText('O que é este evento?');
  await expect(page.locator('#event-kind')).toBeHidden();
  await page.locator('#event-name').fill('Feriado municipal sintético');
  await page.locator('#event-start').fill('2027-06-24');
  await page.locator('#event-end').fill('2027-06-24');

  // Applying without an answer is rejected by the form itself.
  await applyEvent(page);
  await expect(page.locator('#event-type-holiday')).toBeFocused();
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(2);
  await page.locator('#event-type-holiday').check();
  await page.locator('#event-more-options > summary').click();
  await expect(page.locator('#event-kind')).toHaveValue('exclude');
  await expect(page.locator('#event-category')).toHaveValue('feriado');
  await page.locator('#event-type-notice').check();
  await expect(page.locator('#event-admission-type')).toHaveAttribute('required', '');
  await page.locator('#event-type-recess').check();
  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events.find(
          (event) => event.name === 'Feriado municipal sintético',
        ),
      ),
    )
    .toMatchObject({ kind: 'exclude', category: 'recesso' });
});

test('a record with a freely combined effect and category shows both fields when edited', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.events.push({
      id: 'free-combination',
      name: 'Formação com efeito livre',
      start: '2027-04-12',
      end: '2027-04-12',
      kind: 'exclude',
      category: 'formacao',
      modalities: ['integrado'],
    });
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'events');
  await selectCampusEvents(page);
  await editCampusEvent(page, 'free-combination');
  await expect(page.locator('#event-type')).toHaveCount(0);
  await expect(page.locator('#event-kind')).toBeVisible();
  await expect(page.locator('#event-kind')).toHaveValue('exclude');
  await expect(page.locator('#event-category')).toHaveValue('formacao');
  await expect(page.locator('#event-panel #event-form')).toBeVisible();
});

test('answering another type after a notice keeps its draft but writes no notice data', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Recesso após edital');
  await page.locator('#event-type-notice').check();
  await page.locator('#event-admission-type').selectOption('transfer');
  await page.locator('#event-publication-status').selectOption('planned');
  await page.locator('#event-admission-year').fill('2027');
  await page.locator('#event-type-recess').check();
  await expect(page.locator('#event-admission-type')).toHaveCount(0);
  await page.locator('#event-type-notice').check();
  await expect(page.locator('#event-admission-type')).toHaveValue('transfer');
  await page.locator('#event-type-recess').check();
  await page.locator('#event-start').fill('2027-07-19');
  await page.locator('#event-end').fill('2027-07-23');

  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events.some((event) => event.name === 'Recesso após edital'),
      ),
    )
    .toBe(true);
  const event = await savedEvent(page, (name) => name === 'Recesso após edital');
  expect(event).toMatchObject({ kind: 'exclude', category: 'recesso' });
  expect(event?.admission).toBeUndefined();
  expect(event?.publicationStatus).toBeUndefined();
});

for (const width of [1440, 390])
  test(`event type options keep their compact size in a campus event draft at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'events');
    await selectCampusEvents(page);
    await page.locator('#new-event').click();
    for (const option of await page.locator('#event-type label').all()) {
      const [radio, label] = await Promise.all([
        option.locator('input').boundingBox(),
        option.boundingBox(),
      ]);
      expect(radio!.width).toBeLessThanOrEqual(24);
      expect(label!.x + label!.width).toBeLessThanOrEqual(width);
    }
  });

for (const width of [1440, 390])
  test(`an activity opens in the side panel and closes back to its row at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'events');
    const row = page.locator('[data-activity-open="family-meeting"]');
    await row.focus();
    await page.keyboard.press('Enter');
    const panel = page.locator('#event-panel');
    await expect(panel).toBeVisible();
    await expect(page.locator('#event-panel-title')).toContainText('familiares');
    await expect(page.locator('#event-form-title')).toBeFocused();
    await expect(page.locator('#event-form-title')).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(row).toBeFocused();
    await row.click();
    await page.locator('#close-event-panel').click();
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });

test('the list starts with what is left to fill and shows the rest on request', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  // The cultural week is complete in the fixture and the integrated enrolment is optional.
  await expect(page.locator('#activity-status')).toHaveValue('');
  await expect(page.locator('[data-activity-row="cultural-week"]')).toHaveCount(0);
  await expect(page.locator('[data-activity-row="enrolment-0"]')).toHaveCount(0);
  await expect(page.locator('[data-activity-row="family-meeting"]')).toBeVisible();
  await expect(page.locator('#activity-hidden')).toContainText('não exibidas');
  await page.locator('#show-all-activities').click();
  await expect(page).toHaveURL(/atividadeSituacao=all/);
  await expect(page.locator('[data-activity-row="cultural-week"]')).toBeVisible();
  await expect(page.locator('[data-activity-row="enrolment-0"]')).toBeVisible();
  await expect(page.locator('#activity-hidden')).toHaveCount(0);
});

test('step 6 tabs follow the keyboard and keep their place in the URL', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  const activities = page.locator('[data-tab="atividades"]');
  await expect(activities).toHaveAttribute('aria-selected', 'true');
  await activities.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-tab="eventos"]')).toBeFocused();
  await expect(page.locator('#tabpanel-eventos')).toBeVisible();
  await expect(page).toHaveURL(/aba=eventos/);
  await page.keyboard.press('End');
  await expect(page.locator('[data-tab="eventos"]')).toBeFocused();
  // At the last tab, End keeps the page where it is.
  const scroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('End');
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await expect(page.locator('#tabpanel-eventos')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(activities).toBeFocused();
  await expect(page.locator('#tabpanel-atividades')).toBeVisible();
  await page.reload();
  await expect(activities).toHaveAttribute('aria-selected', 'true');
});

test('a reviewer consults activities and records without editing or saving', async ({
  page,
  fixtureServer,
}) => {
  const fixtureUrl = await fixtureServer('editor-reviewer');
  await page.goto(new URL('/calendarios/synthetic-calendar/eventos', fixtureUrl).href);
  await expect(page.locator('#record-title')).toBeVisible();
  await openActivity(page, 'family-meeting');
  await expect(page.locator('#event-panel .activity-details')).toBeVisible();
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#event-panel [data-prepare-activity]')).toBeDisabled();
  await page.locator('#close-event-panel').click();
  await selectEditorSection(page, 'calendar');
  const records = page.locator('#calendar-record-list');
  await expect(records).toContainText('Evento local salvo');
  for (const control of await records.locator('button').all()) await expect(control).toBeDisabled();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});

test('a review link to an assessment stage opens it in the combined step and closing clears the link', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.assessmentStagesByModality = { integrado: 2 };
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'issues');
  await page.locator('a[href*="atividade=stage-1"]').first().click();
  await expect(page).toHaveURL(/\/periodos\?.*atividade=stage-1/);
  await expect(page.locator('#offer-integrado-form')).toBeVisible();
  await expect(page.locator('#offer-integrado-stage-0-start')).toBeFocused();
  await page.locator('#offer-integrado-cancel').click();
  await expect(page).not.toHaveURL(/atividade=/);
  await selectEditorSection(page, 'periods');
  await selectEditorSection(page, 'assessments');
  await expect(page.locator('#event-panel')).toBeHidden();
});

test('discarding a pending draft from another activity returns focus to that activity', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  await openActivity(page, 'family-meeting');

  await page.locator('#event-start').fill('2027-05-08');
  await page.locator('#close-event-panel').click();
  const other = page.locator('[data-activity-open="alumni-meeting"]');
  await other.click();
  await page.locator('#panel-discard-event').click();
  await expect(page.locator('#event-panel')).toBeHidden();
  await expect(other).toBeFocused();
});

test('the offer filter decides what is left to fill for that offer only', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.modalities = record.state.modalities = ['integrado', 'graduacao'];
    record.state.organizationByModality = { integrado: 'anual', graduacao: 'anual' };
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'events');
  // Women's week is required for the integrated course and optional for undergraduates.
  await expect(page.locator('[data-activity-row="women-week"]')).toBeVisible();
  await page.locator('.activity-more-filters > summary').click();
  await page.locator('#activity-modality').selectOption('graduacao');
  await expect(page.locator('[data-activity-row="women-week"]')).toHaveCount(0);
  await page.locator('#activity-modality').selectOption('integrado');
  await expect(page.locator('[data-activity-row="women-week"]')).toBeVisible();
});

test('the complete record list stays out of the printed calendar', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'calendar');
  await expect(page.locator('#calendar-records')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#calendar-records')).toBeHidden();
  await expect(page.locator('#months .proens-document')).toBeVisible();
});
