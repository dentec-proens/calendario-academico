import type { Page } from '@playwright/test';
import { test, expect, type Cleanup } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';
import type {} from '../fixtures/editor-client.ts';

async function openEditor(page: Page, cleanup: Cleanup) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(await startFixtureServer('editor', cleanup));
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
}

async function addPeriod(page: Page, start: string, end: string) {
  await page.locator('[data-view="periods"]').click();
  await page.locator('#period-name').fill('Período de aulas');
  await page.locator('#period-start').fill(start);
  await page.locator('#period-end').fill(end);
  await page.locator('#period-submit').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.periods.length))
    .toBe(1);
}

async function savedState(page: Page) {
  await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'saved');
  return page.evaluate(() => ({
    state: window.editorTest.record.state,
    saves: window.editorTest.calls.saves,
  }));
}

test('week form applies confirmed weekdays and rejects an empty week atomically', async ({
  page,
  cleanup,
}) => {
  await openEditor(page, cleanup);
  await page.locator('[data-view="edit"]').click();
  const weekdays = page.locator('#weekdays input');
  for (const checkbox of await weekdays.all()) await checkbox.uncheck();
  await page.locator('#week-evidence').fill('Resolução da semana letiva');
  await page.locator('#week-confirmed').check();
  await page.locator('#week-form button[type="submit"]').click();
  await expect(page.locator('#week-form [role="alert"]')).toHaveText(
    'Selecione pelo menos um dia regular.',
  );
  expect(await page.evaluate(() => window.editorTest.record.state.weekdays)).toEqual([
    1, 2, 3, 4, 5,
  ]);
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  for (const day of [1, 3, 5]) await page.locator(`#weekdays input[value="${day}"]`).check();
  await page.locator('#week-form button[type="submit"]').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.weekdays))
    .toEqual([1, 3, 5]);
  expect((await savedState(page)).state.weekEvidence).toBe('Resolução da semana letiva');
});

test('period form calculates a teaching-day target, edits the same period and rejects overlap', async ({
  page,
  cleanup,
}) => {
  await openEditor(page, cleanup);
  await page.locator('[data-view="periods"]').click();
  await page.locator('#period-name').fill('Primeiro período');
  await page.locator('#period-start').fill('2027-02-01');
  await page.locator('#period-days').fill('5');
  await expect(page.locator('#period-end')).toHaveValue('2027-02-05');
  await expect(page.locator('#period-end')).toHaveAttribute('readonly', '');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await page.locator('#period-submit').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.periods.length))
    .toBe(1);
  const original = (await savedState(page)).state.periods[0];
  expect(original).toMatchObject({ name: 'Primeiro período', targetDays: 5, end: '2027-02-05' });
  await page.locator(`[data-edit-period="${original.id}"]`).click();
  await expect(page.locator('#period-name')).toHaveValue('Primeiro período');
  await page.locator('#period-name').fill('Período ampliado');
  await page.locator('#period-days').fill('10');
  await expect(page.locator('#period-end')).toHaveValue('2027-02-12');
  await page.locator('#period-submit').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.periods[0].targetDays))
    .toBe(10);
  const before = await savedState(page);
  expect(before.state.periods).toEqual([
    { ...original, name: 'Período ampliado', targetDays: 10, end: '2027-02-12' },
  ]);
  await page.locator('#period-name').fill('Sobreposição inválida');
  await page.locator('#period-start').fill('2027-02-10');
  await page.locator('#period-end').fill('2027-02-15');
  await page.locator('#period-submit').click();
  await expect(page.locator('#period-form [role="alert"]')).toContainText('se sobrepõe a outro');
  expect(await savedState(page)).toEqual(before);
});

