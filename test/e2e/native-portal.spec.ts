import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../browser/test.ts';
import { editorUrl, parseEditorPath } from '../../src/app-routes.ts';
import { configuredE2ETarget } from '../../scripts/e2e-environment.ts';

const restorationFixture = process.env.DENTEC_NATIVE_RESTORE_FIXTURE;

function browserEnvironment() {
  return configuredE2ETarget(process.env);
}

async function login(page: Page, base: string, email: string, password: string) {
  await page.goto(base);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#workspace')).toBeVisible();
}

test('native Convex portal synchronizes two sessions and preserves unapplied editor changes', async ({
  browser,
  cleanup,
}) => {
  test.setTimeout(90_000);
  const { base, email, password, year, campusId } = browserEnvironment();
  const [one, two] = await Promise.all([browser.newContext(), browser.newContext()]);
  cleanup(() => one.close());
  cleanup(() => two.close());
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

  await Promise.all([login(editor, base, email, password), login(observer, base, email, password)]);
  const marker = 'Synthetic Convex React ' + Date.now();
  await editor.locator('#calendars .collection-heading button').click();
  await editor.locator('#calendar-year').fill(String(year));
  if (campusId) await editor.locator('#calendar-campus').selectOption(campusId);
  await editor.locator('input[name="calendar-modality"]').first().check();
  await editor.locator('#calendar-courses').fill(marker);
  await Promise.all([
    editor.waitForURL('**/calendarios/*/editar'),
    editor.locator('#create-calendar button[value="test"]').click(),
  ]);
  await expect(editor.locator('#record-title')).toContainText(String(year));
  const id = parseEditorPath(new URL(editor.url()).pathname)?.id;
  assert(id);
  await expect(observer.locator('#calendar-list')).toContainText(marker);
  const preservedUrl = new URL(editor.url());
  preservedUrl.searchParams.set('busca', 'synthetic');
  preservedUrl.hash = 'history-area';
  await observer.goto(preservedUrl.href);
  await expect(observer.locator('#record-title')).toContainText(String(year));
  const openedUrl = new URL(observer.url());
  assert.equal(parseEditorPath(openedUrl.pathname)?.id, id);
  assert.equal(openedUrl.searchParams.get('busca'), 'synthetic');
  assert.equal(openedUrl.hash, '#history-area');

  async function fillOrganization(page: Page, start: string, end: string) {
    if (!(await page.locator('#offer-integrado-form').isVisible()))
      await page.locator('[data-edit-organization="integrado"]').click();
    await page.locator('#offer-integrado-organization').selectOption('anual');
    await page.locator('#offer-integrado-period-0-start').fill(start);
    await page.locator('#offer-integrado-period-0-end').fill(end);
    await page.locator('#offer-integrado-count').selectOption('2');
    await page.locator('#offer-integrado-stage-0-start').fill(start);
    await page.locator('#offer-integrado-stage-0-end').fill(start.slice(0, 8) + '15');
    await page.locator('#offer-integrado-stage-1-start').fill(start.slice(0, 8) + '16');
    await page.locator('#offer-integrado-stage-1-end').fill(end);
  }
  async function applyOrganization(start: string, end: string) {
    await editor.locator('[data-view="periods"]').click();
    await fillOrganization(editor, start, end);
    await editor.locator('#offer-integrado-apply').click();
    await expect(editor.locator('#autosave-status')).toHaveAttribute('data-state', 'saved');
    await expect(editor.locator('button#server-save')).toBeHidden();
  }
  await observer.locator('[data-view="periods"]').click();
  await applyOrganization(`${year}-03-01`, `${year}-03-31`);
  await expect(observer.locator('[data-offer="integrado"]')).toContainText(`01/03/${year}`);
  await editor.reload();
  await expect(editor.locator('#record-title')).toContainText(String(year));
  await editor.locator('[data-view="periods"]').click();
  await expect(editor.locator('[data-offer="integrado"]')).toContainText(`01/03/${year}`);
  await observer.locator('[data-edit-organization="integrado"]').click();
  await observer.locator('#offer-integrado-period-0-start').fill('2027-02-16');
  await applyOrganization(`${year}-04-01`, `${year}-04-30`);
  await expect(
    observer.getByText('O calendário ou a base mudou em outra sessão.', { exact: false }),
  ).toContainText('Suas alterações foram preservadas');
  await expect(observer.locator('#offer-integrado-period-0-start')).toHaveValue('2027-02-16');
  await expect(observer.locator('#offer-integrado-period-0-start')).toHaveValue(`${year}-03-01`);
  await fillOrganization(observer, `${year}-05-01`, `${year}-05-31`);
  await observer.locator('#offer-integrado-apply').click();
  await expect(observer.locator('#autosave-status')).toHaveAttribute('data-state', 'blocked');
  await expect(observer.locator('[data-offer="integrado"]')).toContainText(`01/05/${year}`);
  await editor.reload();
  await editor.locator('[data-view="periods"]').click();
  await expect(editor.locator('[data-offer="integrado"]')).toContainText(`01/04/${year}`);
  await expect(editor.locator('[data-offer="integrado"]')).not.toContainText(`01/05/${year}`);

  // Trash only the synthetic calendar produced by this run.
  await editor.goto(base);
  await expect(editor.locator(`[data-delete-calendar="${id}"]`)).toBeVisible();
  await editor.locator(`[data-delete-calendar="${id}"]`).click();
  await editor.locator('.confirmation-dialog__confirm').click();
  await expect(editor.locator(`[data-delete-calendar="${id}"]`)).toHaveCount(0);
  assert.deepEqual(
    nodeRequests,
    [],
    'native mode never sends domain or authentication requests to the Node API',
  );
  assert.deepEqual(errors, [], 'portal and editor load without uncaught browser errors');
});

