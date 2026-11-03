import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import {
  openActivity,
  savedState,
  selectCampusEvents,
  selectEditorSection,
  editCampusEvent,
  openCampusEvent,
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
    activity: { activityId: 'family-meeting' },
    effect: 'note',
    category: 'prazo',
    // Saving the form confirms the contextual offers.
    scope: { offers: ['integrado'], confirmed: true },
    start: '2027-05-08',
    end: '2027-05-08',
  });
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
      activity: { activityId: 'family-meeting' },
      start: '2027-05-10',
      end: '2027-05-10',
      effect: 'exclude',
      category: 'recesso',
      scope: { offers: ['integrado'], confirmed: true },
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
  await expect(page.locator('#event-effect [data-choice="exclude"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
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
    effect: 'note',
    category: 'prazo',
    notice: {
      publication: 'planned',
      admission: { type: 'transfer', year: 2027, term: 'second', destinations: [] },
    },
  });
  expect(event?.activity).toBeUndefined();
});

async function chooseNoticeType(page: Page) {
  await page.locator('#event-type-notice').check();
}

test('a new activity period asks for dates first and keeps category and effect collapsed', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  const title = (await page
    .locator('[data-activity-row="family-meeting"] .activity-row-name')
    .textContent())!.trim();
  await openActivity(page, 'family-meeting');
  await expect(page.locator('#event-form-title')).toHaveText('Adicionar data');
  await expect(page.locator('#back-to-activity')).toBeVisible();
  // The panel was opened from this activity, so the link is not offered for change.
  await expect(page.locator('#event-requirement')).toHaveCount(0);
  await expect(page.locator('#event-hours')).toHaveCount(0);
  await expect(page.locator('#event-modalities')).toHaveText(/Técnico integrado/);
  await expect(page.locator('#event-modalities input')).toHaveCount(0);
  await expect(page.locator('#event-name')).toHaveValue(title);
  await expect(page.locator('#event-more-options')).not.toHaveAttribute('open');
  await expect(page.locator('#event-effect')).toBeHidden();

  // A date added to an activity starts without effect on the count.
  await page.locator('#event-more-options > summary').click();
  await expect(page.locator('#event-effect [data-choice="note"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('going back to the activity keeps an unapplied period pending and a saved one listed', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  await openActivity(page, 'family-meeting');
  await page.locator('#event-start').fill('2027-06-12');
  await page.locator('#event-end').fill('2027-06-12');

  await page.locator('#back-to-activity').click();
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#panel-pending-event')).toBeVisible();
  await expect(page.locator('#panel-resume-event')).toBeFocused();
  await page.locator('#panel-resume-event').click();
  await expect(page.locator('#event-start')).toHaveValue('2027-06-12');

  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find(
            (event) => event.activity?.activityId === 'family-meeting',
          )?.start,
      ),
    )
    .toBe('2027-06-12');
  // Saving returns to the activity, where the new period is listed.
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#event-panel .activity-records')).toContainText('12/06/2027');
  await expect(page.locator('#event-panel [data-prepare-activity]')).toHaveText('Adicionar data');
  await expect(page.locator('#event-panel [data-prepare-activity]')).toBeFocused();

  const saved = await savedEvent(page, (_, id) => !['local-event', 'activity-event'].includes(id));
  await page.locator(`[data-edit-activity-event="${saved!.id}"]`).click();
  await expect(page.locator('#event-form-title')).toHaveText('Editar data');
  await expect(page.locator('#event-panel .activity-records')).toHaveCount(0);
  await expect(page.locator('#event-requirement')).toHaveCount(0);
  await page.locator('#back-to-activity').click();
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#panel-pending-event')).toHaveCount(0);
  await expect(page.locator('#event-panel .activity-records')).toContainText('12/06/2027');
});

