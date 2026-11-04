import type { Page } from '@playwright/test';
import { activityKey } from '../../src/domain/calendar/activities/activity-ref.ts';
import { onceLink } from '../helpers/activity-links.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { test, expect } from './test.ts';
import type { FixtureServer } from './fixture-server.ts';
import { openActivity, savedState, selectEditorSection } from './editor-navigation.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import {
  cascavelDraft,
  conflictingLinks,
  ivaiporaDraft,
  legacyOperationalLinks,
  type PendingLinksFixture,
} from '../fixtures/pending-links-2027.ts';
import type {} from '../fixtures/editor-client.ts';

async function open(page: Page, fixtureServer: FixtureServer, state: PendingLinksFixture) {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(async (state) => {
    const { record } = window.editorTest;
    record.offerKinds = state.offers.map((offer) => offer.kind);
    Object.assign(record.state, state);
    record.version++;
    await window.publishReviewerCalendar();
  }, state);
  await selectEditorSection(page, 'events');
  await expect(page.locator('#events')).toBeVisible();
}

for (const width of [1440, 390])
  for (const [campus, fixture] of [
    ['Ivaiporã', ivaiporaDraft],
    ['Cascavel', cascavelDraft],
    ['legacy operational', legacyOperationalLinks],
  ] as const)
    test(`the ${campus} links stay visible to review in both views at ${width}px`, async ({
      page,
      fixtureServer,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = fixture();
      await open(page, fixtureServer, state);
      const linked = state.events.filter((event) => event.activity);
      const review = page.locator('#link-review');
      await expect(review.locator('[data-date-row]')).toHaveCount(linked.length);
      await expect(review.locator('h4')).toHaveText(`Vínculo a conferir (${linked.length})`);
      for (const event of linked)
        await expect(review.locator(`[data-date-row="${event.id}"]`)).toContainText(
          `Vínculo gravado: ${activityKey(event.activity!)}`,
        );
      // None of them is listed as a campus date.
      for (const event of linked)
        await expect(page.locator(`#campus-dates [data-date-row="${event.id}"]`)).toHaveCount(0);

      await page.locator('#activity-mode-data').check();
      await expect(page).toHaveURL(/atividadeVisao=data/);
      for (const event of state.events)
        await expect(page.locator(`#date-list [data-date-row="${event.id}"]`)).toHaveCount(1);

      // A date to review opens read-only link details; editing keeps the link.
      const [first] = linked;
      await page.locator(`#date-list [data-open-event="${first.id}"]`).click();
      await expect(page.locator('#link-review-reason')).toContainText('Classificação pendente');
      await expect(page.locator('#link-review-reason')).toContainText(activityKey(first.activity!));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });

const count = async (page: Page, id: string) =>
  Number(
    /\((\d+)\)/.exec(await page.locator(`label:has(#activity-pendency-${id})`).innerText())![1],
  );

for (const width of [1440, 390])
  test(`filters combine with counters in the unit of each view at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = ivaiporaDraft();
    await open(page, fixtureServer, state);
    // By activity: activities plus the dates of the special groups.
    const rows = page.locator(
      '#activity-checklist [data-activity-row], #activity-checklist [data-date-row]',
    );
    expect(await count(page, 'todas')).toBe(await rows.count());
    expect((await count(page, 'preencher')) + (await count(page, 'sem-pendencias'))).toBe(
      await count(page, 'todas'),
    );
    await page.locator('#activity-pendency-preencher').check();
    await expect(page).toHaveURL(/atividadePendencia=preencher/);
    await expect(page.locator('#link-review [data-date-row]')).toHaveCount(11);
    // Dates to review block publication, so their group cannot be collapsed.
    await expect(page.locator('#group-review button')).toHaveCount(0);
    await expect(page.locator('#campus-dates')).toHaveCount(0);
    expect(await rows.count()).toBe(await count(page, 'preencher'));
    // Origin narrows to the campus' own dates; activities are hidden by it.
    await page.locator('.activity-more-filters > summary').click();
    await page.locator('#activity-origin').selectOption('campus');
    await page.locator('#activity-pendency-todas').check();
    await expect(page.locator('#campus-dates [data-date-row]')).toHaveCount(6);
    await expect(page.locator('[data-activity-row]')).toHaveCount(0);
    expect(await count(page, 'todas')).toBe(6);
    // By date counts dates, with the same filters.
    await page.locator('#activity-mode-data').check();
    await expect(page.locator('#date-list [data-date-row]')).toHaveCount(6);
    expect(await count(page, 'todas')).toBe(6);
    await page.locator('#activity-origin').selectOption('');
    expect(await count(page, 'todas')).toBe(
      await page.locator('#date-list [data-date-row]').count(),
    );
    await page.locator('#activity-mode-atividade').check();
    // Step filters and document filters live in separate URL keys.
    await page.locator('#activity-search').fill('recognition');
    await expect(page).toHaveURL(/atividadeBusca=recognition/);
    expect(new URL(page.url()).searchParams.has('busca')).toBe(false);
    await expect(page.locator('#link-review [data-date-row]')).toHaveCount(2);
  });

test('an orphaned observance is resolvable in both views', async ({ page, fixtureServer }) => {
  const state: PendingLinksFixture = {
    ...cascavelDraft(),
    observanceDates: { 'retired-observance': civilDate('2027-10-13') },
  };
  await open(page, fixtureServer, state);
  const row = page.locator('#adjustable-dates #open-observance-retired-observance');
  await expect(row).toBeVisible();
  await page.locator('#activity-pendency-preencher').check();
  await expect(row).toBeVisible();
  await page.locator('#activity-mode-data').check();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('#reset-observance-retired-observance')).toBeVisible();
});

/** Follow a review link in place, as the issues list does, keeping the other URL keys. */
async function followLink(page: Page, atividade: string) {
  await page.evaluate((value) => {
    const url = new URL(location.href);
    url.searchParams.set('atividade', value);
    history.pushState(null, '', url);
    dispatchEvent(new PopStateEvent('popstate'));
  }, atividade);
}

for (const width of [1440, 390])
  test(`a review link names an activity by its complete key, with or without dates, at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = ivaiporaDraft();
    state.events.push({
      id: 'family-meeting-date',
      name: 'Reunião sintética com familiares',
      start: civilDate('2027-03-10'),
      end: civilDate('2027-03-10'),
      effect: 'note',
      category: 'evento',
      activity: onceLink('family-meeting'),
      scope: { offers: ['integrado', 'subsequente'], confirmed: true },
    });
    await open(page, fixtureServer, state);
    const panel = page.locator('#event-panel');

    // An activity without dates, from the by-date view: the by-activity view and its panel open.
    await page.locator('#activity-mode-data').check();
    await followLink(page, 'pit:semester:first');
    await expect(page.locator('#activity-mode-atividade')).toBeChecked();
    await expect(panel.locator('[data-activity-detail="pit:semester:first"]')).toHaveAttribute(
      'open',
      '',
    );
    await expect(panel.locator('[data-prepare-activity="pit:semester:first"]')).toHaveText(
      'Preencher atividade',
    );
    await expect(
      page.locator('#activity-checklist [data-activity-row="pit:semester:first"]'),
    ).toHaveCount(1);
    await page.locator('#close-event-panel').click();
    await expect(page).not.toHaveURL(/atividade=/);

    // An activity with dates lists them; the URL keeps the key readable.
    await page.locator('#activity-mode-data').check();
    await followLink(page, 'family-meeting');
    await expect(page.locator('#activity-mode-atividade')).toBeChecked();
    await expect(page.locator('#event-panel-title')).toContainText('Reunião com familiares');
    await expect(panel.locator('[aria-label="Datas desta atividade"]')).toContainText(
      'Reunião sintética com familiares',
    );
    await expect(panel.locator('[data-prepare-activity="family-meeting"]')).toHaveText(
      'Adicionar data',
    );
    await page.locator('#close-event-panel').click();

    // The key of a date under “Vínculo a conferir” opens that date, with its pending reason.
    await followLink(page, 'final:cycle:first');
    await expect(page.locator('#link-review-reason')).toContainText('Classificação pendente');
    await expect(page.locator('#link-review-reason')).toContainText('final:cycle:first');
    await page.locator('#close-event-panel').click();

    // A complete key that names neither a generated activity nor a date to review warns, also
    // for an operational row v4 kept in 2027 as “Classificação legada” (step 9d: no fallback).
    for (const key of ['council:stage:unclassified:3:integrado', 'enrolment:cycle:first']) {
      await followLink(page, key);
      await expect(page.locator('#activity-link-missing')).toBeVisible();
      await expect(page.locator('#activity-link-invalid')).toHaveCount(0);
      await expect(panel).toBeHidden();
    }

    // A format 4 identifier or a partial key is not a key: the Router drops it and the step warns.
    for (const value of [
      'final-1',
      'stage-1:integrado',
      'final:cycle',
      'family-meeting:cycle:first',
    ]) {
      await followLink(page, value);
      await expect(page.locator('#activity-link-invalid')).toBeVisible();
      await expect(page.locator('#activity-link-missing')).toHaveCount(0);
      await expect(panel).toBeHidden();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

test('activity groups collapse from their heading and a search opens them again', async ({
  page,
  fixtureServer,
}) => {
  await open(page, fixtureServer, ivaiporaDraft());
  const toggle = page.locator('#activity-checklist .activity-group-toggle').first();
  const rows = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toContainText(/a preencher/);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(rows).toBeHidden();
  // The choice survives a trip to another step.
  await selectEditorSection(page, 'days');
  await selectEditorSection(page, 'events');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // A search shows its matches in every group, and clearing it restores the choice.
  await page.locator('#activity-search').fill('a');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(rows).toBeVisible();
  await page.locator('#activity-search').fill('');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('the institutional base group opens when an action shows one of its dates', async ({
  page,
  fixtureServer,
}) => {
  await open(page, fixtureServer, ivaiporaDraft());
  const base = page.locator('#base-dates');
  const toggle = base.getByRole('button', { name: /Datas da base institucional/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#activity-mode-data').check();
  const teacherDay = page.locator('#date-list [data-origin="base"] button').first();
  await teacherDay.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#event-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#event-panel')).toBeHidden();
  await expect(teacherDay).toBeFocused();
  await page.locator('#activity-mode-atividade').check();
  await page.locator('.activity-more-filters > summary').click();
  await page.locator('#activity-origin').selectOption('base');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(base.locator('[data-date-row]')).toHaveCount(1);
});

test('a stage under review opens its details, can have its dates edited and be removed', async ({
  page,
  fixtureServer,
}) => {
  await open(page, fixtureServer, conflictingLinks());
  const twin = page.locator('#link-review [data-open-event="stage-twice-b"]');
  await twin.click();
  await expect(page.locator('#link-review-reason')).toContainText('Etapa duplicada');
  await page.locator('[data-edit-event="stage-twice-b"]').click();
  await expect(page).toHaveURL(/\/atividades/);
  await expect(page.locator('#event-kept-link')).toContainText('stage:stage:annual:2:integrado');
  await page.locator('#close-event-panel').click();
  await page.locator('#link-review [data-open-event="stage-twice-b"]').click();
  await page.locator('[data-remove-event="stage-twice-b"]').click();
  const saved = await savedState(page);
  expect(saved.state.events.some((event) => event.id === 'stage-twice-b')).toBe(false);
  // The remaining stage is no longer a duplicate.
  await expect(page.locator('#link-review [data-date-row="stage-twice-a"]')).toHaveCount(0);
});

const internalDates = ['ivaipora-annual-final', 'ivaipora-annual-diary'];

for (const width of [1440, 390])
  test(`the visibility filter hides date lines only, with coherent counters in both views at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = ivaiporaDraft();
    state.events = state.events.map((event) =>
      internalDates.includes(event.id) ? { ...event, internal: true as const } : event,
    );
    await open(page, fixtureServer, state);
    const rows = page.locator(
      '#activity-checklist [data-activity-row], #activity-checklist [data-date-row]',
    );
    const activities = page.locator('#activity-checklist [data-activity-row]');
    const toFillWithoutDates = page.locator(
      '#activity-checklist [data-activity-row]:has-text("Sem datas"):not([data-status="complete"]):not([data-status="optional"])',
    );
    const allRows = await rows.count();
    const allActivities = await activities.count();
    const withoutDates = await toFillWithoutDates.count();
    expect(withoutDates).toBeGreaterThan(0);
    const allToFill = await count(page, 'preencher');
    const baseDates = await page.locator('#base-dates [data-date-row]').count();
    for (const id of internalDates)
      await expect(
        page.locator(`#campus-dates [data-date-row="${id}"] [data-internal-badge]`),
      ).toHaveText('Interna');

    // Official: internal dates disappear; every activity stays, including the ones to fill.
    const summary = page.locator('.activity-more-filters > summary');
    await summary.click();
    const visibility = page.locator('#activity-visibility');
    await expect(visibility).toBeVisible();
    await visibility.selectOption('oficiais');
    await expect(page).toHaveURL(/atividadeVisibilidade=oficiais/);
    await expect(summary).toHaveText('Mais filtros (1)');
    await expect(page.locator('#campus-dates [data-date-row]')).toHaveCount(4);
    for (const id of internalDates)
      await expect(page.locator(`[data-date-row="${id}"]`)).toHaveCount(0);
    await expect(activities).toHaveCount(allActivities);
    await expect(toFillWithoutDates).toHaveCount(withoutDates);
    await expect(page.locator('#activities-hidden-by-visibility')).toHaveCount(0);
    expect(await count(page, 'todas')).toBe(allRows - internalDates.length);
    expect(await rows.count()).toBe(await count(page, 'todas'));
    expect(await count(page, 'preencher')).toBe(allToFill);
    await page.locator('#activity-pendency-preencher').check();
    await expect(toFillWithoutDates).toHaveCount(withoutDates);
    expect(await rows.count()).toBe(await count(page, 'preencher'));
    await page.locator('#activity-pendency-todas').check();
    // By date: the same filter, counted in dates.
    await page.locator('#activity-mode-data').check();
    const dateRows = page.locator('#date-list [data-date-row]');
    await expect(dateRows).toHaveCount(state.events.length + baseDates - internalDates.length);
    expect(await count(page, 'todas')).toBe(await dateRows.count());

    // Internal: only the internal dates of the campus, and the notice that activities are hidden.
    await visibility.selectOption('internas');
    await expect(page).toHaveURL(/atividadeVisibilidade=internas/);
    await expect(dateRows).toHaveCount(internalDates.length);
    expect(await count(page, 'todas')).toBe(internalDates.length);
    expect(await count(page, 'preencher')).toBe(0);
    expect(await count(page, 'sem-pendencias')).toBe(internalDates.length);
    await expect(page.locator('#activities-hidden-by-visibility')).toContainText(
      'atividades estão ocultas',
    );
    await page.locator('#activity-mode-atividade').check();
    await expect(page.locator('#activity-checklist [data-date-row]')).toHaveCount(
      internalDates.length,
    );
    for (const id of internalDates)
      await expect(page.locator(`#campus-dates [data-date-row="${id}"]`)).toHaveCount(1);
    await expect(activities).toHaveCount(0);
    await expect(page.locator('#link-review')).toHaveCount(0);
    expect(await count(page, 'todas')).toBe(internalDates.length);
    // The summary by offer is not recomputed by the filter, and stays in the by-date view.
    await expect(page.locator('#activity-summary')).toBeVisible();
    await page.locator('#activity-mode-data').check();
    await expect(page.locator('#activity-summary')).toBeVisible();
    await page.locator('#activity-mode-atividade').check();
    await expect(page.locator('#activities-hidden-by-visibility')).toBeVisible();

    // The notice clears the filter.
    await page.locator('#activities-hidden-by-visibility button').click();
    await expect(page).not.toHaveURL(/atividadeVisibilidade/);
    await expect(rows).toHaveCount(allRows);
    expect(await count(page, 'todas')).toBe(allRows);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

for (const width of [1440, 390])
  test(`notice actions return the focus to the control they changed at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = ivaiporaDraft();
    state.events = state.events.map((event) =>
      event.id === internalDates[0] ? { ...event, internal: true as const } : event,
    );
    await open(page, fixtureServer, state);
    // “Mostrar todas as datas” clears the only extra filter, which closes “Mais filtros”.
    const more = page.locator('.activity-more-filters > summary');
    await more.click();
    await page.locator('#activity-visibility').selectOption('internas');
    await page.locator('#activities-hidden-by-visibility button').focus();
    await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/atividadeVisibilidade/);
    await expect(more).toBeFocused();
    // With another extra filter the group stays open, and the focus returns to the select.
    await more.click();
    await page.locator('#activity-origin').selectOption('campus');
    await page.locator('#activity-visibility').selectOption('internas');
    await page.locator('#activities-hidden-by-visibility button').focus();
    await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/atividadeVisibilidade/);
    await expect(page.locator('#activity-visibility')).toBeFocused();
  });

for (const width of [1440, 390])
  test(`filling an activity in a mixed calendar keeps its contextual offers at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    // Annual integrated and undergraduate offers beside two semester undergraduate offers.
    await open(page, fixtureServer, calendarOffersFixture());
    const offers = page.locator('#event-modalities input[name="event-modality"]');
    const chosen = () =>
      offers.evaluateAll((items) =>
        (items as HTMLInputElement[]).map((item) => `${item.value}:${item.checked}`),
      );
    for (const [key, expected] of [
      // A semester cycle belongs to the semester offers only; the annual cycle, to the annual ones.
      ['final:cycle:first', ['graduacao-2:true', 'graduacao-3:true']],
      ['final:cycle:annual', ['integrado:true', 'graduacao:true']],
      // The reference semester (art. 11, XII) applies to every offer, annual or semester.
      [
        'pit:semester:first',
        ['integrado:true', 'graduacao:true', 'graduacao-2:true', 'graduacao-3:true'],
      ],
    ] as const) {
      await openActivity(page, key);
      await expect(page.locator('#event-form')).toBeVisible();
      expect(await chosen()).toEqual(expected);
      await page.locator('#close-event-panel').click();
      await expect(page.locator('#event-panel')).toBeHidden();
    }
    // Filling the semester cycle saves and confirms exactly the contextual offers.
    await openActivity(page, 'final:cycle:first');
    await page.locator('#event-start').fill('2027-07-05');
    await page.locator('#event-end').fill('2027-07-05');
    await page.locator('#event-form button[type="submit"]').click();
    await expect
      .poll(async () =>
        (await savedState(page)).state.events.find(
          (event) => event.activity?.activityId === 'final',
        ),
      )
      .toMatchObject({
        activity: { activityId: 'final', term: 'first' },
        scope: { offers: ['graduacao-2', 'graduacao-3'], confirmed: true },
      });
    await page.locator('#close-event-panel').click();
    // A new date of the campus starts with every offer of the calendar.
    await page.locator('#new-event').click();
    await expect(page.locator('#event-form-title')).toHaveText('Nova data do campus');
    expect(await chosen()).toEqual([
      'integrado:true',
      'graduacao:true',
      'graduacao-2:true',
      'graduacao-3:true',
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