test('native Convex preserves invitations, password recovery, PDFs and human review', async ({
  browser,
  page,
  cleanup,
}) => {
  test.setTimeout(150_000);
  const { base, email, password, year, campusId } = browserEnvironment();
  const directory = await mkdtemp(join(tmpdir(), 'dentec-native-full-'));
  cleanup(() => rm(directory, { recursive: true, force: true }));
  page.setDefaultTimeout(25_000);
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const marker = 'Synthetic native full ' + Date.now();
  const memberEmail = 'native-' + Date.now() + '@ifpr.edu.br';
  const memberPassword = 'SyntheticNative!' + Date.now();

  await login(page, base, email, password);
  await page.locator('[data-page="accounts"]').click();
  await page.locator('#accounts .collection-heading button').click();
  await page.locator('#user-name').fill(marker);
  await page.locator('#user-email').fill(memberEmail);
  if (campusId) await page.locator('#user-campus').selectOption(campusId);
  await page.locator('#create-user-button').click();
  await expect(page.locator('#invite-url')).toBeVisible();
  await expect(page.locator('#user-list')).toContainText(memberEmail);
  const invite = await page.locator('input#invite-url').inputValue();
  const memberId = await page.locator('#user-list li').evaluateAll((rows, marker) => {
    const control = rows
      .find((row) => row.textContent?.includes(marker))
      ?.querySelector<HTMLElement>('[data-remove-member]');
    const id = control?.dataset.removeMember;
    if (!id) throw new Error('Synthetic member removal control was not found');
    return id;
  }, marker);
  const guestContext = await browser.newContext();
  cleanup(() => guestContext.close());
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
  await expect(guest.locator('#invite-message')).toContainText('Conta ativada');
  await login(guest, base, memberEmail, memberPassword);
  await expect(
    guest.locator('#admin-tab'),
    'invited CAMPUS account keeps its access scope',
  ).toHaveCount(0);
  await page.locator(`[data-password-recovery="${memberId}"]`).click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('#recovery-link')).toBeVisible();
  const recovery = await page.locator('input#recovery-link').inputValue();
  await guest.locator('#logout').click();
  await expect(guest.locator('#auth')).toBeVisible();
  await guest.goto(recovery);
  await guest.locator('#password').fill(memberPassword + 'Reset');
  await guest.locator('#confirmation').fill(memberPassword + 'Reset');
  await guest.locator('#reset-form button').click();
  await expect(guest.locator('#reset-form')).toBeHidden();
  await login(guest, base, memberEmail, memberPassword + 'Reset');
  await page.locator(`[data-remove-member="${memberId}"]`).click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('#message')).toContainText('Acesso excluído');
  await guest.close();

  const fixtureContext = await browser.newContext();
  cleanup(() => fixtureContext.close());
  const fixture = await fixtureContext.newPage();
  await fixture.setContent(
    `<h1>Calendário sintético ${year - 1}</h1><p>01/01/${year - 1} Ano Novo</p><p>Referência sintética de teste.</p>`,
  );
  await mkdir(join(directory, 'source'));
  const pdf = join(directory, 'source', 'synthetic-reference.pdf');
  await fixture.pdf({ path: pdf, format: 'A4' });
  await fixture.close();
  await page.locator('[data-page="institution"]').click();
  await page.locator('#institution .collection-heading button').click();
  await page.locator('#document-year').fill(String(year));
  await page.locator('#document-title').fill(marker);
  await page.locator('#document-source').fill('Referência sintética exclusiva do laboratório');
  await page.locator('input#document-file').setInputFiles(pdf);
  await page.locator('#document-form button').click();
  await expect(page.locator('#document-message')).toContainText('Arquivo preservado como rascunho');
  await expect(page.locator('#document-list')).toContainText(marker);
  const documentId = await page.locator('#document-list li').evaluateAll((rows, marker) => {
    const control = rows
      .find((row) => row.textContent?.includes(marker))
      ?.querySelector<HTMLElement>('[data-confirm-document]');
    const id = control?.dataset.confirmDocument;
    if (!id) throw new Error('Synthetic document confirmation control was not found');
    return id;
  }, marker);
  await page
    .locator('#document-list li')
    .filter({ has: page.locator(`[data-confirm-document="${documentId}"]`) })
    .locator('.document-manage summary')
    .click();
  await page.locator(`[data-confirm-document="${documentId}"]`).click();
  await page.locator(`[data-document-id="${documentId}"][data-document-status="vigente"]`).click();
  await expect(page.locator('#document-message')).toContainText('Vigência atualizada');
  await page.locator(`[data-view-document="${documentId}"]`).click();
  await expect(page.locator('.document-reader__stage')).toHaveAttribute('aria-busy', 'false');
  const documentDownloadPromise = page.waitForEvent('download');
  await page.locator(`[data-download-document="${documentId}"]`).click();
  const documentDownload = await documentDownloadPromise;
  expect(documentDownload.suggestedFilename()).toBe('synthetic-reference.pdf');
  const downloadedDocument = join(directory, 'synthetic-reference.pdf');
  await documentDownload.saveAs(downloadedDocument);
  assert(
    (await readFile(downloadedDocument)).equals(await readFile(pdf)),
    'download preserves the uploaded institutional PDF bytes',
  );
  await page.getByRole('button', { name: 'Voltar à lista' }).click();

  await page.locator('[data-page="calendars"]').click();
  await page.locator('#calendars .collection-heading button').click();
  await page.locator('#calendar-year').fill(String(year));
  if (campusId) await page.locator('#calendar-campus').selectOption(campusId);
  await page.locator('input[name="calendar-modality"]').first().check();
  await page.locator('#calendar-courses').fill(marker);
  await Promise.all([
    page.waitForURL('**/calendarios/*/editar'),
    page.locator('#create-calendar button[value="test"]').click(),
  ]);
  await expect(page.locator('#record-title')).toContainText(String(year));
  const calendarId = parseEditorPath(new URL(page.url()).pathname)?.id;
  assert(calendarId);
  await page.locator('[data-view="calendar"]').click();
  const calendarDownloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.locator('#download-pdf').click();
  const calendarDownload = await calendarDownloadPromise;
  await expect(page.locator('#download-pdf')).toBeEnabled();
  await expect(page.locator('#message')).toContainText('PDF gerado');
  const expectedPdf = join(directory, `teste-calendario-${year}-v1.pdf`);
  expect(calendarDownload.suggestedFilename()).toBe(`teste-calendario-${year}-v1.pdf`);
  await calendarDownload.saveAs(expectedPdf);
  const generatedPdf = await readFile(expectedPdf);
  assert(generatedPdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
  await test
    .info()
    .attach('calendario-e2e.pdf', { body: generatedPdf, contentType: 'application/pdf' });
  const [{ getDocument }, { WorkerMessageHandler }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ]);
  (
    globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler: unknown } }
  ).pdfjsWorker = { WorkerMessageHandler };
  const pdfTask = getDocument({
    data: Uint8Array.from(generatedPdf),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const document = await pdfTask.promise;
    const contents: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      contents.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    const text = contents.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain(`CALENDÁRIO ACADÊMICO E ADMINISTRATIVO ${year}`);
    expect(text).toContain('CALENDÁRIO DE TESTE');
    expect(text).toContain(marker);
  } finally {
    await pdfTask.destroy();
  }
  await page.goto(base);
  await page.locator('[data-page="review-panel"]').click();
  await page.locator('#review-calendar').selectOption(calendarId);
  await page.locator('#open-review').click();
  await expect(page.locator('#review-content')).toBeVisible();
  const criterion = await page
    .locator('[data-confirm-criterion]')
    .first()
    .getAttribute('data-confirm-criterion');
  assert(criterion);
  await page.locator(`[data-fields="${criterion}"] [data-choice="NAO_ATENDIDO"]`).click();
  await page
    .locator('#review-items > li')
    .filter({ has: page.locator(`[data-notes="${criterion}"]`) })
    .locator('.review-item__notes summary')
    .click();
  await page
    .locator(`[data-notes="${criterion}"]`)
    .fill('Observação sintética preservada no Convex.');
  await page.locator('[data-page="calendars"]').click();
  const otherCampus = await page
    .locator('#campus-filter option')
    .evaluateAll((options) => (options[2] as HTMLOptionElement | undefined)?.value);
  if (otherCampus) {
    await page.locator('#campus-filter').selectOption(otherCampus);
    await expect(page.locator(`[data-delete-calendar="${calendarId}"]`)).toHaveCount(0);
    await page.locator('#campus-filter').selectOption('');
  }
  await page.locator('[data-page="review-panel"]').click();
  await page.locator('#review-calendar').selectOption(calendarId);
  await page.locator('#open-review').click();
  await expect(
    page.locator(`[data-notes="${criterion}"]`),
    'reopening the same calendar preserves the unsaved review after filtering the calendar list',
  ).toHaveValue('Observação sintética preservada no Convex.');
  await page.locator(`[data-confirm-criterion="${criterion}"]`).click();
  if (await page.locator('#review-stale').count()) await page.locator('#review-stale').click();
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('#review-message')).toContainText('Análise salva');
  await page.locator('#preview-review').click();
  await expect(page.locator('#review-preview table')).toBeVisible();
  await expect(page.locator('#review-preview')).toContainText(
    'Observação sintética preservada no Convex.',
  );
  await page.locator('[data-page="institution"]').click();
  await page
    .locator('#document-list li')
    .filter({ has: page.locator(`[data-document-id="${documentId}"]`) })
    .locator('.document-manage summary')
    .click();
  await page
    .locator(`[data-document-id="${documentId}"][data-document-status="arquivado"]`)
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Retirar de vigência' }).click();
  await expect(page.locator('#document-message')).toContainText('Vigência atualizada');
  await page.locator('[data-page="calendars"]').click();
  await page.locator(`[data-delete-calendar="${calendarId}"]`).click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('#message')).toContainText('movido para a lixeira');
  await page.locator('.calendar-trash summary').click();
  await page.locator(`[data-restore-calendar="${calendarId}"]`).click();
  await expect(page.locator('#message')).toContainText('Calendário restaurado');
  await page.goto(base + editorUrl(calendarId, 'history'));
  await expect(page.locator('#activity-checklist')).toBeVisible();
  await page.goto(base);
  await page.locator('[data-page="review-panel"]').click();
  await page.locator('#review-calendar').selectOption(calendarId);
  await page.locator('#open-review').click();
  await expect(page.locator('#review-content')).toBeVisible();
  await expect(
    page.locator(`[data-notes="${criterion}"]`),
    'restoring a calendar preserves the saved human review',
  ).toHaveValue('Observação sintética preservada no Convex.');
  await page.locator('[data-page="calendars"]').click();
  await page.locator(`[data-delete-calendar="${calendarId}"]`).click();
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('#message')).toContainText('movido para a lixeira');
  assert.deepEqual(
    errors,
    [],
    'all native account, file and review screens load without uncaught browser errors',
  );
});

