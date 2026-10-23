import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer as createSocketServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer, { type Page } from 'puppeteer-core';
import type {} from './fixtures/backend-availability.ts';

const executablePath = [
  process.env.DENTEC_TEST_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function advance(page: Page, milliseconds: number) {
  await page.evaluate(
    (milliseconds) => window.backendAvailabilityClock.advance(milliseconds),
    milliseconds,
  );
  await settle(page);
}

async function title(page: Page) {
  return page.$eval('[role="alert"] h2', (heading) => heading.textContent);
}

async function assertDraftPreserved(page: Page, draft: string) {
  assert.deepEqual(
    await page.evaluate(() => ({
      value: window.backendAvailabilityTest.draftElement.value,
      sameElement:
        document.querySelector('#availability-draft') ===
        window.backendAvailabilityTest.draftElement,
      focused: document.activeElement === window.backendAvailabilityTest.draftElement,
      mounts: window.backendAvailabilityTest.draftMounts,
    })),
    { value: draft, sameElement: true, focused: true, mounts: 1 },
  );
}

test(
  'backend availability waits, distinguishes outages, recovers and preserves editing without unsafe reload',
  { skip: !executablePath, timeout: 60_000 },
  async (t) => {
    const unavailableBackend = createSocketServer();
    await new Promise<void>((resolve) => unavailableBackend.listen(0, '127.0.0.1', resolve));
    const backendAddress = unavailableBackend.address();
    assert(backendAddress && typeof backendAddress === 'object');
    const backendUrl = `http://127.0.0.1:${backendAddress.port}`;
    await new Promise<void>((resolve, reject) => {
      unavailableBackend.close((error) => (error ? reject(error) : resolve()));
    });
    const server = await createServer({
      configFile: false,
      envDir: false,
      cacheDir: 'node_modules/.vite-backend-availability',
      root: fileURLToPath(new URL('../', import.meta.url)),
      define: { 'import.meta.env.VITE_CONVEX_URL': JSON.stringify(backendUrl) },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-runtime',
          'convex/react',
          '@convex-dev/auth/react',
          'lucide-react',
        ],
      },
      server: { host: '127.0.0.1', port: 0 },
      oxc: { jsx: { runtime: 'automatic' } },
    });
    t.onTestFinished(() => server.close());
    await server.listen();
    const address = server.httpServer?.address();
    assert(address && typeof address === 'object');
    const port = address.port;
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    t.onTestFinished(() => browser.close());
    const errors: string[] = [];
    async function fixture(query = '') {
      const page = await browser.newPage();
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      await page.goto(`http://127.0.0.1:${port}/test/fixtures/backend-availability.html${query}`);
      await page.waitForFunction(() => Boolean(window.backendAvailabilityTest), { timeout: 8000 });
      await settle(page);
      return page;
    }

    const initial = await fixture('?allowReload');
    assert.equal(
      await initial.$eval('[role="status"]', (element) => element.textContent),
      'Carregando dados de teste…',
    );
    assert.equal(await initial.$('[role="alert"]'), null);
    await initial.locator('#availability-draft').fill('Semana de acolhimento ainda não salva');
    await advance(initial, 9999);
    assert.equal(await initial.$('[role="alert"]'), null);
    await advance(initial, 1);
    assert.equal(await title(initial), 'Portal temporariamente indisponível');
    assert.equal(await initial.$('[role="status"]'), null);
    assert.equal(
      await initial.$eval('[role="alert"] button', (button) => button.textContent),
      'Tentar novamente',
    );
    await initial.evaluate(() => window.backendAvailabilityTest.setOnline(false));
    assert.equal(await title(initial), 'Sem conexão com a internet');
    assert.equal(await initial.$('[role="alert"] button'), null);
    await initial.evaluate(() => window.backendAvailabilityTest.setOnline(true));
    assert.equal(await title(initial), 'Portal temporariamente indisponível');
    assert.equal(
      await initial.$eval('[role="alert"]', (element) => element.getAttribute('aria-labelledby')),
      await initial.$eval('[role="alert"] h2', (element) => element.id),
    );
    await assertDraftPreserved(initial, 'Semana de acolhimento ainda não salva');
    await initial.evaluate(() => {
      window.backendAvailabilityTest.setConnection({
        isWebSocketConnected: true,
        hasEverConnected: true,
      });
      window.backendAvailabilityTest.setLoading(false);
    });
    await settle(initial);
    assert.equal(await initial.$('[role="alert"]'), null);
    assert.equal(await initial.$('[role="status"]'), null);
    await assertDraftPreserved(initial, 'Semana de acolhimento ainda não salva');

    // A new outage must receive its own full grace period, even after an earlier warning.
    await initial.evaluate(() =>
      window.backendAvailabilityTest.setConnection({ isWebSocketConnected: false }),
    );
    await settle(initial);
    assert.equal(await initial.$('[role="alert"]'), null);
    await advance(initial, 9999);
    assert.equal(await initial.$('[role="alert"]'), null);
    await advance(initial, 1);
    assert.equal(await title(initial), 'Conexão com o portal interrompida');
    assert.equal(await initial.$('[role="alert"] button'), null);
    assert.match(
      await initial.$eval('[role="alert"]', (element) => element.textContent ?? ''),
      /alterações recentes podem ainda não ter sido salvas/,
    );
    await initial.evaluate(() => window.backendAvailabilityTest.setLoading(true));
    assert.equal(await initial.$('[role="alert"] button'), null);
    await assertDraftPreserved(initial, 'Semana de acolhimento ainda não salva');

    const slow = await fixture('?connected&allowReload');
    await advance(slow, 9999);
    assert.equal(await slow.$('[role="alert"]'), null);
    await advance(slow, 1);
    assert.equal(await title(slow), 'O portal está demorando para responder');
    assert.equal(
      await slow.$eval('[role="alert"] button', (button) => button.textContent),
      'Tentar novamente',
    );
    await slow.evaluate(() => window.backendAvailabilityTest.setLoading(false));
    await settle(slow);
    assert.equal(await slow.$('[role="alert"]'), null);

    const offline = await fixture('?ready&allowReload');
    await offline.locator('#availability-draft').fill('Data institucional em edição');
    await offline.evaluate(() => window.backendAvailabilityTest.setOnline(false));
    assert.equal(await title(offline), 'Sem conexão com a internet');
    assert.equal(await offline.$('[role="alert"] button'), null);
    await assertDraftPreserved(offline, 'Data institucional em edição');
    await offline.evaluate(() => window.backendAvailabilityTest.setOnline(true));
    await settle(offline);
    assert.equal(await offline.$('[role="alert"]'), null);
    await assertDraftPreserved(offline, 'Data institucional em edição');

    const privatePage = await fixture();
    await advance(privatePage, 10_000);
    assert.equal(await title(privatePage), 'Portal temporariamente indisponível');
    assert.equal(await privatePage.$('[role="alert"] button'), null);
    await privatePage.evaluate(() => window.backendAvailabilityTest.setOnline(false));
    assert.equal(await title(privatePage), 'Sem conexão com a internet');
    assert.equal(await privatePage.$('[role="alert"] button'), null);
    assert.deepEqual(errors, []);

    // Exercise the real portal and auth provider with a fresh, anonymous browser context.
    // The only configured Convex URL is an unused loopback port, never a real deployment.
    const context = await browser.createBrowserContext();
    const portal = await context.newPage();
    const portalErrors: string[] = [];
    const unexpectedRequests: string[] = [];
    portal.on('pageerror', (error) => portalErrors.push(String(error)));
    await portal.setRequestInterception(true);
    portal.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === `http://127.0.0.1:${port}` || url.protocol === 'data:') {
        void request.continue();
      } else {
        unexpectedRequests.push(request.url());
        void request.abort();
      }
    });
    const protocol = await portal.createCDPSession();
    await protocol.send('Network.enable');
    const backendSockets: string[] = [];
    protocol.on('Network.webSocketCreated', ({ url }) => {
      if (new URL(url).port === String(backendAddress.port)) backendSockets.push(url);
    });
    await portal.goto(`http://127.0.0.1:${port}/test/fixtures/backend-availability-portal.html`);
    await portal.waitForSelector('.backend-loading', { timeout: 8000 });
    await settle(portal);
    assert.equal(await portal.$('[role="alert"]'), null);
    assert.equal(await portal.$('form'), null);
    await advance(portal, 9999);
    assert.equal(await portal.$('[role="alert"]'), null);
    await advance(portal, 1);
    assert.equal(await title(portal), 'Portal temporariamente indisponível');
    assert.equal(
      await portal.$eval('[role="alert"] button', (button) => button.textContent),
      'Tentar novamente',
    );
    assert.equal(
      await portal.$eval('header strong', (element) => element.textContent),
      'PROENS - Pró-Reitoria de Ensino',
    );
    assert.equal(await portal.$('form'), null);
    assert(backendSockets.some((url) => new URL(url).port === String(backendAddress.port)));
    assert(backendSockets.every((url) => new URL(url).hostname === '127.0.0.1'));
    assert.deepEqual(unexpectedRequests, []);
    assert.deepEqual(portalErrors, []);

    await portal.goto(
      `http://127.0.0.1:${port}/test/fixtures/backend-availability-token.html#token-sintetico-local`,
    );
    await portal.waitForSelector('.backend-loading', { timeout: 8000 });
    await portal.waitForFunction(
      () => document.querySelector<HTMLElement>('body > main')?.hidden === false,
    );
    assert.equal(new URL(portal.url()).hash, '');
    await settle(portal);
    await advance(portal, 10_000);
    assert.equal(await title(portal), 'Portal temporariamente indisponível');
    assert.equal(await portal.$('[role="alert"] button'), null);
    assert.equal(
      await portal.$eval('body > main h1', (element) => element.textContent),
      'Aceitar convite',
    );
    assert.deepEqual(unexpectedRequests, []);
    assert.deepEqual(portalErrors, []);
    await context.close();
  },
);
