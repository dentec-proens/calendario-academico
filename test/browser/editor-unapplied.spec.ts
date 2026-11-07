import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

test('moving on from vacations applies what was typed', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/ferias');
  await page.locator('#vacation-add-teacher').click();
  await page.locator('#vacation-form input[type="date"]').nth(0).fill('2027-01-04');
  await page.locator('#vacation-form input[type="date"]').nth(1).fill('2027-01-31');
  await page.locator('#editor-continue').click();
  await expect(page).toHaveURL(/\/atividades/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events.some(
          (event) =>
            event.activity?.activityId === 'teacher-vacation' && event.end === '2027-01-31',
        ),
      ),
    )
    .toBe(true);
});

test('a refused vacation keeps the person in the step', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/ferias');
  await page.locator('#vacation-add-teacher').click();
  await page.locator('#vacation-form input[type="date"]').nth(0).fill('2027-02-10');
  await page.locator('#vacation-form input[type="date"]').nth(1).fill('2027-02-01');
  await page.locator('#editor-continue').click();
  await expect(page).toHaveURL(/\/ferias/);
  await expect(page.locator('#vacation-form')).toContainText(
    'O término não pode ser anterior ao início.',
  );
});

test('the notice names the step with unapplied fields and leads back to it', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/ferias');
  await page.locator('#vacation-add-teacher').click();
  await page.locator('#vacation-form input[type="date"]').nth(0).fill('2027-02-10');
  const notice = page.locator('#unapplied-status');
  await expect(notice).toContainText('Férias');
  await selectEditorSection(page, 'events');
  await notice.getByRole('link', { name: 'Ir para Férias' }).click();
  await expect(page).toHaveURL(/\/ferias/);
  await expect(page.locator('#vacation-form input[type="date"]').nth(0)).toHaveValue('2027-02-10');
});

test('leaving with unapplied fields says they are discarded, and going back is the safe way', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/ferias');
  await page.locator('#vacation-add-teacher').click();
  const start = page.locator('#vacation-form input[type="date"]').nth(0);
  await start.fill('2027-02-10');
  await page.locator('.editor-back a').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Sair sem os campos em preenchimento?');
  await expect(dialog.getByRole('button', { name: 'Salvar e sair' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Voltar ao preenchimento' }).click();
  await expect(page).toHaveURL(/\/ferias/);
  await expect(start).toHaveValue('2027-02-10');
});

test('a refusal leaves the form when the value that caused it changes', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/calendarios/novo');
  await page.locator('#create-calendar button[type="submit"]').click();
  await expect(page.locator('#create-calendar')).toContainText('Marque ao menos uma oferta.');
  await page.locator('#calendar-offer-integrado').check();
  await expect(page.locator('#create-calendar')).not.toContainText('Marque ao menos uma oferta.');
});
