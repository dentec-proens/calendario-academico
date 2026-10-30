import type { FixtureServer } from './fixture-server.ts';
import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import {
  addPeriod,
  savedState,
  selectCampusEvents,
  selectEditorSection,
  editCampusEvent,
} from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

async function openEditor(page: Page, fixtureServer: FixtureServer) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
}

test('week form applies confirmed weekdays and rejects an empty week atomically', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await page.locator('[data-view="edit"]').click();
  const weekdays = page.locator('#weekdays input');
  await expect(weekdays).toHaveCount(5);

  for (const checkbox of await weekdays.all()) await checkbox.uncheck();

  await page.locator('#editor-continue').click();
  await expect(page.locator('#week-form [role="alert"]')).toHaveText(
    'Selecione pelo menos um dia regular.',
  );
  expect(await page.evaluate(() => window.editorTest.record.state.weekdays)).toEqual([
    1, 2, 3, 4, 5,
  ]);
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  for (const day of [1, 3, 5]) await page.locator(`#weekdays input[value="${day}"]`).check();
  await page.locator('#editor-continue').click();
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.weekdays))
    .toEqual([1, 3, 5]);
  expect((await savedState(page)).state).not.toHaveProperty('weekEvidence');
});

test('offer organization applies manual assessment dates and preserves them after a holiday changes', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await addPeriod(page, '2027-03-01', '2027-03-26');
  const before = await savedState(page);
  await page.locator('[data-edit-organization="integrado"]').click();
  await page.locator('#offer-integrado-stage-0-end').fill('2027-03-14');
  await page.locator('#offer-integrado-stage-1-start').fill('2027-03-15');
  await page.locator('#offer-integrado-apply').click();
  const applied = await savedState(page);
  expect(
    applied.state.events.filter((event) => event.requirementId?.startsWith('stage-')),
  ).toHaveLength(2);
  expect(
    applied.state.events.find((event) => event.requirementId === 'stage-1:integrado')?.end,
  ).toBe('2027-03-14');
  expect(applied.state.periods).toEqual(before.state.periods);
  expect(
    applied.state.events
      .filter((event) => event.requirementId?.startsWith('stage-'))
      .every((event) => !event.assessmentAutoStart),
  ).toBe(true);
});

test('Saturday panel applies one activity to the selected dates without moving focus', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await page.locator('[data-view="days"]').click();
  await expect(page.locator('[data-saturday]')).toHaveCount(52);
  const first = page.locator('#saturday-dates input[value="2027-03-06"]');
  await first.check();
  await expect(first).toBeFocused();
  await expect(page.locator('#saturday-name')).toBeInViewport();
  await page.locator('#saturday-dates input[value="2027-04-03"]').check();
  await expect(page.locator('#saturday-summary')).toContainText('2 sábados selecionados');
  await page.locator('#saturday-name').fill('Reposição de aulas');

  await expect(page.locator('#saturday-submit')).toHaveText('Adicionar 2 sábados');
  await page.locator('#saturday-submit').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events
          .filter((event) => event.category === 'sabado')
          .map(({ start, end, name, kind }) => ({ start, end, name, kind }))
          .sort((a, b) => a.start.localeCompare(b.start)),
      ),
    )
    .toEqual(
      ['2027-03-06', '2027-04-03'].map((date) => ({
        start: date,
        end: date,
        name: 'Reposição de aulas',
        kind: 'include',
      })),
    );
  await expect(page.locator('[data-saturday="2027-03-06"]')).toHaveAttribute(
    'data-status',
    'registered',
  );
  await expect(page.locator('#saturday-name')).toHaveCount(0);
  // The submit button leaves with the selection; focus moves to the first registered date.
  await expect(page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]')).toBeFocused();
  await page.locator('#saturday-panel [data-edit-saturday]').first().click();
  await expect(page.locator('#saturday-edit-title')).toBeFocused();
  await expect(page.locator('#saturday-edit-title')).toContainText('06/03');

  // The next selection offers the activities already used.
  await page.locator('#saturday-dates input[value="2027-03-13"]').check();
  await expect(page.locator('#saturday-evidence')).toHaveCount(0);
  await expect(page.locator('#saturday-name')).toHaveValue('');
  await page
    .locator('.saturday-suggestions')
    .getByRole('button', { name: 'Reposição de aulas' })
    .click();
  await expect(page.locator('#saturday-name')).toHaveValue('Reposição de aulas');
  await expect(page.locator('#saturday-name')).toBeFocused();
});

test('the Saturday panel stays beside the grid while dates near the end of the year are checked', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  // A shorter desktop window keeps the end of the year and the top of the panel apart.
  await page.setViewportSize({ width: 1440, height: 800 });
  await addPeriod(page, '2027-03-01', '2027-12-17');
  await page.locator('[data-view="days"]').click();
  const december = page.locator('#saturday-dates input[value="2027-12-04"]');
  await december.click();
  await expect(december).toBeFocused();
  await expect(page.locator('#saturday-name')).toBeInViewport({ ratio: 1 });
});

