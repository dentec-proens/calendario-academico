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
    const identityLayout = await page.$$eval(
      '.calendar-identity-fields :is(input, select)',
      (nodes) => nodes.map((node) => node.getBoundingClientRect().top),
    );
    assert.equal(identityLayout.length, 3);
    assert(
      identityLayout.every((top) => Math.abs(top - identityLayout[0]) < 1),
      'campus, year and organization align on one row',
    );
    assert(
      await page.$eval(
        '#calendar-modalities',
        (node) =>
          node.getBoundingClientRect().top >
          document.querySelector('.calendar-identity-fields')!.getBoundingClientRect().bottom - 1,
      ),
      'modalities have their own group below identification',
    );
    for (const selector of [
      '#calendar-campus',
      '#calendar-year',
      '#calendar-name',
      '#calendar-courses',
    ]) {
      const label = await page.$eval(selector, (node) => {
        const label = node.closest('label')!;
        const style = getComputedStyle(label);
        return {
          weight: style.fontWeight,
          align: style.alignItems,
          textAlign: style.textAlign,
          gap: style.gap,
          left: label.getBoundingClientRect().left,
          controlLeft: node.getBoundingClientRect().left,
        };
      });
      assert.deepEqual(
        { weight: label.weight, align: label.align, textAlign: label.textAlign, gap: label.gap },
        { weight: '600', align: 'stretch', textAlign: 'left', gap: '8px' },
      );
      assert(Math.abs(label.left - label.controlLeft) < 1);
    }
    await page.locator('#calendar-courses').fill('Curso em preenchimento');
    await page.hover('#calendar-courses');
    await page.waitForFunction(() => {
      const input = document.querySelector('#calendar-courses')!;
      return (
        getComputedStyle(input.closest('label')!).color === getComputedStyle(input).borderTopColor
      );
    });
    assert.notEqual(
      await page.$eval('#calendar-courses', (node) => getComputedStyle(node).boxShadow),
      'none',
      'hover preserves the focus highlight',
    );
    await page.locator('input[name="calendar-modality"]').click();
    assert.equal(
      await page.$eval(
        '#calendar-modalities .check',
        (node) => getComputedStyle(node).flexDirection,
      ),
      'row',
    );
    assert.equal(
      await page.$eval(
        '#create-calendar',
        (node) => new FormData(node as HTMLFormElement).getAll('calendar-modality').length,
      ),
      1,
      'moving the group preserves submitted modalities',
    );
    await page.locator('[data-page="accounts"]').click();
    await page.waitForSelector('#user-list', { visible: true });
    await page.waitForSelector('#campus-list', { hidden: true });
    await page.waitForSelector('#user-form', { hidden: true });
    await page.locator('#accounts .collection-heading button').click();
    assert.equal(
      await page.$eval('#user-name', (node) => getComputedStyle(node.closest('label')!).fontWeight),
      '600',
    );
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
    assert.equal(
      await page.$eval(
        '#document-title',
        (node) => getComputedStyle(node.closest('label')!).textAlign,
      ),
      'left',
    );
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
    assert.equal(
      await page.$eval(
        '#catalogue-name',
        (node) => getComputedStyle(node.closest('label')!).fontWeight,
      ),
      '600',
    );
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

    await page.locator('.sidebar-toggle').click();
    await page.locator('[data-page="calendars"]').click();
    for (const width of [768, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `calendar form fits at ${width}px`,
      );
    }
    const mobileLayout = await page.$$eval(
      '.calendar-identity-fields :is(input, select)',
      (nodes) => nodes.map((node) => node.getBoundingClientRect().top),
    );
    assert(
      mobileLayout[0] < mobileLayout[1] && mobileLayout[1] < mobileLayout[2],
      'identification fields stack on mobile',
    );

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
    await page.goto(origin + '?role=PARECERISTA&page=accounts');
    await page.waitForSelector('#review-panel', { visible: true });
    assert.equal(await page.$('[data-page="accounts"]'), null);
    assert.equal(await page.$('[data-page="campuses"]'), null);
    assert.equal(await page.$('[data-page="calendars"]'), null);
    assert.equal(await page.$('#create-calendar'), null);
    assert.equal(await page.$('#user-form'), null);
    assert(await page.$('#open-review'));
    await page.goto(origin + '?role=PARECERISTA&page=calendars');
    await page.waitForSelector('#review-panel', { visible: true });
    await page.goto(origin + '?role=PARECERISTA&page=institution');
    await page.waitForSelector('#document-list', { visible: true });
    assert.equal(await page.$('#document-form'), null);
    assert.doesNotMatch(
      await page.$eval('#document-list', (node) => node.textContent ?? ''),
      /Documento rascunho/,
    );
    assert.deepEqual(errors, []);
  },
);
