import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import { configureOffer, selectEditorSection } from './editor-navigation.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import type { CalendarState } from '../../web/features/calendar-editor/types.ts';
import type {} from '../fixtures/editor-client.ts';

const noteCount = async (page: Page, section: string) =>
  Number(
    await page
      .locator(`[data-view="${section}"] .editor-step-note`)
      .getAttribute('data-issue-count', { timeout: 2000 })
      .catch(() => '0'),
  );
const pendencyCount = async (page: Page) =>
  Number(
    (await page
      .locator('label:has(#activity-pendency-preencher) .activity-view-count')
      .textContent())!.replace(/\D/g, ''),
  );
const openPit = (page: Page) => page.locator('[data-activity-open="pit:semester:first"]');
const panel = (page: Page) => page.locator('#event-panel');

/** Keeps the step picker of narrow screens closed, as it is after choosing a step. */
async function openEvents(page: Page, search = '') {
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/calendarios/synthetic-calendar/atividades${search}`);
  await expect(page.locator('#events')).toBeVisible();
}

async function fillDates(page: Page, start: string, end = start) {
  await page.locator('#event-start').fill(start);
  await page.locator('#event-end').fill(end);
}

for (const width of [1440, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });

    test('the menu, the list and the review count one activity once and show its offers', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor-mixed-offers'));
      await openEvents(page);
      const toFill = await pendencyCount(page);
      expect(toFill).toBeGreaterThan(0);
      expect(await noteCount(page, 'events')).toBe(toFill);
      // The same activity for two offers is one line, with one badge per offer.
      await expect(openPit(page)).toHaveCount(1);
      await expect(openPit(page).locator('[data-offer-badge]')).toHaveCount(2);

      await selectEditorSection(page, 'issues');
      const total = await noteCount(page, 'issues');
      await expect(page.locator('#issue-list .issue-item')).toHaveCount(total);
      await expect(page.locator('#review-summary h3')).toContainText(`${total} pendências`);
      const row = page.locator('[data-issue="activity:pit:semester:first"]');
      await expect(row).toHaveCount(1);
      await expect(row.locator('[data-offer-badge]')).toHaveCount(2);
      // What Activities counts is what the review lists under activities and dates.
      const inGroup = (group: string) => page.locator(`#review-group-${group} .issue-item`).count();
      expect((await inGroup('activities')) + (await inGroup('dates'))).toBe(toFill);
      await expect(page.locator('[data-view="issues"] .editor-step-note')).toHaveText(
        `${total} pendências no total`,
      );
      await expect(page.locator('[data-view="periods"] .editor-step-note')).toContainText(
        'de estrutura',
      );

      // The submission counts the same items and each row leads to the same correction.
      await page.locator('[data-lifecycle-footer-action="submit"]').click();
      const dialog = page.locator('dialog.confirmation-dialog--warning[open]');
      await expect(dialog.locator('h2')).toHaveText(`Enviar com ${total} pendências?`);
      await expect(dialog.locator('.confirmation-dialog__items')).toContainText(
        /E mais \d+ pendências/,
      );
      await page.keyboard.press('Escape');
      await row.locator('a').click();
      await expect(page).toHaveURL(/atividade=pit%3Asemester%3Afirst|atividade=pit:semester:first/);
    });

    test('a submission row with two offers shows both and leads to the correction', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor'));
      await expect(page.locator('#record-title')).toBeVisible();
      // Offers organised alike: the first rows of the submission are activities they share.
      const state = normalizeOfferCalendar(calendarOffersFixture()) as CalendarState;
      await page.evaluate(async (state) => {
        const { record } = window.editorTest;
        // No assessment intervals to list first, which belong to one offer each.
        record.state = {
          ...state,
          campus: record.state.campus,
          offers: state.offers.map(({ stages: _stages, ...offer }) => offer),
        };
        record.offerKinds = ['integrado', 'graduacao'];
        record.version++;
        await window.publishReviewerCalendar();
      }, state);
      await selectEditorSection(page, 'issues');
      await page.locator('[data-lifecycle-footer-action="submit"]').click();
      const dialog = page.locator('dialog.confirmation-dialog--warning[open]');
      const shared = dialog
        .locator('.confirmation-dialog__item')
        .filter({ has: page.locator('.ui-status:nth-child(2)') })
        .first();
      expect(await shared.locator('.ui-status').count()).toBeGreaterThanOrEqual(2);
      await shared.locator('button').click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(/\/atividades\?.*atividade=/);
    });

    test('a calendar of one offer shows no offer badge', async ({ page, fixtureServer }) => {
      await page.goto(await fixtureServer('editor'));
      await openEvents(page);
      await expect(openPit(page)).toBeVisible();
      await expect(page.locator('[data-offer-badge]')).toHaveCount(0);
      expect(await noteCount(page, 'events')).toBe(await pendencyCount(page));
      await selectEditorSection(page, 'issues');
      await expect(page.locator('#issue-list .review-row-text strong').first()).toBeVisible();
      await expect(page.locator('[data-offer-badge]')).toHaveCount(0);
    });

    test('the by-date view says it counts dates and where the activities are', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor-mixed-offers'));
      await openEvents(page);
      const toFill = await pendencyCount(page);
      await page.locator('#activity-mode-data').check();
      await expect(page.locator('label:has(#activity-pendency-preencher)')).toHaveText(
        /A preencher \(\d+ datas?\)/,
      );
      const notice = page.locator('#activities-without-dates');
      await expect(notice).toContainText(`${toFill} atividades a preencher ainda não têm data`);
      await notice.getByRole('button', { name: 'Ver em Por atividade' }).click();
      await expect(page.locator('#activity-mode-atividade')).toBeChecked();
      await expect(page.locator('#activity-mode-atividade')).toBeFocused();
      await expect(notice).toHaveCount(0);
    });

    test('a new organization says how many activities it generated', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor'));
      await expect(page.locator('#record-title')).toBeVisible();
      await selectEditorSection(page, 'events');
      await expect(page.locator('#events')).toBeVisible();
      const before = await pendencyCount(page);
      await selectEditorSection(page, 'periods');
      await configureOffer(page, 'integrado', '2027-02-17', '2027-12-17');
      const message = page.getByText(
        /^Sua organização gerou \d+ novas? atividades? para preencher\.$/,
      );
      await expect(message).toBeVisible();
      const generated = Number((await message.textContent())!.replace(/\D/g, ''));
      await selectEditorSection(page, 'events');
      await expect(page.locator('#events')).toBeVisible();
      expect(await pendencyCount(page)).toBe(before + generated);
    });

    test('next pending walks a filtered list to its end, keeping the panel and the focus', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor-mixed-offers'));
      await openEvents(page, '?atividadeBusca=entrega+do+PIT&atividadePendencia=preencher');
      const rows = page.locator('[data-activity-row]');
      await expect(rows).toHaveCount(2);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openPit(page).click();
      const title = page.locator('#event-panel-title');
      await expect(title).toContainText('1º semestre');
      // The dialog is marked: moving on must not close it and open another one.
      await panel(page).evaluate((element) => element.setAttribute('data-same-panel', ''));
      await panel(page).evaluate((element) =>
        element.addEventListener('close', () => element.setAttribute('data-closed', '')),
      );
      await fillDates(page, '2027-03-15');
      await page.locator('#apply-and-next-pending').click();

      await expect(title).toContainText('2º semestre');
      await expect(panel(page)).toHaveAttribute('data-same-panel', '');
      await expect(panel(page)).not.toHaveAttribute('data-closed', '');
      await expect(page.locator('#event-form-title')).toBeFocused();
      await expect(page.locator('#event-panel-message')).toContainText('Próxima pendente');
      await expect(page.locator('#event-start')).toHaveValue('');
      // Tabbing continues inside the form of the next activity.
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => Boolean(document.activeElement?.closest('#event-panel'))),
      ).toBe(true);

      await fillDates(page, '2027-08-16');
      await page.locator('#apply-and-next-pending').click();
      await expect(panel(page)).toBeHidden();
      await expect(page.getByText('Não há outras atividades pendentes nesta lista.')).toBeVisible();
      await expect(page.evaluate(() => document.activeElement?.tagName !== 'BODY')).resolves.toBe(
        true,
      );
    });

    test('next pending stays in the form on an error', async ({ page, fixtureServer }) => {
      await page.goto(await fixtureServer('editor-mixed-offers'));
      await openEvents(page);
      await openPit(page).click();
      const title = page.locator('#event-panel-title');
      // The browser refuses the empty dates, and nothing moves on.
      await page.locator('#apply-and-next-pending').click();
      await expect(title).toContainText('PIT — 1º semestre');
      await expect(page.locator('#event-form')).toBeVisible();
      // The form refuses a date that ends before it starts, and keeps what was typed.
      await fillDates(page, '2027-03-20', '2027-03-15');
      await page.locator('#apply-and-next-pending').click();
      await expect(
        page.locator('#event-form .form-feedback, #event-form [role="alert"]').first(),
      ).toBeVisible();
      await expect(title).toContainText('PIT — 1º semestre');
      await expect(page.locator('#event-start')).toHaveValue('2027-03-20');
    });

    test('next pending is offered only for a new date of an activity', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor-mixed-offers'));
      await openEvents(page);
      const next = page.locator('#apply-and-next-pending');
      await page.locator('#new-event').click();
      await expect(page.locator('#event-form')).toBeVisible();
      await expect(next).toHaveCount(0);
      await page.locator('#close-event-panel').click();

      await openPit(page).click();
      await expect(next).toBeVisible();
      await fillDates(page, '2027-03-15');
      await page.locator('#event-form button[type="submit"]').click();
      await expect(panel(page).locator('[data-activity-details]')).toBeVisible();
      // Editing the saved date has nothing to go on with.
      await panel(page).getByRole('button', { name: 'Editar' }).first().click();
      await expect(page.locator('#event-form')).toBeVisible();
      await expect(next).toHaveCount(0);
    });

    test('PIT and RIT are explained on the row', async ({ page, fixtureServer }) => {
      await page.goto(await fixtureServer('editor'));
      await openEvents(page);
      const pit = openPit(page);
      await expect(pit.locator('abbr[title]')).toHaveText('PIT');
      await expect(pit.locator('abbr')).toHaveAttribute('title', /^Plano Individual de Trabalho/);
      await expect(pit).toContainText('Plano Individual de Trabalho');
      // The accessible name of the row carries the explanation.
      await expect(pit).toHaveAccessibleName(/Plano Individual de Trabalho/);
      const rit = page.locator('[data-activity-open="rit:semester:first"]');
      await expect(rit).toContainText('Relatório Individual de Trabalho');
      await expect(rit.locator('abbr')).toHaveAttribute('title', /Art\. 11, XII/);
    });
  });
}