test('compact Saturday panel opens as a dialog and keeps focused dates unobstructed', async ({
  page,
  fixtureServer,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
  await addPeriod(page, '2027-03-01', '2027-12-17');
  await selectEditorSection(page, 'days');
  await expect(page.locator('#saturday-compact-bar')).toHaveCount(0);
  const first = page.locator('#saturday-dates input[value="2027-03-06"]');
  await first.check();
  await expect(first).toBeFocused();
  const bar = page.locator('#saturday-compact-bar');
  await expect(bar).toContainText('1 sábado selecionado');
  await expect(page.locator('#saturday-name')).toBeHidden();

  // The sticky bar never covers the date that has keyboard focus.
  const december = page.locator('#saturday-dates input[value="2027-12-11"]');
  await december.focus();
  await expect
    .poll(() =>
      december.evaluate((input) => {
        const bounds = input.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        return hit === input || hit === input.closest('label');
      }),
    )
    .toBe(true);

  const open = page.locator('#saturday-open-panel');
  await open.click();
  const panel = page.locator('dialog#saturday-panel');
  await expect(panel).toHaveJSProperty('open', true);
  await expect(page.locator('#saturday-name')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveJSProperty('open', false);
  await expect(open).toBeFocused();

  await open.click();
  await page.locator('#saturday-name').fill('Reposição de aulas');

  await page.locator('#saturday-submit').click();
  await expect(panel).toHaveJSProperty('open', false);
  await expect(page.locator('[data-saturday="2027-03-06"]')).toHaveAttribute(
    'data-status',
    'registered',
  );
  await expect(bar).toHaveCount(0);
  await expect(page.locator('#saturday-day-count')).toHaveCount(0);

  // A registered date opens its record in the same dialog.
  await page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]').click();
  await expect(panel).toHaveJSProperty('open', true);
  await expect(page.locator('#saturday-edit-name')).toHaveValue('Reposição de aulas');
  await page.locator('#saturday-edit-close').click();
  await expect(panel).toHaveJSProperty('open', false);
  await expect(page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]')).toBeFocused();
});

test('resizing across the compact width keeps the Saturday field being filled', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await selectEditorSection(page, 'days');
  await page.locator('#saturday-dates input[value="2027-03-06"]').check();
  const name = page.locator('#saturday-name');
  await name.fill('Reposição');
  await expect(page.locator('aside#saturday-panel')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('dialog#saturday-panel')).toHaveJSProperty('open', true);
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Reposição');

  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect(page.locator('aside#saturday-panel')).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Reposição');

  // A dialog opened by the resize has no opener; closing it lands on the compact bar.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('dialog#saturday-panel')).toHaveJSProperty('open', true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#saturday-open-panel')).toBeFocused();
});

test('a registered Saturday left open beside the grid does not take over the compact bar', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await selectEditorSection(page, 'days');
  await page.locator('#saturday-dates input[value="2027-03-06"]').check();
  await page.locator('#saturday-name').fill('Reposição de aulas');

  await page.locator('#saturday-submit').click();
  await page.locator('#saturday-dates input[value="2027-03-13"]').check();
  await page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]').click();
  await expect(page.locator('#saturday-edit-form')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#saturday-compact-bar')).toContainText('1 sábado selecionado');
  await page.locator('#saturday-open-panel').click();
  await expect(page.locator('#saturday-name')).toBeVisible();
  await expect(page.locator('#saturday-edit-form')).toHaveCount(0);
});

test('without teaching periods the Saturday step explains what is pending and links to it', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await selectEditorSection(page, 'days');
  const pending = page.locator('#saturday-prerequisites');
  await expect(pending).toContainText('Nenhum sábado pode ser selecionado ainda');
  await expect(page.locator('#saturday-dates input')).toHaveCount(0);
  await expect(page.locator('#saturday-panel')).toContainText(
    'Não há sábados disponíveis para seleção.',
  );
  await pending.getByRole('link', { name: 'Organização letiva por oferta' }).click();
  await expect(page).toHaveURL(/\/periodos$/);
  await expect(page.locator('[data-edit-organization="integrado"]')).toBeVisible();

  await addPeriod(page, '2027-03-01', '2027-04-30');
  await selectEditorSection(page, 'days');
  await expect(page.locator('#saturday-dates input')).not.toHaveCount(0);
  await expect(pending).toHaveCount(0);
});

