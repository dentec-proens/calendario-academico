import {
  assertReleaseOrigin,
  routeReleaseDeployment,
  verifyCalendarPdf,
} from './release-smoke-browser.ts';
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
    if (before.catalogueRevision !== before.currentCatalogueRevision)
      throw Error('Atualize previamente o calendário operacional; o smoke não sincroniza dados.');
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
    if (configuration.deploymentUrl)
      await routeReleaseDeployment(page, {
        portalUrl: configuration.portalUrl,
        deploymentUrl: configuration.deploymentUrl,
        protection: configuration.protection,
      });
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(30_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const loginPage = await page.goto(configuration.portalUrl);
    if (!loginPage?.ok()) throw Error('O deployment não disponibilizou a tela de acesso.');
    assertReleaseOrigin(page, configuration.portalUrl);
    await page.locator('#email').fill(configuration.email);
    await page.locator('#password').fill(configuration.password);
    await page.locator('#auth-submit').click();
    await page.locator('#workspace').waitFor();
    console.log('Smoke: login no portal confirmado.');
    const editorPage = await page.goto(`${configuration.portalUrl}/calendarios/${id}/editar`);
    if (!editorPage?.ok()) throw Error('O deployment não disponibilizou o editor.');
    assertReleaseOrigin(page, configuration.portalUrl);
    await page.locator('#record-title').waitFor();
    await verifyCalendarPdf(page);
    if (errors.length) throw Error('O portal apresentou um erro de execução durante o smoke.');
    const after = await client.query(api.calendars.calendar, { id });
    if (
      after.version !== before.version ||
      after.catalogueRevision !== before.catalogueRevision ||
      JSON.stringify(after.institutionalSnapshot) !==
        JSON.stringify(before.institutionalSnapshot) ||
      JSON.stringify(after.documentSnapshot) !== JSON.stringify(before.documentSnapshot) ||
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