test('the free event form opens in the side panel with a labelled offer group', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.offers = (['integrado', 'graduacao'] as const).map((kind) => ({
      id: kind,
      kind,
      delivery: 'a-conferir' as const,
      organization: 'anual' as const,
    }));
    record.offerKinds = record.state.offers.map((offer) => offer.kind);
    record.state.offers = record.state.offers.map((offer) => ({
      ...offer,
      organization:
        offer.id === 'integrado'
          ? ('anual' as const)
          : offer.id === 'graduacao'
            ? ('anual' as const)
            : ('a-classificar' as const),
    }));
    record.state.offers = record.state.offers.map((offer) => ({
      ...offer,
      stages:
        offer.id === 'integrado'
          ? {
              status: 'defined',
              perTerm: offer.organization === 'semestral' ? (1 as const) : (2 as const),
            }
          : undefined,
    }));
    record.version++;
    return window.publishReviewerCalendar();
  });
  // Periods and assessments are edited together, without an offer checkbox group.
  await selectEditorSection(page, 'assessments');
  await page.locator('[data-edit-organization="integrado"]').click();
  await expect(page.locator('[data-offer="integrado"] form')).toBeVisible();
  await expect(page.locator('[data-offer="integrado"] input[type="checkbox"]')).toHaveCount(0);
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await expect(page.locator('#event-panel #event-form')).toBeVisible();
  const offers = page.locator('fieldset#event-modalities');
  await expect(offers.locator(':scope > legend')).toHaveText('Ofertas abrangidas');
  await expect(offers.locator('input')).toHaveCount(2);
  await expect(page.locator('#close-event-panel')).toHaveAccessibleName('Fechar painel');
  await expect(page.locator('#event-form .form-actions button')).toHaveCount(1);
  await expect(page.locator('#discard-event-form')).toBeHidden();
});

test('a free event asks what it is and the answer sets its effect and category', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await expect(page.locator('#event-type > legend')).toHaveText('O que é este evento?');
  await expect(page.locator('#event-effect')).toBeHidden();
  await page.locator('#event-name').fill('Feriado municipal sintético');
  await page.locator('#event-start').fill('2027-06-24');
  await page.locator('#event-end').fill('2027-06-24');

  // Applying without an answer is rejected by the form itself.
  await applyEvent(page);
  await expect(page.locator('#event-type-holiday')).toBeFocused();
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(2);
  await page.locator('#event-type-holiday').check();
  await page.locator('#event-more-options > summary').click();
  await expect(page.locator('#event-effect [data-choice="exclude"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
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
    .toMatchObject({ effect: 'exclude', category: 'recesso' });
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
      effect: 'exclude',
      category: 'formacao',
      scope: { offers: ['integrado'], confirmed: true },
    });
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectCampusEvents(page);
  await editCampusEvent(page, 'free-combination');
  await expect(page.locator('#event-type')).toHaveCount(0);
  await expect(page.locator('#event-more-options > summary')).toContainText('Exclui dias letivos');
  await page.locator('#event-more-options > summary').click();
  await expect(page.locator('#event-effect')).toBeVisible();
  await expect(page.locator('#event-effect [data-choice="exclude"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('#event-category')).toHaveValue('formacao');
  await expect(page.locator('#event-panel #event-form')).toBeVisible();
});

test('answering another type after a notice keeps its draft but writes no notice data', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
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
  expect(event).toMatchObject({ effect: 'exclude', category: 'recesso' });
  expect(event?.notice).toBeUndefined();
});

