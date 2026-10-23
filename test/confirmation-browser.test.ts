import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import type {} from './fixtures/confirmation.ts';
import type {} from './fixtures/editor-client.ts';

const executablePath = [
  process.env.DENTEC_TEST_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

test(
  'React confirmation handles focus, keyboard, backdrop, async failure and duplicate actions',
  { skip: !executablePath, timeout: 60_000 },
  async (t) => {
    const server = await createServer({
      configFile: false,
      envDir: false,
      root: fileURLToPath(new URL('../', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      oxc: { jsx: { runtime: 'automatic' } },
    });
    t.onTestFinished(() => server.close());
    await server.listen();
    const address = server.httpServer?.address();
    assert(address && typeof address === 'object');
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    t.onTestFinished(() => browser.close());
    const page = await browser.newPage();
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
    await page.goto(`http://127.0.0.1:${address.port}/test/fixtures/confirmation.html`);
    await page
      .waitForFunction(() => Boolean(window.confirmationTest), { timeout: 8000 })
      .catch(async (error: unknown) => {
        throw new Error(JSON.stringify({ errors, html: (await page.content()).slice(0, 1600) }), {
          cause: error,
        });
      });
    await page.locator('#trigger').click();
    await page.waitForSelector('dialog[open]');
    assert.equal(
      await page.$eval('dialog', (dialog) => dialog.getAttribute('role')),
      'alertdialog',
    );
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancelar');
    assert.equal(
      await page.$eval(
        'dialog',
        (dialog) => getComputedStyle(dialog, '::backdrop').backgroundColor,
      ),
      'rgba(0, 0, 0, 0.5)',
    );
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
    assert.equal(await page.evaluate(() => window.confirmationTest.duplicate()), false);
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent?.trim()),
      'Mover para a lixeira',
    );
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))));
    await page.mouse.click(5, 5);
    assert.equal(await page.$$eval('dialog[open]', (dialogs) => dialogs.length), 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.confirmationTest.state.result === false);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'trigger');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
    assert.equal(await page.evaluate(() => window.confirmationTest.state.calls), 0);

    await page.locator('#trigger').click();
    await page.waitForSelector('dialog[open]');
    await page.locator('.confirmation-dialog__cancel').click();
    await page.waitForSelector('dialog', { hidden: true });
    assert.equal(await page.evaluate(() => window.confirmationTest.state.calls), 0);

    await page.evaluate(() => {
      window.confirmationTest.state.fail = true;
    });
    await page.locator('#trigger').click();
    await page.locator('.confirmation-dialog__confirm').click();
    await page.waitForSelector('dialog [role="alert"]');
    assert.equal(
      await page.$eval('dialog [role="alert"]', (element) => element.textContent?.trim()),
      'Falha de conexão. Tente novamente.',
    );
    assert.equal(
      await page.$eval('.confirmation-dialog__confirm', (button) =>
        button.hasAttribute('disabled'),
      ),
      false,
    );
    await page.evaluate(() => {
      window.confirmationTest.state.fail = false;
    });
    await page.$eval('.confirmation-dialog__confirm', (button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await page.waitForFunction(
      () => document.querySelector('dialog')?.getAttribute('aria-busy') === 'true',
    );
    assert.equal(await page.evaluate(() => window.confirmationTest.state.calls), 2);
    assert.equal(await page.$$eval('dialog button:disabled', (buttons) => buttons.length), 2);
    await page.keyboard.press('Escape');
    assert.equal(await page.$$eval('dialog[open]', (dialogs) => dialogs.length), 1);
    await page.evaluate(() => window.confirmationTest.release());
    await page.waitForFunction(() => window.confirmationTest.state.result === true);

    for (const intent of ['primary', 'warning', 'success'] as const) {
      await page.evaluate((intent) => window.confirmationTest.open(intent), intent);
      await page.waitForSelector(`dialog.confirmation-dialog--${intent}[open]`);
      assert.equal(await page.$$eval('dialog [role="alert"]', (messages) => messages.length), 0);
      await page.keyboard.press('Escape');
      await page.waitForSelector('dialog', { hidden: true });
    }
    await page.setViewport({ width: 375, height: 667 });
    await page.locator('#trigger').click();
    await page.waitForSelector('dialog[open]');
    assert(await page.$eval('dialog', (dialog) => dialog.scrollWidth <= dialog.clientWidth));
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(
      await page.$eval('dialog', (dialog) => getComputedStyle(dialog).animationName),
      'none',
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'TypeScript editor preserves cancelled imports and saves before converting to definitive',
  { skip: !executablePath, timeout: 60_000 },
  async (t) => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const editorHtml = (await readFile(join(root, 'web/editor.html'), 'utf8'))
      .replaceAll('href="/style.css"', 'href="/web/style.css"')
      .replaceAll('href="/portal.css"', 'href="/web/portal.css"')
      .replace('src="/native/editor.tsx"', 'src="/test/fixtures/editor-confirmation.ts"');
    const server = await createServer({
      configFile: false,
      envDir: false,
      cacheDir: 'node_modules/.vite-editor-confirmation',
      resolve: {
        alias: [
          {
            find: /^(?:\.\/native\/client\.ts|.*\/web\/native\/client\.ts)$/,
            replacement: join(root, 'test/fixtures/editor-client.ts'),
          },
        ],
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'lucide-react'],
      },
      root,
      server: { host: '127.0.0.1', port: 0 },
      oxc: { jsx: { runtime: 'automatic' } },
      plugins: [
        {
          name: 'isolated-editor-fixture',
          configureServer(server) {
            server.middlewares.use('/__editor', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end(editorHtml);
            });
          },
        },
      ],
    });
    t.onTestFinished(() => server.close());
    await server.listen();
    const address = server.httpServer?.address();
    assert(address && typeof address === 'object');
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    t.onTestFinished(() => browser.close());
    const directory = await mkdtemp(join(tmpdir(), 'editor-confirmation-'));
    t.onTestFinished(() => rm(directory, { recursive: true, force: true }));
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('dialog', (dialog) => {
      if (dialog.type() !== 'beforeunload')
        errors.push('Unexpected native dialog: ' + dialog.message());
      void dialog.dismiss();
    });
    await page.goto(`http://127.0.0.1:${address.port}/__editor?id=synthetic-calendar`);
    await page
      .waitForFunction(
        () => document.querySelector('#record-title')?.textContent === '2027 — Campus de teste',
      )
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
    await page.setViewport({ width: 1440, height: 1100 });
    await page.locator('[data-view="periods"]').click();
    await page.locator('#period-name').fill('Preenchimento a preservar');
    assert.equal(
      await page.$eval(
        '#period-name',
        (node) => getComputedStyle(node.closest('label')!).fontWeight,
      ),
      '600',
    );
    await page.waitForFunction(() => {
      const input = document.querySelector('#period-name')!;
      return (
        getComputedStyle(input.closest('label')!).color === getComputedStyle(input).borderTopColor
      );
    });
    for (const section of ['edit', 'days', 'events', 'history', 'issues', 'periods']) {
      await page.locator(`[data-view="${section}"]`).click();
      assert.equal(
        await page.$eval(`#${section}`, (node) => (node as HTMLElement).hidden),
        false,
        section,
      );
      assert.equal(
        await page.$eval('input#period-name', (node) => node.value),
        'Preenchimento a preservar',
      );
    }
    await page.locator('#open-history').click();
    await page.waitForSelector('#history', { visible: true });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'history-file');
    await page.locator('[data-view="periods"]').click();

    const file = join(directory, 'rascunho.json');
    const draft = await page.evaluate(() => ({
      ...window.editorTest.record.state,
      periods: [
        { id: 'imported', name: 'Período importado', start: '2027-02-01', end: '2027-03-01' },
      ],
    }));
    await writeFile(file, JSON.stringify(draft));

    // Opening the picker is still a direct user gesture. The decision follows validation.
    const chooserPromise = page.waitForFileChooser();
    await page.locator('#load').click();
    await (await chooserPromise).accept([file]);
    await page.waitForSelector('dialog[open]');
    assert.equal(await page.evaluate(() => window.editorTest.calls.saves), 0);
    await page.locator('.confirmation-dialog__cancel').click();
    await page.waitForSelector('dialog', { hidden: true });
    assert.equal(
      await page.$eval('input#period-name', (input) => input.value),
      'Preenchimento a preservar',
    );
    assert.equal(await page.evaluate(() => window.editorTest.record.state.periods.length), 0);

    const picker = await page.$('input#file');
    assert(picker);
    await picker.uploadFile(file);
    await page.waitForSelector('dialog[open]');
    await page.locator('.confirmation-dialog__confirm').click();
    await page
      .waitForFunction(() =>
        document.querySelector('#period-list')?.textContent?.includes('Período importado'),
      )
      .catch(async (error: unknown) => {
        throw new Error(
          JSON.stringify({
            errors,
            message: await page.$eval('#message', (element) => element.textContent),
          }),
          { cause: error },
        );
      });
    assert.equal(await page.$eval('input#period-name', (input) => input.value), '');
    await page.waitForFunction(() => window.editorTest.calls.saves === 1);

    // Invalid JSON never discards a field or asks to confirm an unusable file.
    await page.locator('#period-name').fill('Outro preenchimento');
    await writeFile(file, JSON.stringify({ schemaVersion: 99 }));
    await picker.uploadFile(file);
    await page.waitForFunction(() =>
      document.querySelector('#message')?.textContent?.includes('Não foi possível abrir'),
    );
    assert.equal(await page.$$eval('dialog[open]', (dialogs) => dialogs.length), 0);
    assert.equal(
      await page.$eval('input#period-name', (input) => input.value),
      'Outro preenchimento',
    );

    await page.locator('#make-definitive').click();
    await page.waitForSelector('dialog.confirmation-dialog--primary[open]');
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog', { hidden: true });
    assert.equal(await page.evaluate(() => window.editorTest.calls.conversions), 0);
    await page.evaluate(() => {
      window.editorTest.calls.failConversion = true;
    });
    await page.locator('#make-definitive').click();
    await page.locator('.confirmation-dialog__confirm').click();
    await page.waitForSelector('dialog [role="alert"]');
    assert.equal(await page.evaluate(() => window.editorTest.record.purpose), 'test');
    await page.evaluate(() => {
      window.editorTest.calls.failConversion = false;
    });
    await page.locator('.confirmation-dialog__confirm').click();
    await page.waitForFunction(() => window.editorTest.record.purpose === 'definitive');
    await page.waitForSelector('dialog', { hidden: true });
    assert.equal(await page.$eval('button#make-definitive', (button) => button.hidden), true);
    assert.equal(await page.evaluate(() => window.editorTest.calls.conversions), 2);
    assert.deepEqual(errors, []);
  },
);
