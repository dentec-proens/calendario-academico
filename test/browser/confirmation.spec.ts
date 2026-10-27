import { test, expect } from './test.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectEditorSection } from './editor-navigation.ts';
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
  ).toBe('rgba(0, 0, 0, 0.5)');
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

test('TypeScript editor preserves cancelled imports and saves before converting to definitive', async ({
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
  await page.locator('#period-name').fill('Preenchimento a preservar');
  expect(
    await page
      .locator('#period-name')
      .evaluate((node) => getComputedStyle(node.closest('label')!).fontWeight),
  ).toBe('600');
  await page.waitForFunction(() => {
    const input = document.querySelector('#period-name')!;
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
    await expect(page.locator(`#${section}`), section).toBeVisible();
    if (section === 'periods')
      await expect(page.locator('input#period-name')).toHaveValue('Preenchimento a preservar');
  }
  const file = join(directory, 'rascunho.json');
  const draft = await page.evaluate(() => ({
    ...window.editorTest.record.state,
    periods: [
      { id: 'imported', name: 'Período importado', start: '2027-02-01', end: '2027-03-01' },
    ],
  }));
  await writeFile(file, JSON.stringify(draft));

  // Opening the picker is still a direct user gesture. The decision follows validation.
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.editor-more > summary').click();
  await page.locator('#load').click();
  await (await chooserPromise).setFiles([file]);
  await expect(page.locator('dialog[open]')).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await page.locator('.confirmation-dialog__cancel').click();
  await expect(page.locator('dialog')).toBeHidden();
  await expect(page.locator('input#period-name')).toHaveValue('Preenchimento a preservar');
  expect(await page.evaluate(() => window.editorTest.record.state.periods.length)).toBe(0);

  const picker = page.locator('input#file');
  await picker.setInputFiles(file);
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('#period-list'))
    .toContainText('Período importado')
    .catch(async (error: unknown) => {
      throw new Error(
        JSON.stringify({
          errors,
          message: await page.locator('#message').evaluate((element) => element.textContent),
        }),
        { cause: error },
      );
    });
  await expect(page.locator('input#period-name')).toHaveValue('');
  await page.waitForFunction(() => window.editorTest.calls.saves === 1);

  // Invalid JSON never discards a field or asks to confirm an unusable file.
  await page.locator('#period-name').fill('Outro preenchimento');
  await writeFile(file, JSON.stringify({ schemaVersion: 99 }));
  await picker.setInputFiles(file);
  await expect(page.locator('#message')).toContainText('Não foi possível abrir');
  await expect(page.locator('#message .ui-notice')).toHaveAttribute('data-tone', 'danger');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('input#period-name')).toHaveValue('Outro preenchimento');

  await page.locator('[data-view="issues"]').click();
  await page.locator('#make-definitive').click();
  await expect(page.locator('dialog.confirmation-dialog--primary[open]')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toBeHidden();
  expect(await page.evaluate(() => window.editorTest.calls.conversions)).toBe(0);
  await page.evaluate(() => {
    window.editorTest.calls.failConversion = true;
  });
  await page.locator('#make-definitive').click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('dialog [role="alert"]')).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.record.purpose)).toBe('test');
  await page.evaluate(() => {
    window.editorTest.calls.failConversion = false;
  });
  await page.locator('.confirmation-dialog__confirm').click();
  await page.waitForFunction(() => window.editorTest.record.purpose === 'definitive');
  await expect(page.locator('dialog')).toBeHidden();
  await expect(page.locator('button#make-definitive')).toBeHidden();
  expect(await page.evaluate(() => window.editorTest.calls.conversions)).toBe(2);
  expect(errors).toEqual([]);
});
