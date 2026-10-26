import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`event creation stays available without losing pending fields at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
    await selectEditorSection(page, 'events');
    const add = page.locator('#new-event');
    const notice = page.locator('#pending-event');

    await add.click();
    await expect(add).toBeVisible();
    await page.locator('#close-event-form').click();
    await expect(add).toBeFocused();
    await expect(page.locator('#resume-event')).toBeHidden();
    await expect(notice).toBeHidden();

    await page.locator('[data-edit-event="local-event"]').click();
    await page.locator('#close-event-form').click();
    await expect(page.locator('[data-edit-event="local-event"]')).toBeFocused();
    await expect(page.locator('#resume-event')).toBeHidden();
    await add.press('Enter');
    await expect(page.locator('#event-form-title')).toHaveText('Novo evento local');
    await page.locator('#event-name').fill('Evento para continuar depois');
    await page.locator('#event-evidence').fill('Fonte preservada');
    await page.locator('#event-start').fill('2027-04-05');
    await page.locator('#event-end').fill('2027-04-06');
    await page.locator('#close-event-form').click();

    await expect(add).toBeVisible();
    await expect(add).toBeEnabled();
    await expect(notice).toContainText('Evento para continuar depois');
    await add.press('Enter');
    await expect(page.locator('#pending-event-title')).toBeFocused();
    await expect(page.locator('#pending-event-title')).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() =>
        page.locator('#pending-event-title').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const feedback = document.querySelector('.editor-feedback')!.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return bounds.top >= feedback.bottom && (hit === element || element.contains(hit));
        }),
      )
      .toBe(true);
    await expect(page.locator('#event-form')).toBeHidden();
    await page.keyboard.press('Tab');
    await expect(page.locator('#resume-pending-event')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#event-form-title')).toBeFocused();
    await expect(page.locator('#event-name')).toHaveValue('Evento para continuar depois');
    await expect(page.locator('#event-evidence')).toHaveValue('Fonte preservada');
    await expect(page.locator('#event-start')).toHaveValue('2027-04-05');
    await expect(page.locator('#event-end')).toHaveValue('2027-04-06');

    // The visible action must protect the current new-event context too.
    await add.click();
    await expect(page.locator('#event-name')).toHaveValue('Evento para continuar depois');
    await expect(page.locator('#pending-event-title')).toBeFocused();
    await page.locator('#discard-pending-event').click();
    await expect(add).toBeFocused();
    await expect(notice).toBeHidden();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    await add.press('Enter');
    await expect(page.locator('#event-name')).toHaveValue('');

    await page.locator('#event-name').fill('Primeiro evento incluído');
    await page.locator('#event-kind').selectOption('note');
    await page.locator('#event-evidence').fill('Ata de teste');
    await page.locator('#event-start').fill('2027-04-07');
    await page.locator('#event-end').fill('2027-04-07');
    await page.locator('#event-confirmed').check();
    await page.locator('#event-form button[type="submit"]').click();
    await expect(page.locator('#event-form-title')).toHaveText('Editar evento local');
    await expect(notice).toBeHidden();
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.locator('#event-form-title')).toHaveText('Novo evento local');
    await expect(page.locator('#event-name')).toHaveValue('');
    await expect(page.locator('#event-list')).toContainText('Primeiro evento incluído');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
}

test('editor separates creation from editing and preserves closed activity/history drafts until explicit discard', async ({
  page,
  fixtureServer,
}) => {
  const fixtureUrl = await fixtureServer('editor');
  await page.setViewportSize({ width: 1440, height: 1100 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('dialog', (dialog) => {
    void dialog.dismiss();
  });
  await page.goto(`${fixtureUrl}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
  const fields = () =>
    page.locator('#event-form input, #event-form select').evaluateAll((nodes) =>
      nodes.map((node) => {
        const input = node as HTMLInputElement;
        return { id: input.id, name: input.name, value: input.value, checked: input.checked };
      }),
    );
  const setDates = async (start: string, end = start) => {
    await page.locator('#event-start').fill(start);
    await page.locator('#event-end').fill(end);
  };
  const cancel = async () => {
    await page.locator('#discard-event-form').click();
    await expect(page.locator('#event-form')).toBeHidden();
    await expect(page.locator('#resume-event')).toBeHidden();
    await expect(page.locator('#unapplied-status')).toBeHidden();
  };
  const submit = () => page.locator('#event-form button[type="submit"]').click();

  await selectEditorSection(page, 'events');
  await expect(page.locator('#event-form')).toBeHidden();
  await page.locator('[data-edit-event="local-event"]').click();
  await expect(page.locator('#new-event')).toBeVisible();
  await expect(page.locator('#event-form-title')).toHaveText('Editar evento local');
  await page.locator('#event-name').fill('Edição local ainda não aplicada');
  await page.locator('#event-evidence').fill('Fonte digitada');
  await setDates('2027-03-11', '2027-03-12');
  const localDraft = await fields();
  await page.locator('#close-event-form').click();
  await expect(page.locator('#event-form')).toBeHidden();
  await page.locator('#new-event').click();
  await expect(page.locator('#pending-event')).toContainText('Edição local ainda não aplicada');
  expect(await fields()).toEqual(localDraft);
  await page.locator('#resume-event').click();
  await expect(page.locator('#event-form')).toBeVisible();
  expect(await fields()).toEqual(localDraft);
  await cancel();
  expect(await page.evaluate(() => window.editorTest.record.state.events[0].name)).toBe(
    'Evento local salvo',
  );
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await expect(page.locator('#new-event')).toBeVisible();
  await page.locator('#new-event').click();
  await expect(page.locator('#event-form-title')).toHaveText('Novo evento local');
  await page.locator('#event-name').fill('Texto antes de escolher a atividade');
  await page.selectOption('#event-requirement', 'family-meeting');
  await expect(page.locator('input#event-name')).toHaveValue('Texto antes de escolher a atividade');
  await page.selectOption('#event-requirement', '');
  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#close-event-form')).toBeVisible();
  await page.locator('#event-name').fill('Evento novo independente');
  await page.selectOption('#event-kind', 'note');
  await page.locator('#event-evidence').fill('Fonte do cadastro');
  await setDates('2027-04-05');
  await page.locator('#event-confirmed').click();
  await submit();
  await page.waitForFunction(() =>
    window.editorTest.record.state.events.some(
      (event) => event.name === 'Evento novo independente',
    ),
  );
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(3);
  await expect(page.locator('#event-form-title')).toHaveText('Editar evento local');
  await cancel();

  await page.locator('[data-edit-activity-event="activity-event"]').click();
  await page.locator('#event-name').fill('Semana cultural em edição');
  await page.locator('#event-hours').fill('12');
  await page.locator('#event-evidence').fill('Fonte da atividade');
  await setDates('2027-10-05', '2027-10-09');
  await page.locator('#event-confirmed').click();
  const activityDraft = await fields();
  await page.locator('#cancel-inline-history').click();
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await page.locator('#new-event').click();
  await expect(page.locator('#pending-event')).toContainText('Semana cultural em edição');
  expect(await fields()).toEqual(activityDraft);
  await page.locator('[data-prepare-activity="family-meeting"]').click();
  expect(await fields()).toEqual(activityDraft);
  await page.locator('[data-edit-activity-event="activity-event"]').click();
  await expect(page.locator('[data-activity-row="cultural-week"] #event-form')).toBeVisible();
  expect(await fields()).toEqual(activityDraft);
  await submit();
  await page.waitForFunction(() =>
    window.editorTest.record.state.events.some(
      (event) => event.id === 'activity-event' && event.name === 'Semana cultural em edição',
    ),
  );
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(3);
  await cancel();
  await page.locator('[data-prepare-activity="family-meeting"]').click();
  await page.locator('#event-evidence').fill('Preenchimento de atividade nova');
  const newActivityDraft = await fields();
  await page.locator('#cancel-inline-history').click();
  await page.locator('[data-prepare-activity="family-meeting"]').click();
  expect(await fields()).toEqual(newActivityDraft);
  await cancel();
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(3);

  await selectEditorSection(page, 'history');
  await page.locator('[data-analyze-history="history-a"]').click();
  await expect(page.locator('[data-history-candidate="0"]')).toBeVisible();
  await page.locator('[data-history-candidate="0"]').click();
  await expect(page.locator('#event-start')).toHaveValue('');
  await expect(page.locator('#event-end')).toHaveValue('');
  await page.locator('#event-name').fill('Evento histórico conferido');
  await page.locator('#event-evidence').fill('Lei municipal vigente');
  await page.locator('#event-hours').fill('4');
  await setDates('2027-05-03', '2027-05-04');
  await page.locator('#event-confirmed').click();
  const historyDraft = await fields();
  const provenance = await page
    .locator('#historical-event-source')
    .evaluate((node) => node.textContent);
  await page.locator('#open-history').click();
  await expect(page.locator('#event-form')).toBeHidden();
  await page.locator('#resume-event').click();
  await expect(page.locator('#calendario-anterior')).toHaveAttribute('open', '');
  await expect(page.locator('#event-form-title')).toBeFocused();
  await expect(page.locator('#event-form')).toHaveCount(1);
  expect(await fields()).toEqual(historyDraft);
  await selectEditorSection(page, 'periods');
  await page.locator('#resume-event').click();
  await expect(page).toHaveURL(/\/eventos#calendario-anterior$/);
  await expect(page.locator('#calendario-anterior')).toHaveAttribute('open', '');
  await expect(page.locator('#event-form-title')).toBeFocused();
  expect(await fields()).toEqual(historyDraft);
  const savesBeforeClose = await page.evaluate(() => window.editorTest.calls.saves);
  await page.locator('#cancel-inline-history').click();
  await expect(page.locator('#event-form')).toBeHidden();
  await page.locator('#new-event').click();
  await expect(page.locator('#pending-event')).toContainText('Evento histórico conferido');
  expect(await fields()).toEqual(historyDraft);
  await page.locator('#show-existing-history').click();
  await page.locator('[data-history-candidate="1"]').click();
  expect(await fields()).toEqual(historyDraft);
  await page.locator('[data-history-candidate="0"]').click();
  await expect(page.locator('[data-history-item="0"] #event-form')).toBeVisible();
  expect(await fields()).toEqual(historyDraft);
  await expect(page.locator('#historical-event-source')).toHaveText(provenance);
  await expect(page.locator('#historical-event-source')).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(savesBeforeClose);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await submit();
  await page.waitForFunction(() =>
    window.editorTest.record.state.events.some(
      (event) => event.name === 'Evento histórico conferido',
    ),
  );
  const saved = await page.evaluate(() =>
    window.editorTest.record.state.events.find(
      (event) => event.name === 'Evento histórico conferido',
    ),
  );
  expect(saved?.historicalSource?.historyId).toBe('history-a');
  expect(saved?.historicalSource?.page).toBe(1);
  expect(saved?.historicalSource?.candidateKey).toBeTruthy();
  await selectEditorSection(page, 'events');
  await cancel();
  await selectEditorSection(page, 'history');
  await page.locator('[data-history-candidate="1"]').click();
  await page.locator('#event-evidence').fill('Este preenchimento será descartado');
  const savesBeforeCancel = await page.evaluate(() => window.editorTest.calls.saves);
  await cancel();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(savesBeforeCancel);
  await page.locator('[data-history-candidate="1"]').click();
  await expect(page.locator('input#event-evidence')).toHaveValue('');
  await cancel();
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(4);
  expect(errors).toEqual([]);
});