test('Saturdays outside teaching periods are shown but not selectable', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await addPeriod(page, '2027-03-01', '2027-03-31');
  await page.locator('[data-view="days"]').click();
  const outside = page.locator('[data-saturday="2027-04-03"]');
  await expect(outside).toHaveAttribute('data-status', 'outside');
  await expect(outside.locator('input')).toHaveCount(0);
  await expect(outside).toContainText('fora dos períodos letivos');
});

test('a selected holiday warns that it will not count as a teaching day', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await addPeriod(page, '2027-04-01', '2027-05-31');
  // The fixture has no Saturday holiday; register one through Activities and dates.
  await selectEditorSection(page, 'events');
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Dia do Trabalho');
  await page.locator('#event-type-holiday').check();
  await page.locator('#event-start').fill('2027-05-01');
  await page.locator('#event-end').fill('2027-05-01');

  await page.locator('#event-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events.some((event) => event.name === 'Dia do Trabalho'),
      ),
    )
    .toBe(true);
  await page.locator('#close-event-panel').click();
  await selectEditorSection(page, 'days');
  await page.locator('#saturday-dates input[value="2027-05-01"]').check();
  await expect(page.locator('#saturday-impediments')).toContainText('01/05');
  await expect(page.locator('#saturday-impediments')).toContainText('Dia do Trabalho');
});

test('the Saturday panel keeps its selection summary without repeating teaching days', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await selectEditorSection(page, 'days');
  await expect(page.locator('#saturday-day-count')).toHaveCount(0);
  await expect(page.locator('#saturday-summary')).toContainText('Nenhum sábado selecionado');
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await selectEditorSection(page, 'issues');
  await page.locator('#calendar-scope-integrado').selectOption('covered');
  await page.locator('#scope-form-integrado button[type="submit"]').click();
  await selectEditorSection(page, 'days');
  await expect(page.locator('.teaching-day-current strong')).toHaveText('45 / 200');
  await expect(page.locator('#saturday-day-count')).toHaveCount(0);
  await page.locator('#saturday-dates input[value="2027-03-06"]').check();
  await expect(page.locator('#saturday-summary')).toContainText('1 sábado selecionado');
  await expect(page.locator('#saturday-day-count')).toHaveCount(0);
});

test('a registered Saturday is edited and removed from the panel', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await page.locator('[data-view="days"]').click();
  await page.locator('#saturday-dates input[value="2027-03-06"]').check();
  await page.locator('#saturday-name').fill('Reposição de aulas');

  await page.locator('#saturday-submit').click();
  const registered = page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]');
  await expect(registered).toBeFocused();
  const saturdays = () =>
    page.evaluate(() =>
      window.editorTest.record.state.events
        .filter((event) => event.category === 'sabado')
        .map(({ start, name }) => ({ start, name })),
    );

  await registered.click();
  await expect(page.locator('#saturday-edit-name')).toHaveValue('Reposição de aulas');
  await page.locator('#saturday-edit-name').fill('Feira de ciências');

  await page.locator('#saturday-edit-save').click();
  await expect.poll(saturdays).toEqual([{ start: '2027-03-06', name: 'Feira de ciências' }]);
  await expect(page.locator('#saturday-edit-form')).toHaveCount(0);
  await expect(registered).toBeFocused();

  // Discarding explicitly clears the edit and leaves the registered Saturday intact.
  await registered.click();
  await page.locator('#saturday-edit-name').fill('Rascunho descartado');
  await page.locator('#saturday-edit-discard').click();
  await expect(registered).toBeFocused();
  await expect(page.locator('#unapplied-status')).toBeHidden();

  await registered.click();
  await page.locator('#saturday-edit-remove').click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Remover sábado letivo');
  await expect(confirmation).toContainText('06/03/2027');
  await expect.poll(saturdays).toEqual([{ start: '2027-03-06', name: 'Feira de ciências' }]);
  await confirmation.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmation).toBeHidden();
  await expect(page.locator('#saturday-edit-remove')).toBeFocused();
  await expect.poll(saturdays).toEqual([{ start: '2027-03-06', name: 'Feira de ciências' }]);
  await page.locator('#saturday-edit-remove').click();
  await confirmation.getByRole('button', { name: 'Remover sábado' }).click();
  await expect.poll(saturdays).toEqual([]);
  await expect(page.locator('#saturday-dates input[value="2027-03-06"]')).toBeFocused();
});

