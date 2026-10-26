import { test, expect } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';
import { addPeriod, savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

declare global {
  interface Window {
    exportTest: { calls: number; reject: () => void };
  }
}

test('reverting a dirty metadata field adopts a newer confirmed event value', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor', cleanup));
  await page.locator('[data-view="events"]').click();
  const category = page.locator('[data-category-event="local-event"]');
  await category.selectOption('feriado');
  await page.locator('[data-edit-event="local-event"]').click();
  await page.locator('#event-category').selectOption('conselho');
  await page.locator('#event-confirmed').check();
  await page.locator('#event-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find((event) => event.id === 'local-event')
            ?.category,
      ),
    )
    .toBe('conselho');
  await expect(category).toHaveValue('feriado');
  await category.selectOption('evento');
  await expect(category).toHaveValue('conselho');
  await expect(page.locator('#unapplied-status')).toBeHidden();
});

test('a blocked save offers an explicit discard path without trapping navigation', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor', cleanup));
  await expect(page.locator('#week-evidence')).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = '/test/fixtures/editor-event-drafts-client.ts';
    const { convex } = (await import(modulePath)) as {
      convex: { mutation: () => Promise<unknown> };
    };
    convex.mutation = () =>
      Promise.reject(Object.assign(new Error('Há uma versão mais recente.'), { status: 409 }));
  });
  await page.locator('#week-evidence').fill('Decisão da sessão desatualizada');
  await page.locator('#editor-continue').click();
  await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'blocked');
  await page.locator('.portal-back').click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('dialog [role="alert"]')).toContainText('versão mais recente');
  await page.locator('.confirmation-dialog__cancel').click();
  await page.getByRole('button', { name: 'Sair sem salvar', exact: true }).click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page).toHaveURL(/\/calendarios$/);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('reverting a field clears unapplied state and annual Saturday selections survive navigation', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor', cleanup));
  const evidence = page.locator('#week-evidence');
  const original = await evidence.inputValue();
  await evidence.fill('Preenchimento temporário');
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await evidence.fill(original);
  await expect(page.locator('#unapplied-status')).toBeHidden();
  await addPeriod(page, '2027-03-01', '2027-04-30');
  const { saves } = await savedState(page);
  await page.locator('[data-view="days"]').click();
  await expect(page.locator('[data-saturday]')).toHaveCount(52);
  await expect(page.locator('#unapplied-status')).toBeHidden();
  await page.locator('#saturday-dates input[value="2027-03-06"]').check();
  await page.locator('#saturday-dates input[value="2027-04-03"]').check();
  await expect(page.locator('#saturday-summary')).toContainText('2 sábados selecionados');
  await page.locator('#saturday-name').fill('Feira de ciências');
  await page.locator('#saturday-evidence').fill('Portaria 1/2027');
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await page.locator('[data-view="periods"]').click();
  await page.locator('#period-name').fill('Rascunho preservado');
  await page.locator('[data-view="events"]').click();
  await page.locator('[data-view="periods"]').click();
  await expect(page.locator('#period-name')).toHaveValue('Rascunho preservado');
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await page.locator('#period-name').fill('');
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await page.locator('[data-view="days"]').click();
  await expect(page.locator('#saturday-name')).toHaveValue('Feira de ciências');
  await expect(page.locator('#saturday-evidence')).toHaveValue('Portaria 1/2027');
  for (const date of ['2027-03-06', '2027-04-03']) {
    const checkbox = page.locator(`#saturday-dates input[value="${date}"]`);
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
  }
  await expect(page.locator('#unapplied-status')).toBeHidden();
  await page.locator('.portal-back').click();
  await expect(page).toHaveURL(/\/calendarios$/);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(saves);
});

test('selecting a Saturday by keyboard keeps focus on its checkbox', async ({ page, cleanup }) => {
  await page.goto(await startFixtureServer('editor', cleanup));
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await selectEditorSection(page, 'days');
  const first = page.locator('#saturday-dates input[value="2027-03-06"]');
  await first.focus();
  await page.keyboard.press('Space');
  await expect(first).toBeChecked();
  // The panel renders its fields after the selection; no later frame may move focus there.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(first).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#saturday-dates input[value="2027-03-13"]')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#saturday-summary')).toContainText('2 sábados selecionados');
  await expect(page.locator('#saturday-name')).toHaveValue('');
});

test('PDF controls share one pending operation and ignore failure after leaving the calendar', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor', cleanup));
  await page.locator('[data-view="calendar"]').click();
  await expect(page.locator('#download-pdf')).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = '/test/fixtures/editor-event-drafts-client.ts';
    const { convex } = (await import(modulePath)) as { convex: { action: () => Promise<unknown> } };
    window.exportTest = { calls: 0, reject: () => {} };
    convex.action = () => {
      window.exportTest.calls++;
      return new Promise((_resolve, reject) => {
        window.exportTest.reject = () => reject(new Error('Falha de uma exportação encerrada'));
      });
    };
  });
  await page.locator('#download-pdf').click();
  await page.waitForFunction(() => window.exportTest.calls === 1);
  await expect(page.locator('#download-pdf')).toBeDisabled();
  await expect(page.locator('#print')).toBeDisabled();
  expect(await page.evaluate(() => window.exportTest.calls)).toBe(1);
  await page.locator('.portal-back').click();
  await expect(page).toHaveURL(/\/calendarios$/);
  await page.evaluate(async () => {
    window.exportTest.reject();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('#message')).not.toContainText('exportação encerrada');
});

