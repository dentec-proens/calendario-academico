import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {build} from 'vite';
import {createTestApp} from './helpers/database.mjs';

function browserExecutable() {
  if (process.env.DENTEC_TEST_BROWSER) {
    return existsSync(process.env.DENTEC_TEST_BROWSER) ? process.env.DENTEC_TEST_BROWSER : null;
  }
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).map(directory => join(directory, 'Google', 'Chrome', 'Application', 'chrome.exe')),
  ].find(path => existsSync(path));
}

test('React portal preserves setup, accounts, scoped calendars, editor navigation and trash restoration', {timeout: 90_000}, async t => {
  const executablePath = browserExecutable();
  if (!executablePath) {
    t.skip(process.env.DENTEC_TEST_BROWSER
      ? 'DENTEC_TEST_BROWSER does not point to an installed Chrome/Chromium executable.'
      : 'Chrome/Chromium unavailable. Set DENTEC_TEST_BROWSER to run portal browser coverage.');
    return;
  }

  // All data, generated assets and the Chromium profile are disposable; no local installation is used.
  const temporary = await mkdtemp(join(tmpdir(), 'dentec-portal-browser-'));
  let browser, app;
  t.after(async () => {
    await browser?.close();
    if (app?.server.listening) await new Promise(resolve => app.server.close(resolve));
    await rm(temporary, {recursive: true, force: true});
  });
  const output = join(temporary, 'portal');
  await build({
    configFile: fileURLToPath(new URL('../vite.config.mjs', import.meta.url)),
    logLevel: 'silent',
    build: {outDir: output},
  });
  app = await createTestApp(t,{

    setupCode: 'synthetic-browser-setup',
    portalDirectory: pathToFileURL(output + '/'),
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    userDataDir: join(temporary, 'browser-profile'),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(12_000);
  await page.setViewport({width: 1280, height: 900});
  await page.emulateTimezone('America/Sao_Paulo');
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const fill = (selector, value) => page.locator(selector).fill(value);
  const click = selector => page.locator(selector).click();
  const text = selector => page.$eval(selector, element => element.textContent);
  async function contains(selector, value) {
    await page.waitForFunction((selector, value) => document.querySelector(selector)?.textContent.includes(value), {}, selector, value);
  }
  async function api(path, method = 'GET', body) {
    const result = await page.evaluate(async ({path, method, body}) => {
      const response = await fetch(path, {
        method,
        headers: body ? {'Content-Type': 'application/json', 'X-Dentec-Request': '1'} : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      return {status: response.status, data: await response.json()};
    }, {path, method, body});
    assert(result.status >= 200 && result.status < 300, `${method} ${path}: ${JSON.stringify(result)}`);
    return result.data;
  }
  async function submit(selector, path) {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST'),
      click(selector),
    ]);
    const result = await response.json();
    assert(response.ok(), `${path}: ${JSON.stringify(result)}`);
    return result;
  }
  async function login(email, password) {
    await page.waitForSelector('#auth', {visible: true});
    await fill('#email', email);
    await fill('#password', password);
    await click('#auth-submit');
    await page.waitForSelector('#workspace', {visible: true});
  }
  async function logout() {
    await click('#logout');
    await page.waitForSelector('#auth', {visible: true});
    assert.equal(await page.$('#workspace'), null);
  }
  async function createAndReturn(purpose) {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/calendars' && response.request().method() === 'POST'),
      page.waitForNavigation({waitUntil: 'load'}),
      click(`#create-calendar button[value="${purpose}"]`),
    ]);
    assert.equal(response.status(), 201);
    assert.equal(new URL(page.url()).pathname, '/editor');
    const id = new URL(page.url()).searchParams.get('id');
    assert(id, 'the editor URL identifies the newly persisted calendar');
    // Chromium may evict a POST response body on navigation; read the persisted record instead.
    const calendar = await api('/api/calendars/' + id);
    await contains('#record-heading', purpose === 'definitive' ? '[DEFINITIVO]' : '[TESTE]');
    await contains('#record-heading', calendar.courses);
    await Promise.all([page.waitForNavigation({waitUntil: 'load'}), click('a.portal-back')]);
    await page.waitForSelector('#workspace', {visible: true});
    await page.waitForSelector(`[data-delete-calendar="${calendar.id}"]`);
    return calendar;
  }

  await page.goto(base, {waitUntil: 'load'});
  await contains('#auth-title', 'Criar administração');
  await fill('#admin-name', 'Synthetic Browser Admin');
  await fill('#setup-code', 'synthetic-browser-setup');
  await fill('#email', 'browser-admin@ifpr.edu.br');
  await fill('#password', 'synthetic-browser-password');
  await click('#auth-submit');
  await contains('#account', 'Synthetic Browser Admin · ADMIN');
  await page.waitForSelector('#workspace', {visible: true});
  assert(await page.$('#admin-tab'));
  assert(await page.$('#review-tab'));
  assert((await page.$$('nav .lucide')).length >= 4, 'navigation displays bundled Lucide icons');

  await click('#admin-tab');
  await fill('#campus-name', 'Synthetic Browser Campus');
  const campus = await submit('#campus-form button', '/api/campuses');
  await contains('#campus-list', 'Synthetic Browser Campus');
  assert.equal(await page.$eval(`[data-campus="${campus.id}"]`, button => button.closest('li').querySelector('strong').textContent), campus.name, 'campus names do not receive calendar test/definitive labels');
  await page.select('#user-campus', campus.id);
  await page.select('#user-role', 'ADMIN');
  assert.equal(await page.$('#user-campus-label'), null, 'ADMIN accounts have institutional scope');
  await page.select('#user-role', 'CAMPUS');
  await page.select('#user-campus', campus.id);
  assert.equal(await page.$('#user-password'), null, 'invites do not require the administrator to choose a password');
  await fill('#user-name', 'Synthetic Browser Invite');
  await fill('#user-email', 'browser-invite@ifpr.edu.br');
  const invitation = await submit('#create-user-button', '/api/users');
  await page.waitForSelector('#invite-url', {visible: true});
  assert.equal(await page.$eval('#invite-url', input => input.value), invitation.inviteUrl);
  assert.match(invitation.inviteUrl, /\/ativar#token=.+/);
  await contains('#user-list', 'browser-invite@ifpr.edu.br');
  await contains('#user-list', 'Convite pendente');
  await click('#close-invite');
  assert.equal(await page.$('#invite-result'), null, 'private invitation can be hidden');

  await page.select('#user-login-method', 'local');
  await page.select('#user-campus', campus.id);
  await fill('#user-name', 'Synthetic Browser Campus User');
  await fill('#user-email', 'browser-campus@ifpr.edu.br');
  await fill('#user-password', 'synthetic-campus-password');
  await submit('#create-user-button', '/api/users');
  await contains('#user-list', 'browser-campus@ifpr.edu.br');
  await page.waitForSelector('#user-password', {hidden: true});
  assert.equal(await page.$eval('#user-login-method', select => select.value), 'invite');

  await click('[data-page="calendars"]');
  await page.select('#calendar-campus', campus.id);
  await fill('#calendar-year', '2028');
  assert.equal(await page.$eval('#calendar-name', input => input.value), 'Calendário 2028 - Campus Synthetic Browser Campus');
  assert.equal(await page.$eval('#calendar-name', input => input.readOnly), true);
  await click('[name="calendar-modality"][value="integrado"]');
  await click('[name="calendar-modality"][value="graduacao"]');
  await page.select('#calendar-regime', 'misto');
  await fill('#calendar-courses', 'Synthetic integrated and degree courses');
  await fill('#calendar-classes', 'Synthetic classes 1 and 2');
  await fill('#calendar-shifts', 'Synthetic morning and evening');
  const definitive = await createAndReturn('definitive');
  assert.deepEqual(definitive.state.modalities, ['integrado', 'graduacao']);
  assert.equal(definitive.state.regime, 'misto');
  assert.equal(definitive.purpose, 'definitive');
  await contains('#calendar-list', 'Técnico integrado + Graduação');
  await contains('#calendar-list', 'Synthetic classes 1 and 2');
  await contains('#calendar-list', 'Synthetic morning and evening');

  const adminInfo = await api('/api/bootstrap');
  const otherCampus = adminInfo.campuses.find(item => item.id !== campus.id);
  await api('/api/calendars', 'POST', {
    campusId: otherCampus.id, year: 2028, modalities: ['subsequente'], regime: 'anual', purpose: 'test', courses: 'Synthetic other campus course',
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForSelector('#campus-filter');
  await page.waitForFunction(() => document.querySelectorAll('#calendar-list > li[data-calendar-campus]').length === 2);
  await page.select('#campus-filter', otherCampus.id);
  await contains('#calendar-list', 'Synthetic other campus course');
  assert.equal(await page.$(`[data-delete-calendar="${definitive.id}"]`), null);
  await page.select('#campus-filter', campus.id);
  await contains('#calendar-list', 'Synthetic integrated and degree courses');
  assert.equal((await text('#calendar-list')).includes('Synthetic other campus course'), false);

  page.once('dialog', dialog => dialog.accept());
  await click(`[data-delete-calendar="${definitive.id}"]`);
  await contains('#message', 'Calendário movido para a lixeira');
  await page.waitForSelector(`[data-delete-calendar="${definitive.id}"]`, {hidden: true});
  await click('.calendar-trash summary');
  await click(`[data-restore-calendar="${definitive.id}"]`);
  await contains('#message', 'Calendário restaurado');
  await page.waitForSelector(`[data-delete-calendar="${definitive.id}"]`);
  assert.equal(await page.$(`[data-restore-calendar="${definitive.id}"]`), null);
  const restored = await api('/api/calendars/' + definitive.id);
  assert.deepEqual(restored.state.modalities, ['integrado', 'graduacao']);
  assert.equal(restored.courses, definitive.courses);
  assert.equal(await page.$eval('#campus-filter', select => select.value), campus.id, 'restoration preserves the active campus filter');

  await logout();
  await contains('#auth-title', 'Entrar');
  assert.equal(await page.$('#setup-fields'), null);
  await login('browser-campus@ifpr.edu.br', 'synthetic-campus-password');
  await contains('#account', 'Synthetic Browser Campus User · CAMPUS');
  assert.equal(await page.$('#admin-tab'), null);
  assert.equal(await page.$('#review-tab'), null);
  assert.equal(await page.$('#campus-filter'), null);
  assert.equal(await page.$('#document-form'), null);
  assert.equal(await page.$('#catalogue-form'), null);
  assert.equal(await page.$eval('#calendar-campus', select => select.disabled), true);
  assert.deepEqual(await page.$$eval('#calendar-campus option', options => options.map(option => option.value)), [campus.id]);
  await contains('#calendar-list', 'Synthetic integrated and degree courses');
  assert.equal((await text('#calendar-list')).includes('Synthetic other campus course'), false);

  await fill('#calendar-year', '2029');
  await click('[name="calendar-modality"][value="posgraduacao"]');
  await fill('#calendar-courses', 'Synthetic campus-owned test course');
  const testCalendar = await createAndReturn('test');
  assert.equal(testCalendar.campusId, campus.id);
  assert.equal(testCalendar.purpose, 'test');
  assert.deepEqual(testCalendar.state.modalities, ['posgraduacao']);
  await contains('#calendar-list', '[TESTE] Calendário 2029 - Campus Synthetic Browser Campus');
  assert.equal((await page.$$('#calendar-list > li[data-calendar-campus]')).length, 2);
  await logout();
  assert.equal(await text('#account'), 'Instalação local');
  assert.deepEqual(pageErrors, [], 'the production portal and editor load without uncaught browser errors');
});
