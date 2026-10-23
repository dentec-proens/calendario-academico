import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const executablePath = [
  process.env.DENTEC_TEST_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

test(
  'portal shares each subject across roles while preserving drafts, scoped controls, history and mobile menus',
  { skip: !executablePath, timeout: 60_000 },
  async (t) => {
    const server = await createServer({
      configFile: false,
      cacheDir: 'node_modules/.vite-portal-navigation',
      optimizeDeps: {
        include: [
          'react',
          'react-dom/client',
          'react/jsx-runtime',
          'lucide-react',
          'convex/react',
          'convex/server',
        ],
      },
      envDir: false,
      root: fileURLToPath(new URL('../', import.meta.url)),
      define: {
        'import.meta.env.VITE_CONVEX_URL': JSON.stringify('https://synthetic.convex.cloud'),
      },
      server: { host: '127.0.0.1', port: 0 },
      oxc: { jsx: { runtime: 'automatic' } },
      plugins: [
        {
          name: 'portal-navigation-fixture',
          configureServer(server) {
            server.middlewares.use('/__portal', (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end(
                '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"><main></main></div><script type="module" src="/test/fixtures/portal-navigation.ts"></script></body></html>',
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
    await page.setViewport({ width: 1440, height: 1000 });
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    const origin = `http://127.0.0.1:${address.port}/__portal`;
    await page.goto(origin);
    await page.waitForSelector('#calendar-list', { visible: true }).catch((error: unknown) => {
      throw new Error(JSON.stringify(errors), { cause: error });
    });
    assert.equal(await page.$$eval('[data-page="institution"]', (nodes) => nodes.length), 1);
    assert.equal(await page.$$eval('[data-page="institution-events"]', (nodes) => nodes.length), 1);
    assert.equal(await page.$('[data-page="manage-documents"]'), null);
    assert.equal(await page.$('[data-page="manage-events"]'), null);
    assert.doesNotMatch(
      await page.$eval('.portal-sidebar', (node) => node.textContent ?? ''),
      /Todos os campi/,
    );
    await page.waitForSelector('#create-calendar', { hidden: true });
    await page.locator('#calendars .collection-heading button').click();
    await page.locator('#calendar-courses').fill('Curso em preenchimento');
    await page.locator('[data-page="accounts"]').click();
    await page.waitForSelector('#user-list', { visible: true });
    await page.waitForSelector('#campus-list', { hidden: true });
    await page.waitForSelector('#user-form', { hidden: true });
    await page.locator('#accounts .collection-heading button').click();
    await page.locator('#user-name').fill('Nome ainda não enviado');
    await page.locator('[data-page="campuses"]').click();
    await page.waitForSelector('#campus-list', { visible: true });
    await page.waitForSelector('#user-list', { hidden: true });
    assert.equal(new URL(page.url()).searchParams.get('page'), 'campuses');
    await page.goBack();
    await page.waitForSelector('#user-form', { visible: true });
    assert.equal(
      await page.$eval('input#user-name', (node) => node.value),
      'Nome ainda não enviado',
    );
    await page.locator('[data-page="calendars"]').click();
    assert.equal(
      await page.$eval('input#calendar-courses', (node) => node.value),
      'Curso em preenchimento',
    );
    await page.locator('[data-page="institution"]').click();
    await page.waitForSelector('#document-status-filter', { visible: true });
    assert.match(
      await page.$eval('#document-list', (node) => node.textContent ?? ''),
      /Documento rascunho/,
    );
    await page.select('#document-status-filter', 'rascunho');
    await page.waitForFunction(() => document.querySelectorAll('#document-list li').length === 1);
    await page.locator('#document-year-filter').fill('2028');
    await page.waitForFunction(() =>
      document
        .querySelector('#document-list')
        ?.textContent?.includes('Nenhum documento encontrado'),
    );
    await page.locator('#document-year-filter').fill('');
    await page.select('#document-status-filter', '');
    await page.locator('#institution .collection-heading button').click();
    await page.locator('#document-title').fill('Documento em preenchimento');
    await page.locator('[data-page="calendars"]').click();
    await page.waitForSelector('#document-form', { hidden: true });
    await page.locator('[data-page="institution"]').click();
    assert.equal(
      await page.$eval('input#document-title', (node) => node.value),
      'Documento em preenchimento',
    );
    await page.locator('[data-page="institution-events"]').click();
    await page.locator('[data-edit="synthetic-event"]').click();
    await page.locator('#catalogue-name').fill('Evento em edição');
    await page.locator('[data-page="institution"]').click();
    await page.waitForSelector('#catalogue-form', { hidden: true });
    await page.locator('[data-page="institution-events"]').click();
    assert.equal(
      await page.$eval('input#catalogue-name', (node) => node.value),
      'Evento em edição',
    );

    await page.setViewport({ width: 390, height: 844 });
    await page.waitForSelector('.portal-sidebar', { hidden: true });
    await page.locator('.sidebar-toggle').click();
    await page.waitForSelector('.portal-sidebar', { visible: true });
    await page.locator('[data-page="campuses"]').click();
    await page.waitForSelector('.portal-sidebar', { hidden: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

    await page.goto(origin + '?role=CAMPUS&page=accounts');
    await page.waitForSelector('#calendar-list', { visible: true });
    assert.equal(await page.$('.admin-navigation'), null);
    assert.equal(await page.$('#user-form'), null);
    assert.equal(await page.$('#campus-filter'), null);
    assert.equal(await page.$('#document-status-filter'), null);
    assert.equal(await page.$('#document-form'), null);
    assert.equal(await page.$('#catalogue-form'), null);
    await page.locator('.sidebar-toggle').click();
    await page.locator('[data-page="institution"]').click();
    await page.waitForSelector('#document-list', { visible: true });
    assert.doesNotMatch(
      await page.$eval('#document-list', (node) => node.textContent ?? ''),
      /Documento rascunho/,
    );
    assert.match(
      await page.$eval('#document-list', (node) => node.textContent ?? ''),
      /Documento vigente/,
    );
    await page.goto(origin + '?page=manage-documents');
    await page.waitForSelector('#document-status-filter', { visible: true });
    await page.goto(origin + '?role=CAMPUS&page=manage-events');
    await page.waitForSelector('#catalogue-list', { visible: true });
    assert.equal(await page.$('[data-edit="synthetic-event"]'), null);
    assert.deepEqual(errors, []);
  },
);
