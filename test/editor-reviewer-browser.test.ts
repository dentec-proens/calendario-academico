import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import type {} from './fixtures/editor-reviewer-client.ts';

const executablePath = [
  process.env.DENTEC_TEST_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

test(
  'reviewer consults the complete calendar and live changes without editing or saving',
  { skip: !executablePath, timeout: 30_000 },
  async (t) => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const editorHtml = (await readFile(join(root, 'web/editor.html'), 'utf8'))
      .replaceAll('href="/style.css"', 'href="/web/style.css"')
      .replaceAll('href="/portal.css"', 'href="/web/portal.css"')
      .replace('src="/native/editor.tsx"', 'src="/test/fixtures/editor-confirmation.ts"');
    const server = await createServer({
      configFile: false,
      envDir: false,
      cacheDir: 'node_modules/.vite-editor-reviewer',
      resolve: {
        alias: [
          {
            find: /^(?:\.\/native\/client\.ts|.*\/web\/native\/client\.ts)$/,
            replacement: join(root, 'test/fixtures/editor-reviewer-client.ts'),
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
          name: 'editor-reviewer-fixture',
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
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${address.port}/__editor?id=synthetic-calendar`);
    await page.waitForFunction(
      () =>
        location.pathname !== '/__editor' ||
        document.querySelector('#record-title')?.textContent === '2027 — Campus de teste',
    );
    assert.match(page.url(), /__editor\?id=synthetic-calendar/);
    assert.match(
      await page.$eval('#autosave-status', (node) => node.textContent ?? ''),
      /somente leitura/i,
    );
    assert.equal(await page.$eval('input#week-evidence', (node) => node.disabled), true);
    assert.equal(await page.$eval('button#make-definitive', (node) => node.hidden), true);
    assert.equal(await page.$eval('a.editor-history', (node) => node.hidden), true);
    await page.locator('[data-view="events"]').click();
    await page.waitForSelector('#event-list', { visible: true });
    assert.match(
      await page.$eval('#event-list', (node) => node.textContent ?? ''),
      /Evento local salvo/,
    );
    assert.equal(await page.$eval('button#new-event', (node) => node.disabled), true);
    assert(
      await page.$$eval(
        '#event-list button, #event-list select, #event-list input',
        (nodes) => nodes.length > 0 && nodes.every((node) => node.disabled),
      ),
    );
    await page.locator('[data-view="history"]').click();
    assert.match(
      await page.$eval('#history-list', (node) => node.textContent ?? ''),
      /anterior\.pdf/,
    );
    assert.equal(await page.$eval('button#history-submit', (node) => node.disabled), true);
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#server-save')!.click();
      document
        .querySelector<HTMLFormElement>('#week-form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.locator('[data-view="issues"]').click();
    await page.waitForSelector('#issue-list', { visible: true });
    await page.locator('[data-view="calendar"]').click();
    await page.waitForSelector('#months .proens-document', { visible: true });
    await page.evaluate(() => {
      window.print = () => {
        document.body.dataset.printed = 'true';
      };
    });
    await page.locator('#print').click();
    await page.waitForFunction(() => document.body.dataset.printed === 'true');
    assert.match(
      await page.$eval('#autosave-status', (node) => node.textContent ?? ''),
      /somente leitura/i,
    );
    await page.evaluate(async () => {
      window.editorTest.record.state.events[0].name = 'Evento atualizado pelo campus';
      window.editorTest.record.version++;
      await window.publishReviewerCalendar();
    });
    await page.locator('[data-view="events"]').click();
    assert.match(
      await page.$eval('#event-list', (node) => node.textContent ?? ''),
      /Evento atualizado pelo campus/,
    );
    assert(
      await page.$$eval('#event-list button, #event-list select, #event-list input', (nodes) =>
        nodes.every((node) => node.disabled),
      ),
    );
    assert.deepEqual(await page.evaluate(() => window.editorTest.calls), {
      saves: 0,
      conversions: 0,
      failConversion: false,
    });
    assert.deepEqual(errors, []);
  },
);
