import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import type {} from './fixtures/review-ui-client.ts';

const executablePath = [
  process.env.DENTEC_TEST_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

test(
  'direct review distinguishes automatic indications, confirmation and saved decisions on keyboard and mobile',
  { skip: !executablePath, timeout: 60_000 },
  async (t) => {
    const server = await createServer({
      configFile: false,
      envDir: false,
      root: fileURLToPath(new URL('../', import.meta.url)),
      cacheDir: 'node_modules/.vite-review-ui',
      oxc: { jsx: { runtime: 'automatic' } },
      resolve: {
        alias: [
          {
            find: /^(?:\.\.\/native\/client\.ts|.*\/web\/native\/client\.ts)$/,
            replacement: fileURLToPath(new URL('./fixtures/review-ui-client.ts', import.meta.url)),
          },
        ],
      },
      server: { host: '127.0.0.1', port: 0 },
      plugins: [
        {
          name: 'isolated-review-ui',
          configureServer(server) {
            server.middlewares.use('/__review', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end(
                '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/test/fixtures/review-ui.ts"></script></body></html>',
              );
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
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:')) requests.push(request.url());
    });
    await page.setViewport({ width: 1360, height: 1000 });
    await page.goto(`http://127.0.0.1:${address.port}/__review`);
    await page.locator('#open-review').click();
    const item = '#review-items > li:first-child';
    const confirm = `${item} [data-confirm-criterion]`;
    const notes = `${item} textarea`;
    const choice = `${item} [data-choice="ATENDIDO"]`;
    await page.waitForSelector(notes);
    assert.equal(await page.$(`${item} [data-edit-criterion]`), null);
    assert.equal(await page.$eval(notes, (node) => (node as HTMLTextAreaElement).disabled), false);
    assert.equal(await page.$eval(confirm, (node) => (node as HTMLButtonElement).disabled), true);
    assert.match(
      await page.$eval(`${item} .ui-notice`, (node) => node.textContent ?? ''),
      /Contagem automática indisponível/,
    );
    assert.equal(await page.$$eval(`${item} [role="radio"]`, (nodes) => nodes.length), 3);
    await page.focus(choice);
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      (item) =>
        document
          .querySelector(`${item} [data-choice="NAO_ATENDIDO"]`)
          ?.getAttribute('aria-checked') === 'true',
      {},
      item,
    );
    await page.locator(confirm).click();
    assert.equal(
      await page.evaluate(() => window.reviewUiTest.calls.saves),
      0,
      'confirmation cannot persist or imply saving',
    );
    assert.match(
      await page.$eval(`${item} [data-origin]`, (node) => node.textContent ?? ''),
      /por salvar/,
    );
    await page.locator(notes).fill('Conferência documental registrada.');
    assert.match(
      await page.$eval(`${item} [data-origin]`, (node) => node.textContent ?? ''),
      /não confirmada/,
    );
    await page.locator(confirm).click();
    await page.$eval('button[form="review-form"]', (button) =>
      button.scrollIntoView({ block: 'center' }),
    );
    await page.locator('button[form="review-form"]').click();
    await page
      .waitForFunction(
        () => document.querySelector('[data-origin="annual"]')?.textContent === 'Conferido e salvo',
      )
      .catch(async (cause: unknown) => {
        throw new Error(
          JSON.stringify(
            await page.evaluate(() => ({
              calls: window.reviewUiTest.calls,
              message: document.querySelector('#review-message')?.textContent,
              status: document.querySelector('[data-origin="annual"]')?.textContent,
              invalid: Array.from(document.querySelectorAll(':invalid')).map(
                (element) => element.outerHTML,
              ),
            })),
          ),
          { cause },
        );
      });
    assert.equal(await page.evaluate(() => window.reviewUiTest.calls.saves), 1);
    await page.locator('#open-review').click();
    await page.waitForFunction(
      () => document.querySelector('[data-origin="annual"]')?.textContent === 'Conferido e salvo',
    );
    assert.equal(
      await page.$eval(notes, (node) => (node as HTMLTextAreaElement).value),
      'Conferência documental registrada.',
    );
    // Focus before selecting: Base UI's focus state rerenders the controlled field.
    // Locator.fill clears via the DOM before focus and that rerender can restore its old value.
    await page.focus(notes);
    await page.$eval(notes, (node) => (node as HTMLTextAreaElement).select());
    await page.keyboard.type('Observação alterada e salva sem nova confirmação.');
    await page.locator('button[form="review-form"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-origin="annual"]')?.textContent ===
        'Avaliação salva · não confirmada',
    );
    assert.equal(await page.$eval(confirm, (node) => (node as HTMLButtonElement).disabled), false);
    await page.locator('#open-review').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-origin="annual"]')?.textContent ===
        'Avaliação salva · não confirmada',
    );
    assert.equal(
      await page.$eval(notes, (node) => (node as HTMLTextAreaElement).value),
      'Observação alterada e salva sem nova confirmação.',
    );
    await page.locator(`${item} .review-item__actions button:first-child`).click();
    assert.equal(
      await page.$$eval(`${item} [role="radio"][aria-checked="true"]`, (nodes) => nodes.length),
      0,
    );
    assert.equal(await page.$eval(confirm, (node) => (node as HTMLButtonElement).disabled), true);
    await page.locator(choice).click();
    await page.locator('button[form="review-form"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-origin="annual"]')?.textContent ===
        'Avaliação salva · não confirmada',
    );
    await page.locator(confirm).click();
    await page.evaluate(() => {
      window.reviewUiTest.calls.failSave = true;
    });
    await page.locator('button[form="review-form"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#review-message')?.textContent?.includes('Falha sintética ao salvar'),
    );
    assert.match(
      await page.$eval(`${item} [data-origin]`, (node) => node.textContent ?? ''),
      /por salvar/,
      'failed persistence must retain the pending-save badge',
    );
    await page.locator(notes).fill('Nova observação precisa de confirmação.');
    await page.focus(notes);
    assert.notEqual(await page.$eval(notes, (node) => getComputedStyle(node).boxShadow), 'none');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(
      await page.$eval(choice, (node) => getComputedStyle(node.parentElement!).transitionDuration),
      '0s',
    );
    for (const width of [560, 375, 320]) {
      await page.setViewport({ width, height: 900 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `no horizontal overflow at ${width}px`,
      );
      assert(await page.$eval(confirm, (node) => node.getBoundingClientRect().height >= 44));
    }
    assert.deepEqual(requests, [], 'isolated UI test cannot contact a real backend');
    assert.deepEqual(errors, []);
  },
);
