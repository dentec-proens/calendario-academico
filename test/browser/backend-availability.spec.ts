import { test, expect } from './test.ts';
import { startBackendFixtureServer } from './fixture-server.ts';
import type { Page } from '@playwright/test';
import type {} from '../fixtures/backend-availability.ts';

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

async function assertDraftPreserved(page: Page, draft: string) {
  expect(
    await page.evaluate(() => ({
      value: window.backendAvailabilityTest.draftElement.value,
      sameElement:
        document.querySelector('#availability-draft') ===
        window.backendAvailabilityTest.draftElement,
      focused: document.activeElement === window.backendAvailabilityTest.draftElement,
      mounts: window.backendAvailabilityTest.draftMounts,
    })),
  ).toEqual({ value: draft, sameElement: true, focused: true, mounts: 1 });
}

test('backend availability waits, distinguishes outages, recovers and preserves editing without unsafe reload', async ({
  context,
  cleanup,
}) => {
  const { url } = await startBackendFixtureServer(cleanup);
  const errors: string[] = [];
  async function fixture(query = '') {
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(url + query);
    await page.waitForFunction(() => Boolean(window.backendAvailabilityTest), undefined, {
      timeout: 8000,
    });
    await settle(page);
    return page;
  }

  const initial = await fixture('?allowReload');
  await expect(initial.locator('[role="status"]')).toHaveText('Carregando dados de teste…');
  await expect(initial.locator('[role="alert"]')).toHaveCount(0);
  await initial.locator('#availability-draft').fill('Semana de acolhimento ainda não salva');
  await advance(initial, 9999);
  await expect(initial.locator('[role="alert"]')).toHaveCount(0);
  await advance(initial, 1);
  await expect(initial.getByRole('alert').locator('h2')).toHaveText(
    'Portal temporariamente indisponível',
  );
  await expect(initial.locator('[role="status"]')).toHaveCount(0);
  await expect(initial.locator('[role="alert"] button')).toHaveText('Tentar novamente');
  await initial.evaluate(() => window.backendAvailabilityTest.setOnline(false));
  await expect(initial.getByRole('alert').locator('h2')).toHaveText('Sem conexão com a internet');
  await expect(initial.locator('[role="alert"] button')).toHaveCount(0);
  await initial.evaluate(() => window.backendAvailabilityTest.setOnline(true));
  await expect(initial.getByRole('alert').locator('h2')).toHaveText(
    'Portal temporariamente indisponível',
  );
  expect(
    await initial
      .locator('[role="alert"]')
      .evaluate((element) => element.getAttribute('aria-labelledby')),
  ).toBe(await initial.locator('[role="alert"] h2').evaluate((element) => element.id));
  await assertDraftPreserved(initial, 'Semana de acolhimento ainda não salva');
  await initial.evaluate(() => {
    window.backendAvailabilityTest.setConnection({
      isWebSocketConnected: true,
      hasEverConnected: true,
    });
    window.backendAvailabilityTest.setLoading(false);
  });
  await settle(initial);
  await expect(initial.locator('[role="alert"]')).toHaveCount(0);
  await expect(initial.locator('[role="status"]')).toHaveCount(0);
  await assertDraftPreserved(initial, 'Semana de acolhimento ainda não salva');

  // A new outage must receive its own full grace period, even after an earlier warning.
  await initial.evaluate(() =>
    window.backendAvailabilityTest.setConnection({ isWebSocketConnected: false }),
  );
  await settle(initial);
  await expect(initial.locator('[role="alert"]')).toHaveCount(0);
  await advance(initial, 9999);
  await expect(initial.locator('[role="alert"]')).toHaveCount(0);
  await advance(initial, 1);
  await expect(initial.getByRole('alert').locator('h2')).toHaveText(
    'Conexão com o portal interrompida',
  );
  await expect(initial.locator('[role="alert"] button')).toHaveCount(0);
  expect(
    await initial.locator('[role="alert"]').evaluate((element) => element.textContent ?? ''),
  ).toMatch(/alterações recentes podem ainda não ter sido salvas/);
  await initial.evaluate(() => window.backendAvailabilityTest.setLoading(true));
  await expect(initial.locator('[role="alert"] button')).toHaveCount(0);
  await assertDraftPreserved(initial, 'Semana de acolhimento ainda não salva');

  const slow = await fixture('?connected&allowReload');
  await advance(slow, 9999);
  await expect(slow.locator('[role="alert"]')).toHaveCount(0);
  await advance(slow, 1);
  await expect(slow.getByRole('alert').locator('h2')).toHaveText(
    'O portal está demorando para responder',
  );
  await expect(slow.locator('[role="alert"] button')).toHaveText('Tentar novamente');
  await slow.evaluate(() => window.backendAvailabilityTest.setLoading(false));
  await settle(slow);
  await expect(slow.locator('[role="alert"]')).toHaveCount(0);

  const offline = await fixture('?ready&allowReload');
  await offline.locator('#availability-draft').fill('Data institucional em edição');
  await offline.evaluate(() => window.backendAvailabilityTest.setOnline(false));
  await expect(offline.getByRole('alert').locator('h2')).toHaveText('Sem conexão com a internet');
  await expect(offline.locator('[role="alert"] button')).toHaveCount(0);
  await assertDraftPreserved(offline, 'Data institucional em edição');
  await offline.evaluate(() => window.backendAvailabilityTest.setOnline(true));
  await settle(offline);
  await expect(offline.locator('[role="alert"]')).toHaveCount(0);
  await assertDraftPreserved(offline, 'Data institucional em edição');

  const privatePage = await fixture();
  await advance(privatePage, 10_000);
  await expect(privatePage.getByRole('alert').locator('h2')).toHaveText(
    'Portal temporariamente indisponível',
  );
  await expect(privatePage.locator('[role="alert"] button')).toHaveCount(0);
  await privatePage.evaluate(() => window.backendAvailabilityTest.setOnline(false));
  await expect(privatePage.getByRole('alert').locator('h2')).toHaveText(
    'Sem conexão com a internet',
  );
  await expect(privatePage.locator('[role="alert"] button')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('anonymous portal and invitation show backend failures without exposing forms or leaving loopback', async ({
  context,
  page: portal,
  cleanup,
}) => {
  const { origin, backendPort } = await startBackendFixtureServer(cleanup);
  const portalErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  portal.on('pageerror', (error) => portalErrors.push(String(error)));
  await portal.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin || url.protocol === 'data:') {
      void route.continue();
    } else {
      unexpectedRequests.push(request.url());
      void route.abort();
    }
  });
  const protocol = await context.newCDPSession(portal);
  await protocol.send('Network.enable');
  const backendSockets: string[] = [];
  protocol.on('Network.webSocketCreated', ({ url }) => {
    if (new URL(url).port === String(backendPort)) backendSockets.push(url);
  });
  await portal.goto(`${origin}/test/fixtures/backend-availability-portal.html`);
  await expect(portal.locator('.backend-loading')).toBeVisible();
  await settle(portal);
  await expect(portal.locator('[role="alert"]')).toHaveCount(0);
  await expect(portal.locator('form')).toHaveCount(0);
  await advance(portal, 9999);
  await expect(portal.locator('[role="alert"]')).toHaveCount(0);
  await advance(portal, 1);
  await expect(portal.getByRole('alert').locator('h2')).toHaveText(
    'Portal temporariamente indisponível',
  );
  await expect(portal.locator('[role="alert"] button')).toHaveText('Tentar novamente');
  await expect(portal.locator('header strong')).toHaveText('Calendários Acadêmicos');
  await expect(portal.locator('form')).toHaveCount(0);
  expect(backendSockets.some((url) => new URL(url).port === String(backendPort))).toBeTruthy();
  expect(backendSockets.every((url) => new URL(url).hostname === '127.0.0.1')).toBeTruthy();
  expect(unexpectedRequests).toEqual([]);
  expect(portalErrors).toEqual([]);

  await portal.goto(
    `${origin}/test/fixtures/backend-availability-token.html#token-sintetico-local`,
  );
  await expect(portal.locator('.backend-loading')).toBeVisible();
  await expect(portal.locator('#app-main')).toBeVisible();
  expect(new URL(portal.url()).hash).toBe('');
  await settle(portal);
  await advance(portal, 10_000);
  await expect(portal.getByRole('alert').locator('h2')).toHaveText(
    'Portal temporariamente indisponível',
  );
  await expect(portal.locator('[role="alert"] button')).toHaveCount(0);
  await expect(portal.locator('form')).toHaveCount(0);
  expect(unexpectedRequests).toEqual([]);
  expect(portalErrors).toEqual([]);
});