test('multi-day inclusions over a Saturday are registered but edited in Activities and dates', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await selectEditorSection(page, 'events');
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Semana acadêmica');
  // An inclusion recorded as an event combines the two fields freely.
  await page.locator('#event-type-extra-day').check();
  await page.locator('#event-more-options > summary').click();
  await page.selectOption('#event-category', 'evento');
  await expect(page.locator('#event-kind')).toHaveValue('include');
  await page.locator('#event-start').fill('2027-03-22');
  await page.locator('#event-end').fill('2027-03-27');

  await page.locator('#event-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events.some((event) => event.name === 'Semana acadêmica'),
      ),
    )
    .toBe(true);
  await page.locator('#close-event-panel').click();
  await selectEditorSection(page, 'days');
  const saturday = page.locator('[data-saturday="2027-03-27"]');
  await expect(saturday).toHaveAttribute('data-status', 'registered');
  await expect(saturday.locator('[data-edit-saturday]')).toHaveCount(0);
  await saturday.locator('button').click();
  await expect(page.locator('#saturday-panel')).toContainText(
    'Edite este registro em Atividades e datas do campus.',
  );
  await expect(page.locator('#saturday-edit-form')).toHaveCount(0);
});

test('vacation form supports duration and manual end dates and rejects overlapping periods atomically', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await page.locator('[data-view="vacations"]').click();
  await page.locator('#vacation-first-start').fill('2027-01-04');
  await page.locator('#vacation-first-days').fill('10');
  await expect(page.locator('#vacation-first-end')).toHaveValue('2027-01-13');
  await page.locator('#vacation-first-end').fill('2027-01-20');
  await expect(page.locator('#vacation-first-days')).toHaveValue('');
  await expect(page.locator('#vacation-first-end')).toHaveValue('2027-01-20');
  await page.locator('#vacation-second-start').fill('2027-07-01');
  await page.locator('#vacation-second-days').fill('15');
  await expect(page.locator('#vacation-second-end')).toHaveValue('2027-07-15');

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

test('Teacher Day is applied and restored explicitly with exactly the policy options', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await page.locator('[data-view="events"]').click();
  await selectCampusEvents(page);
  await page.locator('#open-observance-teacher-day').click();
  await page.locator('#observance-date-teacher-day').selectOption('2027-10-14');
  expect(
    await page.evaluate(() => window.editorTest.record.state.observanceDates?.['teacher-day']),
  ).toBeUndefined();
  await page.locator('#apply-observance-teacher-day').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.editorTest.record.state.observanceDates?.['teacher-day']),
    )
    .toBe('2027-10-14');
  await savedState(page);
  await page.locator('#reset-observance-teacher-day').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.editorTest.record.state.observanceDates?.['teacher-day']),
    )
    .toBeUndefined();
  await expect(page.locator('#observance-date-teacher-day')).toHaveValue('2027-10-15');
  const before = await savedState(page);
  await expect(page.locator('#observance-date-teacher-day option')).toHaveCount(7);
  expect(
    await page
      .locator('#observance-date-teacher-day option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
  ).toEqual([
    '2027-10-11',
    '2027-10-12',
    '2027-10-13',
    '2027-10-14',
    '2027-10-15',
    '2027-10-16',
    '2027-10-17',
  ]);
  expect(await savedState(page)).toEqual(before);
});

test('changing category and activity link in the event form keeps identity, dates and other fields', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await page.locator('[data-view="events"]').click();
  await selectCampusEvents(page);
  const original = await page.evaluate(() =>
    window.editorTest.record.state.events.find((event) => event.id === 'local-event'),
  );
  await editCampusEvent(page, 'local-event');
  await page.locator('#event-more-options > summary').click();
  await page.locator('#event-category').selectOption('feriado');
  await page.locator('#event-requirement').selectOption('family-meeting');
  await expect(page.locator('#event-panel #event-form')).toBeVisible();
  await expect(page.locator('#event-panel-title')).toContainText('familiares');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await page.locator('#event-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find((event) => event.id === 'local-event')
            ?.category,
      ),
    )
    .toBe('feriado');
  const preserved = original!;
  expect(
    (await savedState(page)).state.events.find((event) => event.id === 'local-event'),
  ).toMatchObject({ ...preserved, category: 'feriado', requirementId: 'family-meeting' });
});

test('clean week fields receive remote defaults while an incomplete choice survives a later remote update', async ({
  page,
  fixtureServer,
}) => {
  await openEditor(page, fixtureServer);
  await page.evaluate(async () => {
    window.editorTest.record.version++;
    window.editorTest.record.state.weekdays = [2];
    await window.publishReviewerCalendar();
  });
  await expect(page.locator('#weekdays input[value="1"]')).not.toBeChecked();
  await expect(page.locator('#weekdays input[value="2"]')).toBeChecked();
  await page.locator('#weekdays input[value="2"]').uncheck();
  await page.evaluate(async () => {
    window.editorTest.record.version++;
    window.editorTest.record.state.weekdays = [3];
    await window.publishReviewerCalendar();
  });
  await expect(page.locator('#weekdays input:checked')).toHaveCount(0);
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await expect(page.locator('#editor-remote-change')).toContainText('outra sessão');
  await expect(page.locator('.autosave-panel')).toHaveAttribute('data-tone', 'warning');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});