for (const width of [1440, 390])
  test(`event type options keep their compact size in a campus event draft at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
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

test('the list shows every activity and the views split what is left to fill', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  const rows = (id: string) => page.locator(`[data-activity-row="${id}"]`);
  const count = async (view: string) =>
    Number(
      (await page
        .locator(`label:has(#activity-pendency-${view}) .activity-view-count`)
        .textContent())!.replace(/\D/g, ''),
    );
  // The cultural week is complete in the fixture and the integrated enrolment is optional.
  await expect(page.locator('#activity-pendency-todas')).toBeChecked();
  await expect(rows('cultural-week')).toBeVisible();
  await expect(rows('enrolment:cycle:annual')).toBeVisible();
  await expect(rows('family-meeting')).toBeVisible();
  expect(await count('todas')).toBe((await count('preencher')) + (await count('sem-pendencias')));

  await page.locator('#activity-pendency-preencher').check();
  await expect(page).toHaveURL(/atividadePendencia=preencher/);
  await expect(rows('cultural-week')).toHaveCount(0);
  await expect(rows('enrolment:cycle:annual')).toHaveCount(0);
  await expect(rows('family-meeting')).toBeVisible();
  // By activity, the counter also includes the dates of the special groups.
  await expect(
    page.locator(
      '#activity-checklist :is([data-activity-row], [data-date-row]), [data-adjustable]',
    ),
  ).toHaveCount(await count('preencher'));

  await page.locator('#activity-pendency-sem-pendencias').check();
  await expect(rows('cultural-week')).toBeVisible();
  await expect(rows('enrolment:cycle:annual')).toBeVisible();
  await expect(rows('family-meeting')).toHaveCount(0);

  // The situation filter uses the status shown on each row.
  await page.locator('#activity-pendency-todas').check();
  await page.locator('.activity-more-filters > summary').click();
  await page.locator('#activity-status').selectOption('complete');
  await expect(page.locator('.activity-more-filters > summary')).toHaveText('Mais filtros (1)');
  await expect(rows('cultural-week')).toBeVisible();
  await expect(rows('enrolment:cycle:annual')).toHaveCount(0);
  for (const status of await page
    .locator('[data-activity-row]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-status'))))
    expect(status).toBe('complete');
});

test('a reviewer consults activities and records without editing or saving', async ({
  page,
  fixtureServer,
}) => {
  const fixtureUrl = await fixtureServer('editor-reviewer');
  await page.goto(new URL('/calendarios/synthetic-calendar/atividades', fixtureUrl).href);
  await expect(page.locator('#record-title')).toBeVisible();
  await openActivity(page, 'family-meeting');
  await expect(page.locator('#event-panel .activity-details')).toBeVisible();
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#event-panel [data-prepare-activity]')).toBeDisabled();
  await page.locator('#close-event-panel').click();
  await selectEditorSection(page, 'calendar');
  await page.locator('#calendar-dates').click();
  await expect(page).toHaveURL(/\/atividades\?.*atividadeVisao=data/);
  const dates = page.locator('#date-list');
  await expect(dates).toContainText('Evento local salvo');
  await dates.locator('[data-open-event="local-event"]').click();
  await expect(page.locator('[data-edit-event="local-event"]')).toBeDisabled();
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
    record.state.offers = record.state.offers.map((offer) => ({
      ...offer,
      stages:
        offer.id === 'integrado'
          ? {
              status: 'defined',
              perTerm: offer.organization === 'semestral' ? (1 as const) : (2 as const),
            }
          : undefined,
    }));
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'issues');
  // The link carries the complete key of the stage link: activity, base, position and offer.
  await page.locator('a[href*="atividade=stage:stage:"]').first().click();
  await expect(page).toHaveURL(/\/periodos\?.*atividade=stage:stage:(annual|first):1:integrado/);
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
    record.state.offers = (['integrado', 'graduacao'] as const).map((kind) => ({
      id: kind,
      kind,
      delivery: 'a-conferir' as const,
      organization: 'anual' as const,
    }));
    record.offerKinds = record.state.offers.map((offer) => offer.kind);
    record.state.offers = record.state.offers.map((offer) => ({
      ...offer,
      organization:
        offer.id === 'integrado'
          ? ('anual' as const)
          : offer.id === 'graduacao'
            ? ('anual' as const)
            : ('a-classificar' as const),
    }));
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'events');
  await page.locator('#activity-pendency-preencher').check();
  // Women's week is required for the integrated course and optional for undergraduates.
  await expect(page.locator('[data-activity-row="women-week"]')).toBeVisible();
  await page.locator('.activity-more-filters > summary').click();
  await page.locator('#activity-modality').selectOption('graduacao');
  await expect(page.locator('[data-activity-row="women-week"]')).toHaveCount(0);
  await page.locator('#activity-modality').selectOption('integrado');
  await expect(page.locator('[data-activity-row="women-week"]')).toBeVisible();
});

