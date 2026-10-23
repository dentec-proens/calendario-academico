import assert from 'node:assert/strict';
import { test } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import type {} from './fixtures/online-users.ts';

const executablePath = [
  process.env.DENTEC_TEST_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));
test(
  'online users renders live totals, search, campus filters and mobile layout',
  { skip: !executablePath },
  async (t) => {
    const server = await createServer({
      configFile: false,
      envDir: false,
      root: fileURLToPath(new URL('../', import.meta.url)),
      define: {
        'import.meta.env.VITE_CONVEX_URL': JSON.stringify('https://synthetic.convex.cloud'),
      },
      server: { host: '127.0.0.1', port: 0 },
      oxc: { jsx: { runtime: 'automatic' } },
    });
    t.onTestFinished(() => server.close());
    await server.listen();
    const address = server.httpServer!.address();
    assert(address && typeof address === 'object');
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    t.onTestFinished(() => browser.close());
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${address.port}/test/fixtures/online-users.html`);
    await page.waitForFunction(() =>
      document.body.textContent?.includes('Carregando usuários online'),
    );
    const users = [
      {
        id: 'a',
        name: 'Ana',
        email: 'ana@ifpr.edu.br',
        campusId: 'campus-a',
        campusName: 'Campus A',
        role: 'CAMPUS',
      },
      {
        id: 'b',
        name: 'Bruno',
        email: 'bruno@ifpr.edu.br',
        campusId: null,
        campusName: 'Institucional',
        role: 'ADMIN',
      },
    ];
    await page.evaluate((users) => window.setOnlineFixture({ users, truncated: false }), users);
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
    assert.match(
      await page.$eval('.online-summary', (node) => node.textContent!),
      /2 usuário.*1 campus/,
    );
    await page.type('input[type="search"]', 'ana@ifpr');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    await page.$eval('input', (input) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.select('select', 'institutional');
    await page.waitForFunction(() =>
      document.querySelector('tbody')?.textContent?.includes('Bruno'),
    );
    await page.setViewport({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.evaluate(() => window.setOnlineFixture({ users: [], truncated: false }));
    await page.waitForFunction(() =>
      document.body.textContent?.includes('Nenhum usuário online no momento'),
    );
    assert.deepEqual(errors, []);
  },
);
