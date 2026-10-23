import { test, expect } from './test.ts';
import type { Page } from '@playwright/test';
import { startFixtureServer } from './fixture-server.ts';

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

test('portal calendar dashboard', async ({ page, cleanup }) => {
  await page.goto(await startFixtureServer('portal', cleanup));
  await expect(page.locator('#calendar-list')).toContainText('Calendário de teste');
  await assertNoOverflow(page);
  await expect(page).toHaveScreenshot('portal-dashboard.png', { fullPage: true });
});

test('calendar creation form', async ({ page, cleanup }) => {
  await page.goto(await startFixtureServer('portal', cleanup));
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.locator('#calendars .collection-heading button').click();
  await page.locator('#calendar-courses').fill('Técnico em Informática');
  await page.locator('input[name="calendar-modality"]').first().check();
  await page.locator('#calendar-courses').blur();
  await expect(page.locator('#create-calendar')).toBeVisible();
  await assertNoOverflow(page);
  await expect(page).toHaveScreenshot('calendar-creation.png', { fullPage: true });
});

test('review with a pending confirmed criterion', async ({ page, cleanup }) => {
  await page.goto(await startFixtureServer('review', cleanup));
  await page.locator('#open-review').click();
  const item = page.locator('#review-items > li').first();
  await expect(item.locator('textarea')).toBeEnabled();
  await item.locator('[data-choice="ATENDIDO"]').click();
  await item.locator('textarea').fill('Conferência documental registrada.');
  await item.locator('[data-confirm-criterion]').click();
  await expect(item.locator('[data-origin]')).toContainText('por salvar');
  await assertNoOverflow(page);
  await expect(item).toHaveScreenshot('review-pending-confirmation.png');
});

test('calendar editor and its event form', async ({ page, cleanup }) => {
  await page.goto(`${await startFixtureServer('editor', cleanup)}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
  await assertNoOverflow(page);
  await expect(page).toHaveScreenshot('calendar-editor.png', { fullPage: true });
  await page.locator('[data-view="events"]').click();
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

test('destructive confirmation with preserved data explained', async ({ page, cleanup }) => {
  await page.goto(await startFixtureServer('confirmation', cleanup));
  await page.locator('#trigger').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Seus dados e documentos serão preservados');
  await assertNoOverflow(page);
  await expect(page).toHaveScreenshot('confirmation.png', { fullPage: true });
});
