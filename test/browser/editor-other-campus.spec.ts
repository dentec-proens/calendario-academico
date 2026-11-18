import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-other-campus-client.ts';

test('a campus follows the calendar of another campus without changing it or reaching its history', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor-other-campus')).origin;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const rename = page.locator('#calendar-rename');
  const history = page.getByRole('link', { name: 'Histórico do calendário', exact: true });
  const submit = page.locator('.editor-footer-conclusion [data-lifecycle-footer-action]');
  // The backend refuses these reads to another campus, so the screen never asks for them.
  const neverAsked = async () => {
    const watched = await page.evaluate(() => window.editorTest.watched());
    expect(watched).toContain('calendars:calendar');
    for (const refused of [
      'calendars:history',
      'calendars:calendarSubmissions',
      'calendars:submissionContent',
      'calendars:replacementPreview',
      'calendars:calendarPage',
    ])
      expect(watched).not.toContain(refused);
  };

  // The same draft, opened by its own campus, offers renaming, the history and the submission.
  await page.goto(origin + '/calendarios/synthetic-calendar/pendencias?proprio');
  await expect(page.locator('#issue-list')).toBeVisible();
  await expect(rename).toBeVisible();
  await expect(history).toBeVisible();
  await expect(submit).toBeVisible();
  await expect(page.locator('#review-reminders')).toBeVisible();

  await page.goto(origin + '/calendarios/synthetic-calendar/editar');
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
  await expect(page.locator('#autosave-status')).toHaveText(
    'Calendário de outro campus (Campus de teste), aberto somente para consulta.',
  );
  await expect(page.locator('#weekdays input').first()).toBeDisabled();
  await expect(rename).toHaveCount(0);
  await expect(history).toHaveCount(0);
  // Going back lands on the list of that campus.
  await expect(page.locator('.editor-back a')).toHaveAttribute('href', /campus=campus-a/);

  await page.locator('[data-view="events"]').click();
  await expect(page.locator('#event-list')).toBeVisible();
  await expect(page.locator('#copy-dates')).toHaveCount(0);
  await page.locator('[data-view="issues"]').click();
  await expect(page.locator('#issue-list')).toBeVisible();
  await expect(page.locator('#review-summary')).toContainText(
    'O campus do calendário corrige as pendências antes do envio.',
  );
  await expect(submit).toHaveCount(0);
  await expect(page.locator('#review-reminders')).toHaveCount(0);
  await neverAsked();

  // Addresses of the private pages explain instead of loading them.
  await page.goto(origin + '/calendarios/synthetic-calendar/operacoes');
  await expect(page.locator('#operations-foreign')).toBeVisible();
  await neverAsked();
  await page.goto(origin + '/calendarios/synthetic-calendar/copiar-datas');
  await expect(page.locator('#copy-dates-locked')).toBeVisible();
  await neverAsked();
  expect(await page.evaluate(() => window.editorTest.calls)).toMatchObject({
    saves: 0,
    transitions: 0,
  });
  expect(errors).toEqual([]);
});
