import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import { addPeriod, savedState, selectEditorSection } from './editor-navigation.ts';
import type { FixtureServer } from './fixture-server.ts';
import type {} from '../fixtures/editor-client.ts';

const open = async (page: Page, fixtureServer: FixtureServer) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/ferias');
};

const fillPeriod = async (page: Page, start: string, end: string) => {
  await page.locator('#vacation-start').fill(start);
  await page.locator('#vacation-end').fill(end);
};

test('school and teacher vacations are filled in one step, each with its particularities', async ({
  page,
  fixtureServer,
}) => {
  await open(page, fixtureServer);
  await page.locator('#vacation-add-school').click();
  await expect(page.locator('#vacation-name')).toHaveValue('Férias escolares');
  await fillPeriod(page, '2027-07-05', '2027-07-25');
  await page.locator('#vacation-apply').click();
  await page.locator('#vacation-add-school').click();
  await page.locator('#vacation-name').fill('Recesso escolar');
  await fillPeriod(page, '2027-12-23', '2027-12-31');
  await page.locator('#vacation-apply').click();
  const school = page.locator('#vacations-school');
  await expect(school).toContainText('Recesso escolar');
  await expect(school).toContainText('9 dias · até o fim do ano');

  await page.getByRole('button', { name: 'Usar os períodos das escolares' }).click();
  const summary = page.locator('#vacation-teacher-summary');
  await expect(summary).toContainText('30 de 45 dias. Faltam 15.');
  await expect(summary).toContainText('30 dias coincidem com as férias escolares.');

  const { state } = await savedState(page);
  const vacations = state.events.filter((event) => event.category === 'ferias');
  expect(vacations.every((event) => event.effect === 'exclude')).toBe(true);
  expect(
    vacations.filter((event) => event.activity?.activityId === 'teacher-vacation'),
  ).toHaveLength(2);
  expect(vacations.map((event) => event.name)).toContain('Férias docentes — 21 dias');
});

test('editing a period reopens its days, and each period is removed on its own', async ({
  page,
  fixtureServer,
}) => {
  await open(page, fixtureServer);
  await page.locator('#vacation-add-teacher').click();
  await page.locator('#vacation-start').fill('2027-01-04');
  await page.locator('#vacation-days').fill('10');
  await page.locator('#vacation-apply').click();
  await page.locator('[data-edit-vacation]').click();
  await expect(page.locator('#vacation-days')).toHaveValue('10');
  await page.locator('#vacation-days').fill('45');
  await page.locator('#vacation-apply').click();
  await expect(page.locator('#vacation-teacher-summary')).toContainText('45 de 45 dias.');
  await page.locator('[data-remove-vacation]').click();
  await expect(page.locator('#vacation-teacher-summary')).toHaveCount(0);
});

test('the pending vacations of the review step lead to this step', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/pendencias');
  await page
    .getByRole('link', { name: /Férias escolares/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/ferias/);
  await expect(page.locator('#vacations-school')).toBeVisible();
});

test('the step reads well on a narrow screen', async ({ page, fixtureServer }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, fixtureServer);
  await page.locator('#vacation-add-school').click();
  await fillPeriod(page, '2027-07-05', '2027-07-25');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await page.locator('#vacation-apply').click();
  await expect(page.locator('[data-vacation-period]')).toBeVisible();
});

test('typed values are kept: other periods wait for them, and closing returns the focus', async ({
  page,
  fixtureServer,
}) => {
  await open(page, fixtureServer);
  await page.locator('#vacation-add-teacher').click();
  await expect(page.locator('#vacation-start')).toBeFocused();
  await page.locator('#vacation-start').fill('2027-01-04');
  await expect(page.locator('#vacation-add-school')).toBeDisabled();
  await page.locator('#vacation-discard').click();
  await expect(page.locator('#vacation-add-teacher')).toBeFocused();
  await expect(page.locator('#vacation-add-school')).toBeEnabled();
});

test('a period says what it takes from the count only when it takes something', async ({
  page,
  fixtureServer,
}) => {
  await open(page, fixtureServer);
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await selectEditorSection(page, 'vacations');
  await page.locator('#vacation-add-teacher').click();
  await fillPeriod(page, '2027-01-04', '2027-01-08');
  await page.locator('#vacation-apply').click();
  await page.locator('#vacation-add-teacher').click();
  await fillPeriod(page, '2027-03-01', '2027-03-05');
  await expect(page.locator('#vacation-preview')).toContainText('Retira 5 dias letivos');
  await page.locator('#vacation-apply').click();
  const periods = page.locator('[data-vacation-period]');
  await expect(periods.nth(0)).not.toContainText('Retira');
  await expect(periods.nth(1)).toContainText('Retira 5 dias letivos');
  await page.locator('#vacation-add-teacher').click();
  await fillPeriod(page, '2027-03-08', '2027-03-08');
  await page.locator('#vacation-apply').click();
  await expect(periods.nth(2)).toContainText(/· 1 dia(?!s)/);
  await expect(periods.nth(2)).toContainText('Retira 1 dia letivo');
});

test('with several offers, the period says how many days each one loses', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor-mixed-offers')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/ferias');
  await page.locator('#vacation-add-teacher').click();
  await fillPeriod(page, '2027-03-01', '2027-03-05');
  await page.locator('#vacation-apply').click();
  await expect(page.locator('[data-vacation-period]')).toContainText(
    /Retira 5 dias letivos de .+ · 5 dias letivos de /,
  );
});
