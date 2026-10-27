import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-reviewer-client.ts';

test('reviewer consults the complete calendar and live changes without editing or saving', async ({
  page,
  fixtureServer,
}) => {
  const fixtureUrl = await fixtureServer('editor-reviewer');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(new URL('/calendarios/synthetic-calendar/visualizar', fixtureUrl).href);
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
  await expect(page).toHaveURL(/\/calendarios\/synthetic-calendar\/visualizar/);
  await expect(page.locator('#autosave-status')).toContainText(/somente leitura/i);
  await page.locator('[data-view="edit"]').click();
  await expect(page.locator('input#week-evidence')).toBeDisabled();
  await expect(page.locator('button#make-definitive')).toBeHidden();
  await expect(page.locator('a.editor-history')).toBeHidden();
  await page.locator('[data-view="events"]').click();
  await page.locator('[data-tab="eventos"]').click();
  await expect(page.locator('#event-list')).toBeVisible();
  await expect(page.locator('#event-list')).toContainText(/Evento local salvo/);
  await expect(page.locator('button#new-event')).toBeDisabled();
  const eventControls = page.locator('#event-list button, #event-list select, #event-list input');
  await expect(eventControls).not.toHaveCount(0);
  for (const control of await eventControls.all()) await expect(control).toBeDisabled();
  await selectEditorSection(page, 'history');
  await expect(page.locator('#history-list')).toContainText(/anterior\.pdf/);
  await expect(page.locator('button#history-submit')).toBeDisabled();
  await page.locator('[data-view="edit"]').click();
  await expect(page.locator('#week-confirmed')).toBeDisabled();
  await page.locator('[data-view="issues"]').click();
  await expect(page.locator('#issue-list')).toBeVisible();
  await page
    .locator('#issues')
    .getByRole('link', { name: 'Visualizar calendário', exact: true })
    .click();
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
    synchronizations: 0,
    saves: 0,
    conversions: 0,
    failConversion: false,
  });
  expect(errors).toEqual([]);
});

test('reviewer direct section URLs and reload keep the requested read-only section', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor-reviewer')).origin;
  const requested = origin + '/calendarios/synthetic-calendar/editar';
  await page.goto(requested);
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(page).toHaveURL(requested);
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
    await expect(page.locator('#editor-section-title')).toHaveText('Semana letiva');
    await expect(page.locator('#edit')).toBeVisible();
    await expect(page.locator('[data-view="edit"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#week-evidence')).toBeDisabled();
    await expect(page.locator('#autosave-status')).toContainText(/somente leitura/i);
  }
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});

test('reviewer reads a registered Saturday without selecting, editing or removing it', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor-reviewer-saturdays')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/dias');
  await expect(page.locator('#autosave-status')).toContainText(/somente leitura/i);
  const available = page.locator('#saturday-dates input');
  await expect(available).not.toHaveCount(0);
  for (const control of await available.all()) await expect(control).toBeDisabled();
  await page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]').click();
  await expect(page.locator('#saturday-edit-name')).toHaveValue('Reposição de aulas');
  for (const control of ['#saturday-edit-name', '#saturday-edit-evidence', '#saturday-edit-save'])
    await expect(page.locator(control)).toBeDisabled();
  await expect(page.locator('#saturday-edit-remove')).toBeDisabled();
  await expect(page.locator('#saturday-edit-close')).toBeEnabled();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});