test('assessment settings require apply, generate stages and restore automatic dates after a manual edit', async ({
  page,
  cleanup,
}) => {
  await openEditor(page, cleanup);
  await addPeriod(page, '2027-03-01', '2027-03-26');
  await savedState(page);
  await page.locator('[data-assessment-modality="integrado"]').selectOption('4');
  expect(
    await page.evaluate(() => window.editorTest.record.state.assessmentStagesByModality),
  ).toEqual({});
  await page.getByRole('button', { name: 'Aplicar organização das etapas' }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.assessmentStagesByModality))
    .toEqual({ integrado: 4 });
  await page.locator('[data-prepare-activity="stage-1:integrado"]').click();
  await page.locator('#event-start').fill('2027-03-01');
  await page.locator('#event-evidence').fill('Organização pedagógica aprovada');
  await page.locator('#event-confirmed').check();
  await page.locator('#apply-stage-suggestion').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.filter((event) =>
            event.requirementId?.startsWith('stage-'),
          ).length,
      ),
    )
    .toBe(4);
  const automatic = (await savedState(page)).state.events.filter((event) =>
    event.requirementId?.startsWith('stage-'),
  );
  expect(automatic.map((event) => [event.start, event.end])).toEqual([
    ['2027-03-01', '2027-03-05'],
    ['2027-03-08', '2027-03-12'],
    ['2027-03-15', '2027-03-19'],
    ['2027-03-22', '2027-03-26'],
  ]);
  await page.locator('[data-prepare-activity="stage-1:integrado"]').click();
  await page.locator('#event-end').fill('2027-03-04');
  await page.locator('#event-confirmed').check();
  await page.locator('#event-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find(
            (event) => event.requirementId === 'stage-1:integrado',
          )?.end,
      ),
    )
    .toBe('2027-03-04');
  expect(
    (await savedState(page)).state.events
      .filter((event) => event.requirementId?.startsWith('stage-'))
      .every((event) => !event.assessmentAutoStart),
  ).toBe(true);
  await page.locator('#recalculate-stages').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find(
            (event) => event.requirementId === 'stage-1:integrado',
          )?.end,
      ),
    )
    .toBe('2027-03-05');
  expect(
    (await savedState(page)).state.events
      .filter((event) => event.requirementId?.startsWith('stage-'))
      .map((event) => event.assessmentAutoStart),
  ).toEqual(Array<string>(4).fill('2027-03-01'));
});

test('Saturday form includes a selected date once and rejects dates outside teaching periods', async ({
  page,
  cleanup,
}) => {
  await openEditor(page, cleanup);
  await addPeriod(page, '2027-03-01', '2027-03-31');
  await page.locator('[data-view="days"]').click();
  await page.locator('#saturday-month').selectOption('3');
  await page.locator('#saturday-dates input[value="2027-03-06"]').check();
  await page.locator('#saturday-evidence').fill('Plano de reposição aprovado');
  await page.locator('#saturday-form input[type="checkbox"][required]').check();
  await page.locator('#saturday-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.filter((event) => event.category === 'sabado')
            .length,
      ),
    )
    .toBe(1);
  const before = await savedState(page);
  expect(before.state.events.find((event) => event.category === 'sabado')).toMatchObject({
    start: '2027-03-06',
    end: '2027-03-06',
    kind: 'include',
  });
  await expect(page.locator('#saturday-month')).toHaveValue('3');
  await expect(page.locator('#saturday-evidence')).toHaveValue('Plano de reposição aprovado');
  await expect(page.locator('#saturday-dates input[value="2027-03-06"]')).toBeDisabled();
  await page.locator('#saturday-month').selectOption('4');
  await page.locator('#saturday-dates input[value="2027-04-03"]').check();
  await page.locator('#saturday-form input[type="checkbox"][required]').check();
  await page.locator('#saturday-form button[type="submit"]').click();
  await expect(page.locator('#saturday-form [role="alert"]')).toContainText('períodos');
  expect(await savedState(page)).toEqual(before);
});

