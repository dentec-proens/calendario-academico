import test from 'node:test';
import assert from 'node:assert/strict';
import {access, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';
import puppeteer from 'puppeteer-core';
import {createTestApp} from './helpers/database.mjs';

async function browserPath() {
  for (const path of [process.env.DENTEC_TEST_BROWSER, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean)) {
    try { await access(path); return path; } catch {}
  }
}
const executablePath = await browserPath();

test('React portal preserves document publication, human review, exports and account administration in the browser', {skip: !executablePath && 'Defina DENTEC_TEST_BROWSER com o caminho do Chrome/Chromium.', timeout: 90000}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dentec-review-browser-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const output = join(directory, 'build');
  await build({configFile: fileURLToPath(new URL('../vite.config.mjs', import.meta.url)), logLevel: 'silent', build: {outDir: output}});
  const app = await createTestApp(t,{setupCode: 'synthetic', portalDirectory: pathToFileURL(output + '/')});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = '';
  async function call(path, method = 'GET', body) {
    const response = await fetch(base + path, {method, headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-Dentec-Request': '1'}, body: body ? JSON.stringify(body) : undefined});
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const data = await response.json();
    assert(response.ok, JSON.stringify(data));
    return data;
  }
  const password = 'synthetic-only-password';
  await call('/api/setup', 'POST', {code: 'synthetic', name: 'Revisor de teste', email: 'admin@ifpr.edu.br', password});
  await call('/api/login', 'POST', {email: 'admin@ifpr.edu.br', password});
  const bootstrap = await call('/api/bootstrap');
  const campus = bootstrap.campuses.find(c => c.name === 'Foz do Iguaçu');
  const calendar = await call('/api/calendars', 'POST', {campusId: campus.id, year: 2027, modalities: ['integrado'], regime: 'anual', purpose: 'test', courses: 'Curso de teste <script>alert(1)</script>'});
  await call('/api/users', 'POST', {name: 'Campus de teste', email: 'campus@ifpr.edu.br', password, campusId: campus.id, loginMethod: 'local'});
  const browser = await puppeteer.launch({executablePath, headless: true, args: ['--no-sandbox']});
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) errors.push(message.text());});
  page.on('dialog', dialog => dialog.accept());
  const cdp = await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: directory});
  const fill = (selector, value) => page.locator(selector).fill(String(value));
  const click = selector => page.locator(selector).click();
  const waitText = async (selector, value) => {
    try { await page.waitForFunction((selector, value) => document.querySelector(selector)?.textContent.includes(value), {}, selector, value); }
    catch (error) { throw new Error(`Esperado ${value} em ${selector}; recebido: ${await page.$eval(selector, element => element.textContent)}; erros: ${JSON.stringify(errors)}`, {cause: error}); }
  };
  async function login(email) {
    await fill('#email', email); await fill('#password', password); await click('#auth-submit');
    await page.waitForSelector('#workspace');
  }
  await page.goto(base);
  await login('admin@ifpr.edu.br');
  assert(await page.$('#calendar-list svg'));
  assert.equal(await page.$eval('#calendar-list script', element => Boolean(element)).catch(() => false), false);

  // The account form keeps the selected campus when switching roles.
  await click('[data-page="administration"]');
  await page.select('#user-campus', campus.id);
  await page.select('#user-role', 'ADMIN');
  assert.equal(await page.$('#user-campus'), null);
  await page.select('#user-role', 'CAMPUS');
  assert.equal(await page.$eval('#user-campus', element => element.value), campus.id);
  await fill('#user-name', 'Convidado de teste'); await fill('#user-email', 'invite@ifpr.edu.br');
  await click('#create-user-button'); await page.waitForSelector('#invite-url');
  const firstInvite = await page.$eval('#invite-url', element => element.value);
  assert.match(firstInvite, /\/ativar#token=/);
  const invited = (await call('/api/bootstrap')).users.find(u => u.email === 'invite@ifpr.edu.br');
  await page.waitForFunction(() => !document.querySelector('[data-new-invite]')?.disabled);
  await click(`[data-new-invite="${invited.id}"]`);
  await page.waitForFunction(previous => document.querySelector('#invite-url')?.value !== previous, {}, firstInvite);
  await click('#close-invite'); assert.equal(await page.$('#invite-url'), null);
  const member = bootstrap.users[0];
  await click(`[data-password-recovery="${member.id}"]`); await page.waitForSelector('#recovery-link');
  assert.match(await page.$eval('#recovery-link', element => element.value), /\/recuperar-senha#token=/);
  await click('#close-recovery'); assert.equal(await page.$('#recovery-link'), null);
  await click(`[data-remove-member="${invited.id}"]`); await waitText('#message', 'Acesso excluído');
  assert(!(await call('/api/bootstrap')).users.some(u => u.id === invited.id));

  // Upload stays draft until the reviewer explicitly confirms applicability.
  await click('[data-page="institution"]');
  const pdf = join(directory, 'norma.pdf');
  await writeFile(pdf, '%PDF-1.4 synthetic institutional PDF fixture');
  await fill('#document-year', '2027'); await fill('#document-title', 'Norma de teste'); await fill('#document-source', 'Fonte de teste');
  await (await page.$('#document-file')).uploadFile(pdf);
  await page.waitForFunction(() => !document.querySelector('#document-form button').disabled);
  await click('#document-form button'); await waitText('#document-message', 'Arquivo preservado como rascunho');
  await click('[data-document-status="vigente"]'); await waitText('#document-message', 'Marque a conferência');
  assert.equal((await call('/api/documents')).documents[0].status, 'rascunho');
  await click('[data-confirm-document]'); await click('[data-document-status="vigente"]');
  await waitText('#document-message', 'Vigência atualizada');
  await page.waitForSelector('[data-document-status="arquivado"]');
  assert.equal((await call('/api/documents')).documents[0].status, 'vigente');

  // Open, edit, confirm, save and export a human review; tabs retain the draft.
  await click('[data-page="review-panel"]'); await click('#open-review');
  await page.waitForSelector('#review-content');
  assert.equal(await page.$$eval('.review-item', elements => elements.length), 29);
  await click('#preview-review'); await waitText('#review-message', 'Salve a análise');
  const criterion = await page.$eval('[data-edit-criterion]', element => element.dataset.editCriterion);
  await click(`[data-edit-criterion="${criterion}"]`);
  await page.select(`[data-criterion="${criterion}"]`, 'NAO_ATENDIDO');
  await fill(`[data-notes="${criterion}"]`, 'Necessário ajustar os dias letivos.');
  await click(`[data-confirm-criterion="${criterion}"]`);
  await page.waitForFunction(() => document.querySelector('#review-conclusion').value.includes('atende apenas parcialmente'));
  await click('[data-page="calendars"]'); await click('[data-page="review-panel"]');
  assert.equal(await page.$eval(`[data-notes="${criterion}"]`, element => element.value), 'Necessário ajustar os dias letivos.');
  await click('button[form="review-form"]'); await waitText('#review-message', 'Revisão humana salva');
  assert.equal((await call('/api/reviews/' + calendar.id)).review.entries.find(e => e.id === criterion).reviewed, true);
  await click('#preview-review'); await page.waitForSelector('#review-preview table');
  assert.equal(await page.$$eval('#review-preview table tr', elements => elements.length), 30);
  for (const [id, extension] of [['download-review-html', 'html'], ['download-review-txt', 'txt']]) {
    await click('#' + id); await waitText('#review-message', 'Download solicitado');
    const filename = `parecer-2027-revisao-1.${extension}`;
    for (let attempt = 0; attempt < 30 && !(await readdir(directory)).includes(filename); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.match(await readFile(join(directory, filename), 'utf8'), /Necessário ajustar os dias letivos/);
  }
  await click(`[data-edit-criterion="${criterion}"]`); await fill(`[data-notes="${criterion}"]`, 'Novo ajuste pendente');
  await click('#preview-review'); await waitText('#review-message', 'Salve a análise');

  // Publishing changes the shared revision; old reviews require acknowledgement.
  await click('[data-page="institution"]');
  await click('[data-document-status="arquivado"]'); await waitText('#document-message', 'Vigência atualizada');
  await click('[data-page="review-panel"]'); await click('#open-review');
  await page.waitForSelector('#review-stale');
  assert.equal(await page.$eval('#review-stale', element => element.required), true);
  await click('#review-stale'); await click('button[form="review-form"]'); await waitText('#review-message', 'Revisão humana salva');
  await click('[data-page="calendars"]'); await click(`[data-delete-calendar="${calendar.id}"]`); await waitText('#message', 'movido para a lixeira');
  await click('[data-page="review-panel"]'); assert.equal(await page.$('#review-content'), null);

  // Responsive layout and public/campus sessions retain their access boundaries.
  await page.setViewport({width: 390, height: 844});
  await click('[data-page="administration"]');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await click('#logout'); await page.waitForSelector('#auth');
  await login('campus@ifpr.edu.br');
  assert.equal(await page.$('#admin-tab'), null); assert.equal(await page.$('#review-tab'), null);
  await click('[data-page="institution"]');
  assert.equal(await page.$('#document-form'), null); assert.equal(await page.$('#catalogue-form'), null);
  await waitText('#document-list', 'Norma de teste');
  assert.equal(await page.$('[data-document-status]'), null);
  assert.deepEqual(errors, []);
});