test('admin restores institutional originals created for E2E', async ({
  browser,
  page,
  cleanup,
}) => {
  test.skip(
    !restorationFixture,
    'Requires DENTEC_NATIVE_RESTORE_FIXTURE with missing originals in the disposable deployment.',
  );
  test.setTimeout(90_000);
  const { base, email, password, year, campusId, runId, mode } = browserEnvironment();
  assert(restorationFixture);
  const fixture = JSON.parse(await readFile(restorationFixture, 'utf8')) as {
    documentId: string;
    runId?: string;
    campusId?: string;
    year?: number;
  };
  if (mode === 'development') {
    assert.equal(fixture.runId, runId, 'restoration fixture must belong to the configured E2E run');
    assert.equal(
      fixture.campusId,
      campusId,
      'restoration fixture must use the dedicated E2E campus',
    );
    assert.equal(fixture.year, year, 'restoration fixture must use the reserved E2E year');
  }
  const original = join(dirname(restorationFixture), 'restoration-upload.pdf');
  const expected = await readFile(original);
  const directory = await mkdtemp(join(tmpdir(), 'dentec-restoration-browser-'));
  cleanup(() => rm(directory, { recursive: true, force: true }));
  page.setDefaultTimeout(25_000);
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#workspace')).toBeVisible();
  await page.close();
  const documentContext = await browser.newContext();
  cleanup(() => documentContext.close());
  const documentPage = await documentContext.newPage();
  documentPage.setDefaultTimeout(25_000);
  documentPage.on('dialog', (dialog) => {
    void dialog.accept();
  });
  documentPage.on('pageerror', (error) => errors.push(error.message));
  const documentDirectory = join(directory, 'documents');
  await mkdir(documentDirectory);
  await documentPage.goto(base);
  await documentPage.locator('#email').fill(email);
  await documentPage.locator('#password').fill(password);
  await documentPage.locator('#auth-submit').click();
  await expect(documentPage.locator('#workspace')).toBeVisible();
  await documentPage.locator('[data-page="institution"]').click();
  await documentPage
    .locator('#document-list li')
    .filter({ has: documentPage.locator(`form[data-restore-document="${fixture.documentId}"]`) })
    .locator('.document-manage summary')
    .click();
  await expect(
    documentPage.locator(`form[data-restore-document="${fixture.documentId}"]`),
  ).toBeVisible();
  if (mode === 'development')
    await expect(
      documentPage.locator('#document-list li').filter({
        has: documentPage.locator(`form[data-restore-document="${fixture.documentId}"]`),
      }),
    ).toContainText(`Restauração E2E ${runId}`);
  await documentPage
    .locator(`form[data-restore-document="${fixture.documentId}"] input[type="file"]`)
    .setInputFiles(original);
  await documentPage.locator(`form[data-restore-document="${fixture.documentId}"] button`).click();

  await expect(
    documentPage.locator(`form[data-restore-document="${fixture.documentId}"]`),
  ).toHaveCount(0);
  const downloadSelector = `[data-download-document="${fixture.documentId}"]`;
  const responsePromise = documentPage.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /^\/files\/[a-f0-9]{64}$/.test(new URL(response.url()).pathname) &&
      response.headers()['content-type']?.startsWith('application/pdf') === true,
    { timeout: 10_000 },
  );
  await documentPage.locator(`[data-view-document="${fixture.documentId}"]`).click();
  const downloadResponse = await responsePromise;
  assert.equal(downloadResponse.status(), 200);
  const documentDownloadPromise = documentPage.waitForEvent('download');
  await documentPage.locator(downloadSelector).click();
  const documentDownload = await documentDownloadPromise;
  expect(documentDownload.suggestedFilename()).toBe('original-e2e.pdf');
  const restoredDocument = join(documentDirectory, 'original-e2e.pdf');
  await documentDownload.saveAs(restoredDocument);
  assert(
    (await readFile(restoredDocument)).equals(expected),
    'restored institutional original keeps its bytes and stored filename',
  );
  assert.deepEqual(errors, []);
});
