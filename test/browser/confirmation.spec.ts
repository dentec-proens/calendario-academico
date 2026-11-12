import { test, expect } from './test.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completeForSubmission, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/confirmation.ts';
import type {} from '../fixtures/editor-client.ts';

test('React confirmation handles focus, keyboard, backdrop, async failure and duplicate actions', async ({
  page,
  fixtureServer,
}) => {
  const fixtureUrl = await fixtureServer('confirmation');
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('dialog', (dialog) => {
    errors.push('Unexpected native dialog: ' + dialog.message());
    void dialog.dismiss();
  });
  await page.goto(fixtureUrl);
  await page
    .waitForFunction(() => Boolean(window.confirmationTest), null, { timeout: 8000 })
    .catch(async (error: unknown) => {
      throw new Error(JSON.stringify({ errors, html: (await page.content()).slice(0, 1600) }), {
        cause: error,
      });
    });
  await page.locator('#trigger').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await expect(page.locator('dialog')).toHaveAttribute('role', 'alertdialog');
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  expect(
    await page
      .locator('dialog')
      .evaluate((dialog) => getComputedStyle(dialog, '::backdrop').backgroundColor),
  ).toBe('rgba(23, 43, 37, 0.4)');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  expect(await page.evaluate(() => window.confirmationTest.duplicate())).toBe(false);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Mover para a lixeira', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))),
  ).toBeTruthy();
  await page.mouse.click(5, 5);
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.confirmationTest.state.result === false);
  await expect(page.locator('#trigger')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  expect(await page.evaluate(() => window.confirmationTest.state.calls)).toBe(0);

  await page.locator('#trigger').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.locator('.confirmation-dialog__cancel').click();
  await expect(page.locator('dialog')).toBeHidden();
  expect(await page.evaluate(() => window.confirmationTest.state.calls)).toBe(0);

  await page.evaluate(() => {
    window.confirmationTest.state.fail = true;
  });
  await page.locator('#trigger').click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('dialog [role="alert"]')).toBeVisible();
  await expect(page.locator('dialog [role="alert"]')).toHaveText(
    'Falha de conexão. Tente novamente.',
  );
  await expect(page.locator('.confirmation-dialog__confirm')).toBeEnabled();
  await page.evaluate(() => {
    window.confirmationTest.state.fail = false;
  });
  await page.locator('.confirmation-dialog__confirm').evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.locator('dialog')).toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(() => window.confirmationTest.state.calls)).toBe(2);
  await expect(page.locator('dialog button:disabled')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.evaluate(() => window.confirmationTest.release());
  await page.waitForFunction(() => window.confirmationTest.state.result === true);

  for (const intent of ['primary', 'warning', 'success'] as const) {
    await page.evaluate((intent) => window.confirmationTest.open(intent), intent);
    await expect(page.locator(`dialog.confirmation-dialog--${intent}[open]`)).toBeVisible();
    await expect(page.locator('dialog [role="alert"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toBeHidden();
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.locator('#trigger').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  expect(
    await page.locator('dialog').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
  ).toBeTruthy();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('dialog')).toHaveCSS('animation-name', 'none');
  expect(errors).toEqual([]);
});

test('TypeScript editor preserves cancelled imports and saves before submitting for analysis', async ({
  page,
  fixtureServer,
  cleanup,
}) => {
  const fixtureUrl = await fixtureServer('editor-confirmation');
  const directory = await mkdtemp(join(tmpdir(), 'editor-confirmation-'));
  cleanup(() => rm(directory, { recursive: true, force: true }));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'beforeunload')
      errors.push('Unexpected native dialog: ' + dialog.message());
    void dialog.dismiss();
  });
  await page.goto(`${fixtureUrl}?id=synthetic-calendar`);
  await expect(page.locator('#record-title'))
    .toHaveText('2027 — Campus de teste')
    .catch(async (error: unknown) => {
      throw new Error(
        JSON.stringify({
          errors,
          state: await page.evaluate(() => ({
            title: document.querySelector('#record-title')?.textContent,
            message: document.querySelector('#message')?.textContent,
            fixture: Boolean(window.editorTest),
          })),
        }),
        { cause: error },
      );
    });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator('[data-view="periods"]').click();
  await page.locator('[data-edit-organization="integrado"]').click();
  await page.locator('#offer-integrado-period-0-start').fill('2027-02-16');
  expect(
    await page
      .locator('#offer-integrado-period-0-start')
      .evaluate((node) => getComputedStyle(node.closest('label')!).fontWeight),
  ).toBe('600');
  await page.waitForFunction(() => {
    const input = document.querySelector('#offer-integrado-period-0-start')!;
    return (
      getComputedStyle(input.closest('label')!).color === getComputedStyle(input).borderTopColor
    );
  });
  for (const section of [
    'edit',
    'days',
    'vacations',
    'events',
    'issues',
    'assessments',
    'periods',
  ] as const) {
    await selectEditorSection(page, section);
    await expect(
      page.locator(`#${section === 'assessments' ? 'periods' : section}`),
      section,
    ).toBeVisible();
    if (section === 'periods')
      await expect(page.locator('input#offer-integrado-period-0-start')).toHaveValue('2027-02-16');
  }
  const file = join(directory, 'rascunho.json');
  const draft = await page.evaluate(() => ({
    ...window.editorTest.record.state,
    periods: [
      {
        id: 'imported',
        name: 'Período importado',
        start: '2027-02-01',
        end: '2027-03-01',
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
    ],
  }));
  await writeFile(file, JSON.stringify(draft));

  // Opening the picker is still a direct user gesture. The decision follows validation.
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.editor-more-trigger').click();
  await page.locator('#load').click();
  await (await chooserPromise).setFiles([file]);
  await expect(page.locator('dialog[open]')).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await page.locator('.confirmation-dialog__cancel').click();
  await expect(page.locator('dialog')).toBeHidden();
  await expect(page.locator('input#offer-integrado-period-0-start')).toHaveValue('2027-02-16');
  expect(await page.evaluate(() => window.editorTest.record.state.periods.length)).toBe(0);

  const picker = page.locator('input#file');
  await picker.setInputFiles(file);
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('#periods'))
    .toContainText('Anual: 1 fev a 1 mar')
    .catch(async (error: unknown) => {
      throw new Error(
        JSON.stringify({
          errors,
          message: await page.locator('#message').evaluate((element) => element.textContent),
        }),
        { cause: error },
      );
    });
  await page.waitForFunction(() => window.editorTest.calls.saves === 1);
  // Submitting refuses any pendency, and they are not the subject here.
  await completeForSubmission(page);
  await page.locator('[data-edit-organization="integrado"]').click();
  await expect(page.locator('input#offer-integrado-period-0-start')).toHaveValue('2027-02-01');

  // Invalid JSON never discards a field or asks to confirm an unusable file.
  await page.locator('#offer-integrado-period-0-start').fill('2027-02-17');
  await writeFile(file, JSON.stringify({ schemaVersion: 99 }));
  await picker.setInputFiles(file);
  await expect(page.locator('#message')).toContainText('Não foi possível abrir');
  await expect(page.locator('#message .ui-notice')).toHaveAttribute('data-tone', 'danger');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('input#offer-integrado-period-0-start')).toHaveValue('2027-02-17');

  await page.locator('[data-view="issues"]').click();
  const submit = page.locator('[data-lifecycle-action="submit"]');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('dialog[open] h2')).toHaveText('Enviar para análise?');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toBeHidden();
  // A field still being filled never travels silently: the submission waits for it.
  await submit.click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('dialog [role="alert"]')).toContainText('Aplique ou descarte');
  expect(await page.evaluate(() => window.editorTest.calls.transitions)).toBe(0);
  await page.locator('.confirmation-dialog__cancel').click();
  await page.locator('[data-view="periods"]').click();
  await page.locator('#offer-integrado-period-0-start').fill('2027-02-01');
  await expect(page.locator('#unapplied-status')).toBeHidden();
  await page.evaluate(() => {
    window.editorTest.calls.failTransition = true;
  });
  await submit.click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('dialog [role="alert"]')).toContainText('Falha sintética');
  expect(await page.evaluate(() => window.editorTest.record.status)).toBe('rascunho');
  await page.evaluate(() => {
    window.editorTest.calls.failTransition = false;
  });
  await page.locator('.confirmation-dialog__confirm').click();
  await page.waitForFunction(() => window.editorTest.record.status === 'enviado');
  await expect(page.locator('dialog')).toBeHidden();
  await expect(submit).toBeHidden();
  await expect(page.locator('[data-lifecycle-action="withdraw"]')).toBeVisible();
  await expect(page.locator('#editor-locked')).toContainText('Recolha o envio');
  expect(await page.evaluate(() => window.editorTest.calls.transitions)).toBe(2);
  expect(errors).toEqual([]);
});