test('vacation form supports duration and manual end dates and rejects overlapping periods atomically', async ({
  page,
  cleanup,
}) => {
  await openEditor(page, cleanup);
  await page.locator('[data-view="days"]').click();
  await page.locator('#vacation-first-start').fill('2027-01-04');
  await page.locator('#vacation-first-days').fill('10');
  await expect(page.locator('#vacation-first-end')).toHaveValue('2027-01-13');
  await page.locator('#vacation-first-end').fill('2027-01-20');
  await expect(page.locator('#vacation-first-days')).toHaveValue('');
  await expect(page.locator('#vacation-first-end')).toHaveValue('2027-01-20');
  await page.locator('#vacation-second-start').fill('2027-07-01');
  await page.locator('#vacation-second-days').fill('15');
  await expect(page.locator('#vacation-second-end')).toHaveValue('2027-07-15');
  await page.locator('#vacation-evidence').fill('Decisão do campus sobre férias');
  await expect(page.locator('#vacation-preview')).toContainText('32 dias');
  await page.locator('#vacation-form button[type="submit"]').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.teacherVacations?.firstEnd))
    .toBe('2027-01-20');
  const before = await savedState(page);
  expect(before.state.events.filter((event) => event.category === 'ferias')).toHaveLength(2);
  expect(before.state.events.some((event) => event.id === 'local-event')).toBe(true);
  await page.locator('#vacation-third-start').fill('2027-07-10');
  await page.locator('#vacation-third-end').fill('2027-07-20');
  await page.locator('#vacation-form button[type="submit"]').click();
  await expect(page.locator('#vacation-form [role="alert"]')).toContainText('sobrepor');
  expect(await savedState(page)).toEqual(before);
});

test('Teacher Day is applied and restored explicitly and its native date bounds prevent saving outside the week', async ({
  page,
  cleanup,
}) => {
  await openEditor(page, cleanup);
  await page.locator('[data-view="events"]').click();
  await page.locator('#teacher-day-date').fill('2027-10-14');
  expect(await page.evaluate(() => window.editorTest.record.state.teacherDayDate)).toBeUndefined();
  await page.locator('#apply-teacher-day').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.teacherDayDate))
    .toBe('2027-10-14');
  await savedState(page);
  await page.locator('#reset-teacher-day').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.teacherDayDate))
    .toBeUndefined();
  await expect(page.locator('#teacher-day-date')).toHaveValue('2027-10-15');
  const before = await savedState(page);
  await page.locator('#teacher-day-date').fill('2027-10-20');
  await page.locator('#apply-teacher-day').click();
  expect(
    await page
      .locator('#teacher-day-date')
      .evaluate((node) => (node as HTMLInputElement).validity.rangeOverflow),
  ).toBe(true);
  expect(await savedState(page)).toEqual(before);
});

test('event metadata commits category and activity together without changing event identity or dates', async ({
  page,
  cleanup,
}) => {
  await openEditor(page, cleanup);
  await page.locator('[data-view="events"]').click();
  const original = await page.evaluate(() =>
    window.editorTest.record.state.events.find((event) => event.id === 'local-event'),
  );
  const category = page.locator('[data-category-event="local-event"]');
  await category.selectOption('feriado');
  await page.locator('[data-link-activity="local-event"]').selectOption('family-meeting');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await category
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Aplicar categoria e vínculo' })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find((event) => event.id === 'local-event')
            ?.category,
      ),
    )
    .toBe('feriado');
  expect((await savedState(page)).state.events.find((event) => event.id === 'local-event')).toEqual(
    { ...original, category: 'feriado', requirementId: 'family-meeting' },
  );
});

test('clean fields receive remote defaults while unapplied values survive a later remote update', async ({
  page,
  cleanup,
}) => {
  await openEditor(page, cleanup);
  await page.evaluate(async () => {
    window.editorTest.record.version++;
    window.editorTest.record.state.weekEvidence = 'Semana atualizada em outra sessão';
    window.editorTest.record.state.weekdays = [2, 4];
    await window.publishReviewerCalendar();
  });
  await expect(page.locator('#week-evidence')).toHaveValue('Semana atualizada em outra sessão');
  await expect(page.locator('#weekdays input[value="1"]')).not.toBeChecked();
  await expect(page.locator('#weekdays input[value="2"]')).toBeChecked();
  await page.locator('#week-evidence').fill('Decisão local ainda não aplicada');
  await page.evaluate(async () => {
    window.editorTest.record.version++;
    window.editorTest.record.state.weekEvidence = 'Nova atualização remota';
    await window.publishReviewerCalendar();
  });
  await expect(page.locator('#week-evidence')).toHaveValue('Decisão local ainda não aplicada');
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await expect(page.locator('.editor-feedback .notice')).toContainText('outra sessão');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});
