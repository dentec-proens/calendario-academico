import { test, expect } from './test.ts';
import { openCampusEvent, savedState, selectCampusEvents } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

const day = (date: string) => `.event-date-calendar .rdp-day[data-day="${date}"] button`;

test('the calendar in the date form fills the fields and leaves typing as it was', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await page.locator('[data-view="events"]').click();
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  const toggle = page.locator('[data-event-calendar-toggle]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#event-start').fill('2027-03-10');
  await toggle.click();
  await expect(page.locator(day('2027-03-10'))).toBeVisible();

  await page.locator(day('2027-03-15')).click();
  await expect(page.locator('#event-start')).toHaveValue('2027-03-15');
  await expect(page.locator('#event-end')).toHaveValue('2027-03-15');
  await page.locator(day('2027-03-18')).click();
  await expect(page.locator('#event-start')).toHaveValue('2027-03-15');
  await expect(page.locator('#event-end')).toHaveValue('2027-03-18');

  await page.locator('#event-end').fill('2027-03-20');
  await expect(page.locator(day('2027-03-20'))).toHaveAttribute('aria-label', /selecionado/);
  await expect(page.locator('dialog#event-panel, #event-panel').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the open calendar follows a date typed in another month', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('editor'));
  await page.locator('[data-view="events"]').click();
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await page.locator('[data-event-calendar-toggle]').click();

  await page.locator('#event-start').fill('2027-02-15');
  await expect(page.locator(day('2027-02-15'))).toHaveAttribute('aria-label', /selecionado/);
  await page.locator('#event-end').fill('2027-04-02');
  await expect(page.locator(day('2027-04-02'))).toHaveAttribute('aria-label', /selecionado/);
  // A day clicked in the month on screen keeps the month.
  await page.locator(day('2027-04-20')).click();
  await expect(page.locator(day('2027-04-20'))).toBeVisible();
  await expect(page.locator('#event-start')).toHaveValue('2027-04-20');
});

test('the calendar names the days that do not count and never blocks them', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await page.locator('[data-view="events"]').click();
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  const date = await page.evaluate(() =>
    window.editorTest.record.institutionalEvents.find((event) => event.effect === 'exclude')!,
  );
  await page.locator('#event-start').fill(date.start);
  await page.locator('[data-event-calendar-toggle]').click();
  const button = page.locator(day(date.start));
  await expect(button).toHaveAttribute('aria-label', new RegExp('não conta como dia letivo'));
  await expect(page.locator('[data-event-calendar-notes]')).toContainText(date.name);
  await button.click();
  await expect(page.locator('#event-end')).toHaveValue(date.start);
});

test('each step shows the issues it corrects, inside the total of the review step', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  const count = (section: string) =>
    page
      .locator(`[data-view="${section}"] .editor-step-note`)
      .getAttribute('data-issue-count', { timeout: 2000 })
      .then(Number)
      .catch(() => 0);
  await expect(page.locator('[data-view="issues"] .editor-step-note')).toBeVisible();
  const steps = (await count('periods')) + (await count('events'));
  expect(steps).toBeGreaterThan(0);
  expect(steps).toBeLessThanOrEqual(await count('issues'));
});

test('the Saturday grid tells in text why days of a month do not count', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await page.locator('[data-view="days"]').click();
  const october = page.locator('.saturday-month', { hasText: 'Outubro' });
  await expect(october.locator('[data-saturday-month-notes]')).toContainText('15 Dia do Professor');
});

test('a removal can be undone until the next change to the calendar', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await page.locator('[data-view="events"]').click();
  await selectCampusEvents(page);
  const stored = async () =>
    (await savedState(page)).state.events.some((event) => event.id === 'local-event');
  await openCampusEvent(page, 'local-event');
  await page.locator('[data-remove-event="local-event"]').click();
  const notice = page.locator('[data-undo-notice]');
  await expect(notice).toContainText('removida do calendário');
  await expect.poll(stored).toBe(false);

  // Saving does not end the offer: it depends on what the person does next.
  await expect(page.locator('[data-undo]')).toBeVisible();
  await page.locator('[data-undo]').click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator('#message')).toContainText('Remoção desfeita.');
  await expect(page.locator('#editor-section-title')).toBeFocused();
  await expect.poll(stored).toBe(true);

  await openCampusEvent(page, 'local-event');
  await page.locator('[data-remove-event="local-event"]').click();
  await expect(notice).toBeVisible();
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Outra data');
  await page.locator('#event-type-holiday').check();
  await page.locator('#event-start').fill('2027-05-03');
  await page.locator('#event-end').fill('2027-05-03');
  await page.locator('#event-form button[type="submit"]').click();
  await expect(notice).toHaveCount(0);
});
