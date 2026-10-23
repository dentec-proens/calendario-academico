import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';

const base = process.env.DENTEC_NATIVE_BROWSER_URL;
const email = process.env.DENTEC_NATIVE_TEST_EMAIL;
const password = process.env.DENTEC_NATIVE_TEST_PASSWORD;
const restorationFixture = process.env.DENTEC_NATIVE_RESTORE_FIXTURE;
const executablePath = [
  process.env.DENTEC_TEST_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));
const nativeSkip =
  process.env.DENTEC_DISPOSABLE_E2E !== '1' || !base || !email || !password || !executablePath
    ? 'Requires DENTEC_DISPOSABLE_E2E=1 and a disposable deployment with DENTEC_NATIVE_BROWSER_URL, DENTEC_NATIVE_TEST_EMAIL, DENTEC_NATIVE_TEST_PASSWORD and a test browser. Never run against an imported or shared deployment.'
    : false;

test(
  'native Convex portal synchronizes two sessions and preserves unapplied editor changes',
  {
    skip: Boolean(nativeSkip),
    timeout: 90_000,
  },
  async (t) => {
    const { base, email, password, executablePath } = browserEnvironment();
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    t.onTestFinished(() => browser.close());
    const [one, two] = await Promise.all([
      browser.createBrowserContext(),
      browser.createBrowserContext(),
    ]);
    const [editor, observer] = await Promise.all([one.newPage(), two.newPage()]);
    const errors: string[] = [];
    const nodeRequests: string[] = [];
    for (const page of [editor, observer]) {
      page.setDefaultTimeout(20_000);
      page.on('pageerror', (error) =>
        errors.push(error instanceof Error ? error.message : String(error)),
      );
      page.on('request', (request) => {
        if (request.url().startsWith(base + '/api/')) nodeRequests.push(request.url());
      });
    }

    async function contains(page: Page, selector: string, value: string) {
      await page.waitForFunction(
        (selector, value) => document.querySelector(selector)?.textContent?.includes(value),
        {},
        selector,
        value,
      );
    }

    async function login(page: Page) {
      await page.goto(base);
      await page.locator('#email').fill(email);
      await page.locator('#password').fill(password);
      await page.locator('#auth-submit').click();
      await page.waitForSelector('#workspace', { visible: true });
    }

    await Promise.all([login(editor), login(observer)]);
    const marker = 'Synthetic Convex React ' + Date.now();
    await editor.locator('#calendar-year').fill('2097');
    await editor.locator('input[name="calendar-modality"]').click();
    await editor.locator('#calendar-courses').fill(marker);
    await Promise.all([
      editor.waitForNavigation(),
      editor.locator('#create-calendar button[value="test"]').click(),
    ]);
    await contains(editor, '#record-heading', marker);
    const id = new URL(editor.url()).searchParams.get('id');
    assert(id);
    await contains(observer, '#calendar-list', marker);
    const preservedUrl = new URL(editor.url());
    preservedUrl.searchParams.set('view', 'synthetic');
    preservedUrl.hash = 'history-area';
    await observer.goto(preservedUrl.href);
    await contains(observer, '#record-heading', marker);
    const openedUrl = new URL(observer.url());
    assert.equal(openedUrl.searchParams.get('id'), id);
    assert.equal(openedUrl.searchParams.get('view'), 'synthetic');
    assert.equal(openedUrl.hash, '#history-area');

    async function addPeriod(name: string, start: string, end: string) {
      await editor.locator('#period-name').fill(name);
      await editor.locator('#period-start').fill(start);
      await editor.locator('#period-end').fill(end);
      await editor.locator('#period-submit').click();
      await editor.waitForFunction(
        () => document.querySelector<HTMLElement>('#autosave-status')?.dataset.state === 'saved',
      );
      assert.equal(
        await editor.$eval('button#server-save', (element) => element.hidden),
        true,
        'successful autosave needs no separate save action',
      );
    }

    await addPeriod('Synthetic shared period', '2097-03-01', '2097-03-31');
    await contains(observer, '#period-list', 'Synthetic shared period');
    await observer.locator('#period-name').fill('Synthetic unapplied field');
    await addPeriod('Synthetic later period', '2097-04-01', '2097-04-30');
    await contains(observer, '#message', 'Suas alterações foram preservadas');
    assert.equal(
      await observer.$eval('input#period-name', (element) => element.value),
      'Synthetic unapplied field',
    );
    assert(
      !(await observer.$eval('#period-list', (element) => element.textContent)).includes(
        'Synthetic later period',
      ),
    );

    // Trash only the synthetic calendar produced by this run.
    await editor.goto(base);
    await editor.waitForSelector(`[data-delete-calendar="${id}"]`);
    editor.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await editor.locator(`[data-delete-calendar="${id}"]`).click();
    await editor.waitForFunction(
      (id) => !document.querySelector(`[data-delete-calendar="${id}"]`),
      {},
      id,
    );
    assert.deepEqual(
      nodeRequests,
      [],
      'native mode never sends domain or authentication requests to the Node API',
    );
    assert.deepEqual(errors, [], 'portal and editor load without uncaught browser errors');
  },
);

