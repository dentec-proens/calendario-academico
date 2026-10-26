import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import type { Id } from '../convex/_generated/dataModel.js';
import { releaseSmokeConfiguration } from './release-smoke-config.ts';
import type { SmokeConfiguration } from './release-smoke-config.ts';

export async function checkSmokeBrowser() {
  const browser = await chromium.launch();
  await browser.close();
}

export async function verifyReleaseSmoke(configuration: SmokeConfiguration) {
  const client = new ConvexHttpClient(configuration.backendUrl);
  const auth = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { email: configuration.email, password: configuration.password, flow: 'signIn' },
  });
  if (!auth.tokens?.token) throw Error('O login operacional não retornou uma sessão.');
  client.setAuth(auth.tokens.token);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const identity = await client.query(api.access.session.me, {});
    if (
      identity?.id !== configuration.userId ||
      identity.role !== 'ADMIN' ||
      identity.loginMethod !== 'local'
    )
      throw Error('A sessão não corresponde à conta operacional autorizada.');
    if ((await client.query(api.operations.availability, {})).maintenance)
      throw Error('O acesso restrito de smoke não está autorizado durante a manutenção.');
    const id = configuration.calendarId as Id<'calendars'>;
    const before = await client.query(api.calendars.calendar, { id });
    if (before.purpose !== 'test')
      throw Error(
        'O smoke exige um calendário de teste operacional, sem alterar calendários definitivos.',
      );
    const saved = await client.mutation(api.calendars.saveCalendar, {
      id,
      body: {
        version: before.version,
        catalogueRevision: before.currentCatalogueRevision,
        state: before.state,
        unchangedOnly: true,
      },
    });
    if (!saved.unchanged || saved.version !== before.version)
      throw Error('A confirmação do salvamento operacional mudou a versão.');
    console.log('Smoke: sessão e salvamento sem mudança confirmados.');
    browser = await chromium.launch();
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(30_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(configuration.portalUrl);
    await page.locator('#email').fill(configuration.email);
    await page.locator('#password').fill(configuration.password);
    await page.locator('#auth-submit').click();
    await page.locator('#workspace').waitFor();
    console.log('Smoke: login no portal confirmado.');
    await page.goto(`${configuration.portalUrl}/calendarios/${id}/editar`);
    await page.locator('#record-title').waitFor();
    await page.locator('[data-view="calendar"]').click();
    await page.locator('#months').waitFor();
    console.log('Smoke: editor e visualização confirmados; aguardando PDF.');
    const [pdf] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.locator('#download-pdf-top').click(),
    ]).catch(async (cause: unknown) => {
      const message = await page
        .locator('#message')
        .textContent()
        .catch(() => '');
      throw new Error(`O smoke não recebeu o PDF. ${message ?? ''}`, { cause });
    });
    const path = await pdf.path();
    if (!path || !(await readFile(path)).subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw Error('O smoke não confirmou um PDF válido.');
    if (errors.length) throw Error('O portal apresentou um erro de execução durante o smoke.');
    const after = await client.query(api.calendars.calendar, { id });
    if (
      after.version !== before.version ||
      JSON.stringify(after.state) !== JSON.stringify(before.state)
    )
      throw Error('O calendário operacional mudou durante o smoke.');
    await page.locator('#logout').click();
    console.log('Smoke confirmado: login, rotas, consulta, salvamento sem mudança e PDF real.');
  } finally {
    await browser?.close();
    await client.action(api.auth.signOut, {}).catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 3 && process.argv[2] === '--check-browser') await checkSmokeBrowser();
  else if (process.argv.length === 2) await verifyReleaseSmoke(releaseSmokeConfiguration());
  else throw Error('Uso: release-smoke [--check-browser]');
}
