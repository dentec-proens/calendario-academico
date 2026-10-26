import { test, expect } from './test.ts';
import type { Page } from '@playwright/test';
import { addPeriod, selectEditorSection } from './editor-navigation.ts';

// Each case runs in the desktop and mobile projects. Fixtures import production
// components and CSS, and keep all content, timestamps and backend data local.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
});

async function assertNoOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
}

test('portal calendar dashboard', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('portal'));
  await expect(page.locator('#calendar-list')).toContainText('Calendário de teste');
  await assertNoOverflow(page);
  await expect(page).toHaveScreenshot('portal-dashboard.png', { fullPage: true });
});

test('calendar creation form', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('portal'));
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.locator('#calendars .collection-heading button').click();
  await page.locator('#calendar-courses').fill('Técnico em Informática');
  await page.locator('input[name="calendar-modality"]').first().check();
  await page.locator('#calendar-courses').blur();
  await expect(page.locator('#create-calendar')).toBeVisible();
  await assertNoOverflow(page);
  await expect(page).toHaveScreenshot('calendar-creation.png', { fullPage: true });
});

test('review with a pending confirmed criterion', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('review'));
  await page.locator('#open-review').click();
  const item = page.locator('#review-items > li').first();
  await expect(item.locator('textarea')).toBeEnabled();
  await expect(item.locator('textarea')).toBeHidden();
  await expect(item).toHaveScreenshot('review-criterion-collapsed.png');
  await item.locator('[data-choice="ATENDIDO"]').click();
  await item.locator('.review-item__notes summary').click();
  await item.locator('textarea').fill('Conferência documental registrada.');
  await item.locator('[data-confirm-criterion]').click();
  await expect(item.locator('[data-origin]')).toContainText('por salvar');
  await assertNoOverflow(page);
  await expect(item).toHaveScreenshot('review-pending-confirmation.png');
  await item.locator('[data-choice="NAO_ATENDIDO"]').click();
  await expect(item).toHaveScreenshot('review-not-attended.png');
  await item.locator('[data-choice="NAO_APLICAVEL"]').click();
  await expect(item).toHaveScreenshot('review-not-applicable.png');
});

test('calendar editor and its event form', async ({ page, fixtureServer }) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
  await assertNoOverflow(page);
  await expect(page).toHaveScreenshot('calendar-editor.png', { fullPage: true });
  await selectEditorSection(page, 'events');
  await page.locator('[data-edit-event="local-event"]').click();
  await expect(page.locator('#event-form')).toBeVisible();
  await assertNoOverflow(page);
  const eventHeading = page.locator('#event-form-title');
  await expect(eventHeading).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      eventHeading.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const feedback = document.querySelector('.editor-feedback')!.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        return (
          bounds.top >= feedback.bottom &&
          (hit === element || Boolean(hit && element.contains(hit)))
        );
      }),
    )
    .toBe(true);
  // Capture the actual viewport after Edit; element screenshots of a taller form
  // scroll it again and can crop away the heading or reposition sticky feedback.
  await expect(page).toHaveScreenshot('calendar-editor-event.png');
  await expect(eventHeading).toBeInViewport({ ratio: 1 });
});

test('event creation explains the pending draft beside the visible action', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await selectEditorSection(page, 'events');
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Encontro com as famílias');
  await page.locator('#close-event-form').click();
  await page.locator('#new-event').click();
  await expect(page.locator('#pending-event-title')).toBeFocused();
  await expect(page.locator('#new-event')).toBeVisible();
  await assertNoOverflow(page);
  await expect(page.locator('#event-creation')).toHaveScreenshot('event-pending-draft.png');
});

test('destructive confirmation with preserved data explained', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('confirmation'));
  await page.locator('#trigger').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Seus dados e documentos serão preservados');
  await assertNoOverflow(page);
  await expect(page).toHaveScreenshot('confirmation.png', { fullPage: true });
});

test('annual Saturdays keep the selection panel next to the year grid', async ({
  page,
  fixtureServer,
}, testInfo) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await selectEditorSection(page, 'days');
  await page.locator('#saturday-dates input[value="2027-03-06"]').check();
  await page.locator('#saturday-dates input[value="2027-04-03"]').check();
  // On a phone the panel opens as a dialog from the sticky bar.
  if (testInfo.project.name === 'chromium-mobile') {
    await page.locator('#saturday-open-panel').click();
    await expect(page.locator('dialog#saturday-panel')).toHaveJSProperty('open', true);
  }
  await page.locator('#saturday-name').fill('Reposição de aulas');
  await page.locator('#saturday-evidence').fill('Ata da reunião de 10/03/2027');
  // Mobile full-page captures shift an intermediate scroll position a few pixels per capture;
  // the end of the page is stable and still shows the panel fields in both layouts.
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.locator('#saturday-name').focus();
  await expect
    .poll(() =>
      page.locator('#saturday-name').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const feedback = document.querySelector('.editor-feedback')!.getBoundingClientRect();
        return (
          bounds.top >= feedback.bottom &&
          document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          ) === element
        );
      }),
    )
    .toBe(true);
  await assertNoOverflow(page);
  await expect(page).toHaveScreenshot('calendar-saturdays.png', { fullPage: true });
});
