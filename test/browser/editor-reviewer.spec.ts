import { test, expect } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';
import type {} from '../fixtures/editor-reviewer-client.ts';

test('reviewer consults the complete calendar and live changes without editing or saving', async ({
  page,
  cleanup,
}) => {
  const fixtureUrl = await startFixtureServer('editor-reviewer', cleanup);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${fixtureUrl}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
  await expect(page).toHaveURL(/__editor\?id=synthetic-calendar/);
  await expect(page.locator('#autosave-status')).toContainText(/somente leitura/i);
  await expect(page.locator('input#week-evidence')).toBeDisabled();
  await expect(page.locator('button#make-definitive')).toBeHidden();
  await expect(page.locator('a.editor-history')).toBeHidden();
  await page.locator('[data-view="events"]').click();
  await expect(page.locator('#event-list')).toBeVisible();
  await expect(page.locator('#event-list')).toContainText(/Evento local salvo/);
  await expect(page.locator('button#new-event')).toBeDisabled();
  const eventControls = page.locator('#event-list button, #event-list select, #event-list input');
  await expect(eventControls).not.toHaveCount(0);
  for (const control of await eventControls.all()) await expect(control).toBeDisabled();
  await page.locator('[data-view="history"]').click();
  await expect(page.locator('#history-list')).toContainText(/anterior\.pdf/);
  await expect(page.locator('button#history-submit')).toBeDisabled();
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('#server-save')!.click();
    document
      .querySelector<HTMLFormElement>('#week-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.locator('[data-view="issues"]').click();
  await expect(page.locator('#issue-list')).toBeVisible();
  await page.locator('#issues [data-view="calendar"]').click();
  await expect(page.locator('#months .proens-document')).toBeVisible();
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printed = 'true';
    };
  });
  await page.locator('#print').click();
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'true');
  await expect(page.locator('#autosave-status')).toContainText(/somente leitura/i);
  await page.evaluate(async () => {
    window.editorTest.record.state.events[0].name = 'Evento atualizado pelo campus';
    window.editorTest.record.version++;
    await window.publishReviewerCalendar();
  });
  await page.locator('[data-view="events"]').click();
  await expect(page.locator('#event-list')).toContainText(/Evento atualizado pelo campus/);
  for (const control of await eventControls.all()) await expect(control).toBeDisabled();
  expect(await page.evaluate(() => window.editorTest.calls)).toEqual({
    saves: 0,
    conversions: 0,
    failConversion: false,
  });
  expect(errors).toEqual([]);
});
