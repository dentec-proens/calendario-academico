import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import type {} from './fixtures/editor-client.ts';

const executablePath = [
  process.env.DENTEC_TEST_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

test(
  'editor separates creation from editing and preserves closed activity/history drafts until explicit discard',
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
      cacheDir: 'node_modules/.vite-editor-event-drafts',
      resolve: {
        alias: [
          {
            find: /^(?:\.\/native\/client\.ts|.*\/web\/native\/client\.ts)$/,
            replacement: join(root, 'test/fixtures/editor-event-drafts-client.ts'),
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
          name: 'editor-event-drafts-fixture',
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
    page.setDefaultTimeout(8000);
    await page.setViewport({ width: 1440, height: 1100 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('dialog', (dialog) => {
      void dialog.dismiss();
    });
    await page.goto(`http://127.0.0.1:${address.port}/__editor?id=synthetic-calendar`);
    await page.waitForFunction(
      () => document.querySelector('#record-title')?.textContent === '2027 — Campus de teste',
    );
    const fields = () =>
      page.$$eval('#event-form input, #event-form select', (nodes) =>
        nodes.map((node) => {
          const input = node as HTMLInputElement;
          return { id: input.id, name: input.name, value: input.value, checked: input.checked };
        }),
      );
    const setDates = async (start: string, end = start) => {
      for (const [id, value] of [
        ['event-start', start],
        ['event-end', end],
      ])
        await page.$eval(
          '#' + id,
          (node, value) => {
            const input = node as HTMLInputElement;
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          },
          value,
        );
    };
    const cancel = async () => {
      await page.locator('#discard-event-form').click();
      await page.waitForSelector('#event-form', { hidden: true });
      assert.equal(await page.$eval('input#event-name', (input) => input.value), '');
    };
    const submit = () => page.locator('#event-form button[type="submit"]').click();

    await page.locator('[data-view="events"]').click();
    await page.waitForSelector('#event-form', { hidden: true });
    await page.locator('[data-edit-event="local-event"]').click();
    await page.waitForSelector('#new-event', { hidden: true });
    assert.equal(
      await page.$eval('#event-form-title', (node) => node.textContent),
      'Editar evento local',
    );
    await page.locator('#event-name').fill('Edição local ainda não aplicada');
    await page.locator('#event-evidence').fill('Fonte digitada');
    await setDates('2027-03-11', '2027-03-12');
    const localDraft = await fields();
    await page.locator('#close-event-form').click();
    await page.waitForSelector('#event-form', { hidden: true });
    await page.locator('#resume-event').click();
    await page.waitForSelector('#event-form', { visible: true });
    assert.deepEqual(await fields(), localDraft);
    await cancel();
    assert.equal(
      await page.evaluate(() => window.editorTest.record.state.events[0].name),
      'Evento local salvo',
    );
    assert.equal(await page.evaluate(() => window.editorTest.calls.saves), 0);
    await page.waitForSelector('#new-event', { visible: true });
    await page.locator('#new-event').click();
    assert.equal(
      await page.$eval('#event-form-title', (node) => node.textContent),
      'Novo evento local',
    );
    await page.locator('#event-name').fill('Texto antes de escolher a atividade');
    await page.select('#event-requirement', 'family-meeting');
    assert.equal(
      await page.$eval('input#event-name', (input) => input.value),
      'Texto antes de escolher a atividade',
    );
    await page.select('#event-requirement', '');
    await page.waitForSelector('#event-form', { visible: true });
    await page.waitForSelector('#close-event-form', { visible: true });
    await page.locator('#event-name').fill('Evento novo independente');
    await page.select('#event-kind', 'note');
    await page.locator('#event-evidence').fill('Fonte do cadastro');
    await setDates('2027-04-05');
    await page.locator('#event-confirmed').click();
    await submit();
    await page.waitForFunction(() =>
      window.editorTest.record.state.events.some(
        (event) => event.name === 'Evento novo independente',
      ),
    );
    assert.equal(await page.evaluate(() => window.editorTest.record.state.events.length), 3);
    assert.equal(
      await page.$eval('#event-form-title', (node) => node.textContent),
      'Editar evento local',
    );
    await cancel();

    await page.locator('[data-prepare-activity="cultural-week"]').click();
    await page.locator('#event-name').fill('Semana cultural em edição');
    await page.locator('#event-hours').fill('12');
    await page.locator('#event-evidence').fill('Fonte da atividade');
    await setDates('2027-10-05', '2027-10-09');
    await page.locator('#event-confirmed').click();
    const activityDraft = await fields();
    await page.locator('#cancel-inline-history').click();
    await page.waitForSelector('#event-form', { hidden: true });
    await page.waitForSelector('#unapplied-status', { visible: true });
    await page.locator('[data-prepare-activity="family-meeting"]').click();
    assert.deepEqual(await fields(), activityDraft);
    await page.locator('[data-prepare-activity="cultural-week"]').click();
    await page.waitForSelector('[data-activity-row="cultural-week"] #event-form', {
      visible: true,
    });
    assert.deepEqual(await fields(), activityDraft);
    await submit();
    await page.waitForFunction(() =>
      window.editorTest.record.state.events.some(
        (event) => event.id === 'activity-event' && event.name === 'Semana cultural em edição',
      ),
    );
    assert.equal(await page.evaluate(() => window.editorTest.record.state.events.length), 3);
    await cancel();
    await page.locator('[data-prepare-activity="family-meeting"]').click();
    await page.locator('#event-evidence').fill('Preenchimento de atividade nova');
    const newActivityDraft = await fields();
    await page.locator('#cancel-inline-history').click();
    await page.locator('[data-prepare-activity="family-meeting"]').click();
    assert.deepEqual(await fields(), newActivityDraft);
    await cancel();
    assert.equal(await page.evaluate(() => window.editorTest.record.state.events.length), 3);

    await page.locator('[data-view="history"]').click();
    await page.locator('[data-analyze-history="history-a"]').click();
    await page.waitForSelector('[data-history-candidate="0"]', { visible: true });
    await page.locator('[data-history-candidate="0"]').click();
    await page.locator('#event-name').fill('Evento histórico conferido');
    await page.locator('#event-evidence').fill('Lei municipal vigente');
    await page.locator('#event-hours').fill('4');
    await setDates('2027-05-03', '2027-05-04');
    await page.locator('#event-confirmed').click();
    const historyDraft = await fields();
    const provenance = await page.$eval('#historical-event-source', (node) => node.textContent);
    const savesBeforeClose = await page.evaluate(() => window.editorTest.calls.saves);
    await page.locator('#cancel-inline-history').click();
    await page.waitForSelector('#event-form', { hidden: true });
    await page.locator('#show-existing-history').click();
    await page.locator('[data-history-candidate="1"]').click();
    assert.deepEqual(await fields(), historyDraft);
    await page.locator('[data-history-candidate="0"]').click();
    await page.waitForSelector('[data-history-item="0"] #event-form', { visible: true });
    assert.deepEqual(await fields(), historyDraft);
    assert.equal(
      await page.$eval('#historical-event-source', (node) => node.textContent),
      provenance,
    );
    await page.waitForSelector('#historical-event-source', { visible: true });
    assert.equal(await page.evaluate(() => window.editorTest.calls.saves), savesBeforeClose);
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await submit();
    await page.waitForFunction(() =>
      window.editorTest.record.state.events.some(
        (event) => event.name === 'Evento histórico conferido',
      ),
    );
    const saved = await page.evaluate(() =>
      window.editorTest.record.state.events.find(
        (event) => event.name === 'Evento histórico conferido',
      ),
    );
    assert.equal(saved?.historicalSource?.historyId, 'history-a');
    assert.equal(saved?.historicalSource?.page, 1);
    assert(saved?.historicalSource?.candidateKey);
    await page.locator('[data-view="events"]').click();
    await cancel();
    await page.locator('[data-view="history"]').click();
    await page.locator('[data-history-candidate="1"]').click();
    await page.locator('#event-evidence').fill('Este preenchimento será descartado');
    const savesBeforeCancel = await page.evaluate(() => window.editorTest.calls.saves);
    await cancel();
    assert.equal(await page.evaluate(() => window.editorTest.calls.saves), savesBeforeCancel);
    await page.locator('[data-history-candidate="1"]').click();
    assert.equal(await page.$eval('input#event-evidence', (input) => input.value), '');
    await cancel();
    assert.equal(await page.evaluate(() => window.editorTest.record.state.events.length), 4);
    assert.deepEqual(errors, []);
  },
);