test('the link to every date stays out of the printed calendar', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'calendar');
  await expect(page.locator('#calendar-dates')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#calendar-dates')).toBeHidden();
  await expect(page.locator('#months .proens-document')).toBeVisible();
});

test('an hours activity lists the hours of each period and their registered total', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  await openActivity(page, 'pedagogical-training');
  for (const [date, hours] of [
    ['2027-05-04', '12'],
    ['2027-05-10', '8.5'],
  ]) {
    const prepare = page.locator('#event-panel [data-prepare-activity]');
    if (await prepare.isVisible()) await prepare.click();
    await page.locator('#event-start').fill(date);
    await page.locator('#event-end').fill(date);
    await page.locator('#event-hours').fill(hours);
    await applyEvent(page);
    await expect(page.locator('#event-form')).toBeHidden();
  }
  const records = page.locator('#event-panel .activity-record');
  await expect(records.nth(0)).toContainText('· 12 h');
  await expect(records.nth(1)).toContainText('· 8,5 h');
  await expect(page.locator('[data-activity-hours="pedagogical-training"]')).toHaveText(
    'Carga horária registrada: 20,5 h (mínimo de 40 h)',
  );
});

test('a notice edits one common destination and shows the diagnosis of each offer', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.offers = [
      { id: 'integrado', kind: 'integrado', delivery: 'a-conferir', organization: 'anual' },
      { id: 'subsequente', kind: 'subsequente', delivery: 'a-conferir', organization: 'anual' },
    ];
    record.state.periods = [
      {
        id: 'integrado-year',
        name: 'Ano letivo integrado',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
      {
        id: 'subsequente-year',
        name: 'Ano letivo subsequente',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', offers: ['subsequente'], term: 'annual' },
      },
    ];
    record.state.events.push({
      id: 'transfer-notice',
      name: 'Edital de transferência por oferta',
      start: '2027-01-10',
      end: '2027-01-10',
      effect: 'note',
      category: 'prazo',
      scope: { offers: ['integrado', 'subsequente'], confirmed: true },
      notice: {
        publication: 'planned',
        admission: {
          type: 'transfer',
          year: 2027,
          term: 'annual',
          destinations: [
            { offerId: 'integrado', periodId: 'integrado-year' },
            { offerId: 'subsequente', periodId: 'removed-period' },
          ],
        },
      },
    });
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectCampusEvents(page);
  await openCampusEvent(page, 'transfer-notice');
  const record = page.locator('.campus-event-record');
  await expect(record).toContainText('Destinos por oferta');
  await expect(record).toContainText('período de destino removido do calendário (removed-period)');
  await page.locator('[data-edit-event="transfer-notice"]').click();
  const period = page.locator('#event-admission-period');
  const issues = page.locator('#event-destination-issues');
  // Distinct destinations are kept as they are, and the orphan one is diagnosed for its offer.
  await expect(period).toHaveValue('por-oferta');
  await expect(page.locator('#event-admission-destinations')).toContainText('Ano letivo integrado');
  await expect(issues).toContainText('período de destino removido do calendário (removed-period)');
  await expect(issues.locator('li')).toHaveCount(1);
  // One common destination for every offer: the other offer now has a period of another offer.
  await period.selectOption('integrado-year');
  await expect(issues).toContainText('não está associado à oferta');
  await expect(issues.locator('li')).toHaveCount(1);
  await applyEvent(page);
  await expect
    .poll(async () => (await savedEvent(page, (_, id) => id === 'transfer-notice'))?.notice)
    .toEqual({
      publication: 'planned',
      admission: {
        type: 'transfer',
        year: 2027,
        term: 'annual',
        destinations: [
          { offerId: 'integrado', periodId: 'integrado-year' },
          { offerId: 'subsequente', periodId: 'integrado-year' },
        ],
      },
    });
});
