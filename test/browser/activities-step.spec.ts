import type { Page } from '@playwright/test';
import { activityKey } from '../../src/domain/calendar/activities/activity-ref.ts';
import { onceLink } from '../helpers/activity-links.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { test, expect } from './test.ts';
import type { FixtureServer } from './fixture-server.ts';
import { savedState, selectEditorSection } from './editor-navigation.ts';
import {
  cascavelDraft,
  conflictingLinks,
  ivaiporaDraft,
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
    await expect(page.locator('#campus-dates')).toHaveCount(0);
    expect(await rows.count()).toBe(await count(page, 'preencher'));
    // Origin narrows to the campus' own dates; activities are hidden by it.
    await page.locator('.activity-more-filters > summary').click();
    await page.locator('#activity-origin').selectOption('campus');
    await page.locator('#activity-pendency-todas').check();
    await expect(page.locator('#campus-dates [data-date-row]')).toHaveCount(5);
    await expect(page.locator('[data-activity-row]')).toHaveCount(0);
    expect(await count(page, 'todas')).toBe(5);
    // By date counts dates, with the same filters.
    await page.locator('#activity-mode-data').check();
    await expect(page.locator('#date-list [data-date-row]')).toHaveCount(5);
    expect(await count(page, 'todas')).toBe(5);
    await page.locator('#activity-origin').selectOption('');
    expect(await count(page, 'todas')).toBe(
      await page.locator('#date-list [data-date-row]').count(),
    );
    await expect(page.locator('#activities-without-dates')).toContainText('atividades sem datas');
    await page.locator('#activities-without-dates button').click();
    await expect(page.locator('#activity-mode-atividade')).toBeChecked();
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
    await followLink(page, 'final:cycle:annual');
    await expect(page.locator('#activity-mode-atividade')).toBeChecked();
    await expect(panel.locator('[data-activity-detail="final:cycle:annual"]')).toHaveAttribute(
      'open',
      '',
    );
    await expect(panel.locator('[data-prepare-activity="final:cycle:annual"]')).toHaveText(
      'Preencher atividade',
    );
    await expect(
      page.locator('#activity-checklist [data-activity-row="final:cycle:annual"]'),
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

    // A complete key that names neither a generated activity nor a date to review warns.
    await followLink(page, 'council:stage:unclassified:3:integrado');
    await expect(page.locator('#activity-link-missing')).toBeVisible();
    await expect(page.locator('#activity-link-invalid')).toHaveCount(0);

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

test('the institutional base group opens when an action shows one of its dates', async ({
  page,
  fixtureServer,
}) => {
  await open(page, fixtureServer, ivaiporaDraft());
  const base = page.locator('#base-dates');
  await expect(base).not.toHaveAttribute('open', '');
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
  await expect(base).toHaveAttribute('open', '');
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