test(
  'native Convex preserves invitations, password recovery, PDFs, history and human review',
  { skip: Boolean(nativeSkip), timeout: 150_000 },
  async (t) => {
    const { base, email, password, executablePath } = browserEnvironment();
    const directory = await mkdtemp(join(tmpdir(), 'dentec-native-full-'));
    let browser: Browser | undefined;
    t.onTestFinished(async () => {
      try {
        await browser?.close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(25_000);
    page.on('dialog', (dialog) => {
      void dialog.accept();
    });
    const errors: string[] = [];
    page.on('pageerror', (error) =>
      errors.push(error instanceof Error ? error.message : String(error)),
    );
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
    const marker = 'Synthetic native full ' + Date.now();
    const memberEmail = 'native-' + Date.now() + '@ifpr.edu.br';
    const memberPassword = 'SyntheticNative!' + Date.now();

    async function contains(selector: string, value: string) {
      try {
        await page.waitForFunction(
          (selector, value) => document.querySelector(selector)?.textContent?.includes(value),
          {},
          selector,
          value,
        );
      } catch (error) {
        throw new Error(
          `Esperado ${value} em ${selector}; recebido: ${await page.$eval(selector, (element) => element.textContent)}`,
          { cause: error },
        );
      }
    }

    async function login(target: Page, loginEmail: string, loginPassword: string) {
      await target.goto(base);
      await target.locator('#email').fill(loginEmail);
      await target.locator('#password').fill(loginPassword);
      await target.locator('#auth-submit').click();
      await target.waitForSelector('#workspace', { visible: true });
    }

    await login(page, email, password);
    await page.locator('[data-page="administration"]').click();
    await page.locator('#user-name').fill(marker);
    await page.locator('#user-email').fill(memberEmail);
    await page.locator('#create-user-button').click();
    await page.waitForSelector('#invite-url');
    await contains('#user-list', memberEmail);
    const invite = await page.$eval('input#invite-url', (element) => element.value);
    const memberId = await page.$$eval(
      '#user-list li',
      (rows, marker) => {
        const control = rows
          .find((row) => row.textContent?.includes(marker))
          ?.querySelector<HTMLElement>('[data-remove-member]');
        const id = control?.dataset.removeMember;
        if (!id) throw new Error('Synthetic member removal control was not found');
        return id;
      },
      marker,
    );
    const guestContext = await browser.createBrowserContext();
    const guest = await guestContext.newPage();
    guest.setDefaultTimeout(25_000);
    guest.on('pageerror', (error) =>
      errors.push(error instanceof Error ? error.message : String(error)),
    );
    await guest.goto(invite);
    await guest.locator('#activation-email').fill(memberEmail);
    await guest.locator('#activation-password').fill(memberPassword);
    await guest.locator('#activation-confirm').fill(memberPassword);
    await guest.locator('#activate-button').click();
    await guest.waitForFunction(() =>
      document.querySelector('#invite-message')?.textContent?.includes('Conta ativada'),
    );
    await login(guest, memberEmail, memberPassword);
    assert.equal(
      await guest.$('#admin-tab'),
      null,
      'invited CAMPUS account keeps its access scope',
    );
    await page.locator(`[data-password-recovery="${memberId}"]`).click();
    await page.waitForSelector('#recovery-link');
    const recovery = await page.$eval('input#recovery-link', (element) => element.value);
    await guest.locator('#logout').click();
    await guest.waitForSelector('#auth');
    await guest.goto(recovery);
    await guest.locator('#password').fill(memberPassword + 'Reset');
    await guest.locator('#confirmation').fill(memberPassword + 'Reset');
    await guest.locator('#reset-form button').click();
    await guest.waitForFunction(
      () => document.querySelector<HTMLFormElement>('#reset-form')?.hidden,
    );
    await login(guest, memberEmail, memberPassword + 'Reset');
    await page.locator(`[data-remove-member="${memberId}"]`).click();
    await contains('#message', 'Acesso excluído');
    await guestContext.close();

    const fixture = await browser.newPage();
    await fixture.setContent(
      '<h1>Calendário sintético 2096</h1><p>01/01/2096 Ano Novo</p><p>Referência sintética de teste.</p>',
    );
    await mkdir(join(directory, 'source'));
    const pdf = join(directory, 'source', 'synthetic-reference.pdf');
    await fixture.pdf({ path: pdf, format: 'A4' });
    await fixture.close();
    await page.locator('[data-page="institution"]').click();
    await page.locator('#document-year').fill('2097');
    await page.locator('#document-title').fill(marker);
    await page.locator('#document-source').fill('Referência sintética exclusiva do laboratório');
    const documentInput = await page.$('input#document-file');
    assert(documentInput);
    await documentInput.uploadFile(pdf);
    await page.locator('#document-form button').click();
    await contains('#document-message', 'Arquivo preservado como rascunho');
    await contains('#document-list', marker);
    const documentId = await page.$$eval(
      '#document-list li',
      (rows, marker) => {
        const control = rows
          .find((row) => row.textContent?.includes(marker))
          ?.querySelector<HTMLElement>('[data-confirm-document]');
        const id = control?.dataset.confirmDocument;
        if (!id) throw new Error('Synthetic document confirmation control was not found');
        return id;
      },
      marker,
    );
    await page.locator(`[data-confirm-document="${documentId}"]`).click();
    await page
      .locator(`[data-document-id="${documentId}"][data-document-status="vigente"]`)
      .click();
    await contains('#document-message', 'Vigência atualizada');
    await page.locator(`[data-download-document="${documentId}"]`).click();
    const downloadedDocument = join(directory, 'synthetic-reference.pdf');
    for (let attempt = 0; attempt < 60 && !existsSync(downloadedDocument); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert(
      (await readFile(downloadedDocument)).equals(await readFile(pdf)),
      'download preserves the uploaded institutional PDF bytes',
    );

    await page.locator('[data-page="calendars"]').click();
    await page.locator('#calendar-year').fill('2097');
    await page.locator('input[name="calendar-modality"]').click();
    await page.locator('#calendar-courses').fill(marker);
    await Promise.all([
      page.waitForNavigation(),
      page.locator('#create-calendar button[value="test"]').click(),
    ]);
    await contains('#record-heading', marker);
    const calendarId = new URL(page.url()).searchParams.get('id');
    assert(calendarId);
    const historyInput = await page.$('input#history-file');
    assert(historyInput);
    await historyInput.uploadFile(pdf);
    await page.locator('#history-submit').click();
    await page.waitForFunction(() =>
      document.querySelector('#history-list')?.textContent?.includes('synthetic-reference.pdf'),
    );
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('#history-analysis')?.hidden === false,
    );
    await page.locator('#download-pdf-top').click();
    await page.waitForFunction(
      () => document.querySelector<HTMLButtonElement>('#download-pdf-top')?.disabled === false,
      {
        timeout: 120_000,
      },
    );
    await contains('#message', 'PDF gerado');
    const expectedPdf = join(directory, 'teste-calendario-2097-v1.pdf');
    for (let attempt = 0; attempt < 60 && !existsSync(expectedPdf); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert((await readFile(expectedPdf)).subarray(0, 5).equals(Buffer.from('%PDF-')));
    await page.goto(base);
    await page.locator('[data-page="review-panel"]').click();
    await page.select('#review-calendar', calendarId);
    await page.locator('#open-review').click();
    await page.waitForSelector('#review-content');
    const criterion = await page.$eval(
      '[data-edit-criterion]',
      (element) => (element as HTMLElement).dataset.editCriterion,
    );
    assert(criterion);
    await page.locator(`[data-edit-criterion="${criterion}"]`).click();
    await page.select(`[data-criterion="${criterion}"]`, 'NAO_ATENDIDO');
    await page
      .locator(`[data-notes="${criterion}"]`)
      .fill('Observação sintética preservada no Convex.');
    await page.locator('[data-page="calendars"]').click();
    const otherCampus = await page.$$eval(
      '#campus-filter option',
      (options) => (options[2] as HTMLOptionElement | undefined)?.value,
    );
    if (otherCampus) {
      await page.select('#campus-filter', otherCampus);
      await page.waitForFunction(
        (id) => !document.querySelector(`[data-delete-calendar="${id}"]`),
        {},
        calendarId,
      );
      await page.select('#campus-filter', '');
    }
    await page.locator('[data-page="review-panel"]').click();
    assert.equal(
      await page.$eval(
        `[data-notes="${criterion}"]`,
        (element) => (element as HTMLTextAreaElement).value,
      ),
      'Observação sintética preservada no Convex.',
      'filtering the paginated calendar list cannot discard an unsaved human review',
    );
    await page.locator(`[data-confirm-criterion="${criterion}"]`).click();
    if (await page.$('#review-stale')) await page.locator('#review-stale').click();
    // The global status banner is sticky. Center this distant control so an
    // automated minimal scroll cannot place the click underneath that banner.
    await page.$eval('button[form="review-form"]', (element) =>
      element.scrollIntoView({ block: 'center' }),
    );
    await page.locator('button[form="review-form"]').click();
    await contains('#review-message', 'Análise salva');
    await page.locator('#preview-review').click();
    await page.waitForSelector('#review-preview table');
    await contains('#review-preview', 'Observação sintética preservada no Convex.');
    await page.locator('[data-page="institution"]').click();
    await page
      .locator(`[data-document-id="${documentId}"][data-document-status="arquivado"]`)
      .click();
    await contains('#document-message', 'Vigência atualizada');
    await page.locator('[data-page="calendars"]').click();
    await page.locator(`[data-delete-calendar="${calendarId}"]`).click();
    await contains('#message', 'movido para a lixeira');
    await page.locator('.calendar-trash summary').click();
    await page.locator(`[data-restore-calendar="${calendarId}"]`).click();
    await contains('#message', 'Calendário restaurado');
    await page.goto(base + '/editor?id=' + encodeURIComponent(calendarId));
    await contains('#history-list', 'synthetic-reference.pdf');
    await page.goto(base);
    await page.locator('[data-page="review-panel"]').click();
    await page.select('#review-calendar', calendarId);
    await page.locator('#open-review').click();
    await page.waitForSelector('#review-content');
    assert.equal(
      await page.$eval(
        `[data-notes="${criterion}"]`,
        (element) => (element as HTMLTextAreaElement).value,
      ),
      'Observação sintética preservada no Convex.',
      'restoring a calendar preserves the saved human review',
    );
    await page.locator('[data-page="calendars"]').click();
    await page.locator(`[data-delete-calendar="${calendarId}"]`).click();
    await contains('#message', 'movido para a lixeira');
    assert.deepEqual(
      errors,
      [],
      'all native account, file and review screens load without uncaught browser errors',
    );
  },
);

test(
  'admin restores missing originals through the portal and old editor links retain their destination',
  { skip: Boolean(nativeSkip) || !restorationFixture, timeout: 90_000 },
  async (t) => {
    const { base, email, password, executablePath } = browserEnvironment();
    assert(restorationFixture);
    const fixture = JSON.parse(await readFile(restorationFixture, 'utf8')) as {
      calendarId: string;
      historyId: string;
      documentId: string;
      alias: string;
    };
    const original = join(dirname(restorationFixture), 'restoration-upload.pdf');
    const expected = await readFile(original);
    const directory = await mkdtemp(join(tmpdir(), 'dentec-restoration-browser-'));
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    t.onTestFinished(async () => {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(25_000);
    page.on('dialog', (dialog) => {
      void dialog.accept();
    });
    const errors: string[] = [];
    page.on('pageerror', (error) =>
      errors.push(error instanceof Error ? error.message : String(error)),
    );
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
    await page.goto(base);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('#auth-submit').click();
    await page.waitForSelector('#workspace', { visible: true });
    // The editor canonicalizes this URL before the load event. Wait for its
    // visible state rather than a navigation lifecycle tied to the old URL.
    const navigation = await cdp.send('Page.navigate', {
      url:
        base +
        '/editor?id=' +
        encodeURIComponent(fixture.alias) +
        '&view=restore-proof#history-area',
    });
    assert.equal(navigation.errorText, undefined);
    await page.waitForSelector(`form[data-restore-history="${fixture.historyId}"]`);
    const canonical = new URL(page.url());
    assert.equal(canonical.searchParams.get('id'), fixture.calendarId);
    assert.equal(canonical.searchParams.get('view'), 'restore-proof');
    assert.equal(canonical.hash, '#history-area');
    const historyInput = await page.$(
      `form[data-restore-history="${fixture.historyId}"] input[type="file"]`,
    );
    assert(historyInput);
    await historyInput.uploadFile(original);
    await page.locator(`form[data-restore-history="${fixture.historyId}"] button`).click();
    await page.waitForFunction(() =>
      document.querySelector('#message')?.textContent?.includes('PDF original restaurado'),
    );
    await page.waitForSelector(`form[data-restore-history="${fixture.historyId}"]`, {
      hidden: true,
    });
    await page.locator(`a[data-history-id="${fixture.historyId}"]`).click();
    const restored = join(directory, 'original-e2e.pdf');
    for (let attempt = 0; attempt < 60 && !existsSync(restored); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert(
      (await readFile(restored)).equals(expected),
      'restored historical original keeps its bytes and stored filename',
    );
    await rm(restored);
    await page.close();
    const documentBrowser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    t.onTestFinished(() => documentBrowser.close());
    const documentPage = await documentBrowser.newPage();
    documentPage.setDefaultTimeout(25_000);
    documentPage.on('dialog', (dialog) => {
      void dialog.accept();
    });
    documentPage.on('pageerror', (error) =>
      errors.push(error instanceof Error ? error.message : String(error)),
    );
    const documentDirectory = join(directory, 'documents');
    await mkdir(documentDirectory);
    const documentCdp = await documentPage.createCDPSession();
    await documentCdp.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: documentDirectory,
    });
    await documentPage.goto(base);
    await documentPage.locator('#email').fill(email);
    await documentPage.locator('#password').fill(password);
    await documentPage.locator('#auth-submit').click();
    await documentPage.waitForSelector('#workspace', { visible: true });
    await documentPage.locator('[data-page="institution"]').click();
    await documentPage.waitForSelector(`form[data-restore-document="${fixture.documentId}"]`);
    const documentInput = await documentPage.$(
      `form[data-restore-document="${fixture.documentId}"] input[type="file"]`,
    );
    assert(documentInput);
    await documentInput.uploadFile(original);
    await documentPage
      .locator(`form[data-restore-document="${fixture.documentId}"] button`)
      .click();
    await documentPage.waitForFunction(() =>
      document.querySelector('#document-message')?.textContent?.includes('PDF original restaurado'),
    );
    await documentPage.waitForSelector(`form[data-restore-document="${fixture.documentId}"]`, {
      hidden: true,
    });
    const downloadSelector = `[data-download-document="${fixture.documentId}"]`;
    await documentPage.$eval(downloadSelector, (element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    const hitAfter = await documentPage.$eval(downloadSelector, (element) => {
      const rectangle = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rectangle.x + rectangle.width / 2,
        rectangle.y + rectangle.height / 2,
      );
      return {
        hit: hit ? hit.tagName + '#' + hit.id : null,
        receivesClick: hit !== null && element.contains(hit),
      };
    });
    assert.equal(
      hitAfter.receivesClick,
      true,
      'the download link must receive a real pointer click',
    );
    const responsePromise = documentPage.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        /^\/files\/[a-f0-9]{64}$/.test(new URL(response.url()).pathname) &&
        response.headers()['content-type']?.startsWith('application/pdf') === true,
      { timeout: 10_000 },
    );
    await documentPage.locator(downloadSelector).click();
    const downloadResponse = await responsePromise;
    assert.equal(downloadResponse.status(), 200);
    // Chrome's CDP body is empty for this attachment; compare the saved bytes below.
    const restoredDocument = join(documentDirectory, 'original-e2e.pdf');
    for (let attempt = 0; attempt < 60 && !existsSync(restoredDocument); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert(
      existsSync(restoredDocument),
      'Restored document download missing; received: ' +
        (await readdir(documentDirectory)).join(', '),
    );
    assert(
      (await readFile(restoredDocument)).equals(expected),
      'restored institutional original keeps its bytes and stored filename',
    );
    assert.deepEqual(errors, []);
  },
);

function browserEnvironment() {
  assert(
    base && email && password && executablePath,
    'Disposable browser test configuration is required',
  );
  return { base, email, password, executablePath };
}