test('metadata rejects an activity for another modality before applying or saving', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor', cleanup));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.modalities = ['integrado', 'graduacao'];
    record.modalities = ['integrado', 'graduacao'];
    record.state.assessmentStagesByModality = { graduacao: 2 };
    record.version++;
    return window.publishReviewerCalendar();
  });
  await page.locator('[data-view="events"]').click();
  const link = page.locator('[data-link-activity="local-event"]');
  const form = link.locator('xpath=ancestor::form');
  await link.selectOption('stage-1:graduacao');
  await form.getByRole('button', { name: 'Aplicar categoria e vínculo' }).click();
  await expect(form.locator('[role="alert"]')).toContainText('somente a oferta da atividade');
  expect(
    await page.evaluate(
      () =>
        window.editorTest.record.state.events.find((event) => event.id === 'local-event')
          ?.requirementId,
    ),
  ).toBeUndefined();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});

test('removing a historical exclusion recalculates the teaching-day target', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor', cleanup));
  await page.locator('[data-view="periods"]').click();
  await page.locator('#period-name').fill('Cinco dias letivos');
  await page.locator('#period-start').fill('2027-03-01');
  await page.locator('#period-days').fill('5');
  await page.locator('#period-submit').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.periods[0]?.end))
    .toBe('2027-03-05');
  await selectEditorSection(page, 'history');
  await page.locator('[data-analyze-history="history-a"]').click();
  await page.locator('[data-history-candidate="0"]').click();
  await page.locator('#event-kind').selectOption('exclude');
  await page.locator('#event-start').fill('2027-03-03');
  await page.locator('#event-end').fill('2027-03-03');
  await page.locator('#event-evidence').fill('Lei municipal vigente');
  await page.locator('#event-confirmed').check();
  await page.locator('#event-form button[type="submit"]').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.periods[0].end))
    .toBe('2027-03-08');
  await page.locator('[data-history-item="0"] [data-remove-event]').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.periods[0].end))
    .toBe('2027-03-05');
  expect(
    await page.evaluate(() =>
      window.editorTest.record.state.events.some((event) => event.historicalSource),
    ),
  ).toBe(false);
});

test('event removal clears its metadata draft and grouped teacher vacations', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor', cleanup));
  await page.locator('[data-view="events"]').click();
  await page.locator('[data-category-event="local-event"]').selectOption('feriado');
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await page.locator('[data-remove-event="local-event"]').click();
  await expect(page.locator('#unapplied-status')).toBeHidden();
  await page.locator('[data-view="vacations"]').click();
  await page.locator('#vacation-first-start').fill('2027-01-04');
  await page.locator('#vacation-first-end').fill('2027-01-20');
  await page.locator('#vacation-second-start').fill('2027-07-01');
  await page.locator('#vacation-second-end').fill('2027-07-15');
  await page.locator('#vacation-evidence').fill('Decisão do campus');
  await page.locator('#vacation-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.filter((event) => event.category === 'ferias')
            .length,
      ),
    )
    .toBe(2);
  await page.locator('[data-view="events"]').click();
  await page.locator('[data-remove-event="teacher-vacation-january"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.filter((event) => event.category === 'ferias')
            .length,
      ),
    )
    .toBe(0);
  expect(
    await page.evaluate(() => window.editorTest.record.state.teacherVacations),
  ).toBeUndefined();
  await page.locator('[data-view="vacations"]').click();
  await expect(page.locator('#vacation-first-start')).toHaveValue('');
});

test('stage editing and activity changes always reveal the same draft in its destination', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('editor', cleanup));
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.assessmentStagesByModality = { integrado: 2 };
    record.state.events.push({
      id: 'stage-existing',
      name: 'Primeira etapa salva',
      requirementId: 'stage-1:integrado',
      start: '2027-03-01',
      end: '2027-03-12',
      kind: 'note',
      category: 'limite',
      evidence: 'Organização pedagógica',
      modalities: ['integrado'],
    });
    record.version++;
    return window.publishReviewerCalendar();
  });
  await page.locator('[data-view="events"]').click();
  await page.locator('[data-edit-event="stage-existing"]').click();
  await expect(page).toHaveURL(/\/avaliacoes$/);
  await expect(page.locator('#event-form')).toBeVisible();
  await page.locator('#event-name').fill('Etapa com rascunho');
  await page.locator('#event-requirement').selectOption('family-meeting');
  await expect(page).toHaveURL(/\/eventos$/);
  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#event-name')).toHaveValue('Etapa com rascunho');
  await page.locator('#discard-event-form').click();
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Novo preenchimento');
  await page.locator('#event-requirement').selectOption('stage-2:integrado');
  await expect(page).toHaveURL(/\/avaliacoes$/);
  await page.locator('#event-requirement').selectOption('family-meeting');
  await expect(page).toHaveURL(/\/eventos$/);
  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#event-name')).toHaveValue('Novo preenchimento');
});
