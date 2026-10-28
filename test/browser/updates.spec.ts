import { chromium, type Page } from '@playwright/test';
import { test, expect } from './test.ts';
import type { EditorSession } from '../../web/features/calendar-editor/session/editor-session.ts';
import type { FormDrafts } from '../../web/shared/forms/drafts.tsx';
import { startUpdateServer } from './update-server.ts';
import { selectEditorSection } from './editor-navigation.ts';

declare global {
  interface Window {
    updateEditor: EditorSession;
    updatePanelFault?: boolean;
    updateDrafts: FormDrafts;
    updateOwners?: { editor: EditorSession; drafts: FormDrafts };
  }
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`an open editor continues through a publication with its unapplied draft at ${viewport.width}px`, async ({
    page,
    cleanup,
  }) => {
    await page.setViewportSize(viewport);
    const server = await startUpdateServer(
      cleanup,
      'editor',
      viewport.width === 390 ? 'legacy' : true,
    );
    await page.goto(server.origin + '/calendarios/synthetic-calendar/editar');
    await expect(page.locator('#record-title')).toBeVisible();
    await page.evaluate(() => {
      window.updateOwners = { editor: window.updateEditor, drafts: window.updateDrafts };
      document.documentElement.dataset.originalDocument = 'yes';
    });
    await selectEditorSection(page, 'events');
    await page.locator('[data-tab="eventos"]').click();
    await page.locator('#new-event').click();
    await page.locator('#event-name').fill('Evento não aplicado antes da publicação');
    await page.locator('#close-event-panel').click();
    server.select('b');
    const loaded = page.waitForResponse((response) =>
      response.url().includes('/assets/IssuesSection-'),
    );
    await selectEditorSection(page, 'issues');
    expect((await loaded).status()).toBe(200);
    await expect(page.locator('#issue-list')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Não foi possível abrir esta página' }),
    ).toHaveCount(0);
    await selectEditorSection(page, 'events');
    await page.locator('#resume-event').click();
    await expect(page.locator('#event-name')).toHaveValue(
      'Evento não aplicado antes da publicação',
    );
    await expect(page.locator('html')).toHaveAttribute('data-original-document', 'yes');
    expect(
      await page.evaluate(
        () =>
          window.updateOwners?.editor === window.updateEditor &&
          window.updateOwners?.drafts === window.updateDrafts,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--update-fixture-build')
          .trim(),
      ),
    ).toBe('a');
    const fresh = await page.context().newPage();
    await fresh.goto(server.origin + '/calendarios/synthetic-calendar/editar');
    await expect(fresh.locator('#record-title')).toBeVisible();
    expect(
      await fresh.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--update-fixture-build')
          .trim(),
      ),
    ).toBe('b');
    await fresh.close();
  });
}

test('a failed production section chunk preserves the editor and unapplied event', async ({
  page,
  cleanup,
}) => {
  const { origin } = await startUpdateServer(cleanup);
  await page.goto(origin + '/calendarios/synthetic-calendar/editar');
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    window.updateOwners = { editor: window.updateEditor, drafts: window.updateDrafts };
  });
  await page.locator('[data-view="events"]').click();
  await page.locator('[data-tab="eventos"]').click();
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Trabalho conservado após chunk');
  await page.locator('#close-event-panel').click();
  let failedChunk = '';
  await page.route('**/assets/PeriodsSection-*.js', (route) => {
    failedChunk = route.request().url();
    return route.abort('failed');
  });
  await page.locator('[data-view="periods"]').click();
  await expect(
    page.getByRole('heading', { name: 'Não foi possível abrir esta página' }),
  ).toBeVisible();
  // The owner and controls survive below the failed section, rather than being recreated.
  await expect(page.locator('.portal-back')).toBeVisible();
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await page.unroute('**/assets/PeriodsSection-*.js');
  const retried = page.waitForResponse((response) => response.url() === failedChunk);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  expect((await retried).status()).toBe(200);
  await expect(page.locator('[data-edit-organization="integrado"]')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.updateOwners?.editor === window.updateEditor &&
        window.updateOwners?.drafts === window.updateDrafts,
    ),
  ).toBe(true);
  await page.locator('[data-view="events"]').click();
  await page.locator('#resume-event').click();
  await expect(page.locator('#event-name')).toHaveValue('Trabalho conservado após chunk');
  await page.locator('#event-type-campus-event').check();
  await page.locator('#event-evidence').fill('Fonte conservada');
  await page.locator('#event-start').fill('2027-04-05');
  await page.locator('#event-end').fill('2027-04-06');
  await page.locator('#event-form button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => window.editorTest.calls.saves)).toBe(1);
  expect(await page.evaluate(() => window.updateOwners?.editor === window.updateEditor)).toBe(true);
  expect(
    await page.evaluate(() =>
      window.updateEditor
        .getSnapshot()
        .state.events.some((event) => event.name === 'Trabalho conservado após chunk'),
    ),
  ).toBe(true);
});

async function observeNewVersion(page: Page) {
  await page.clock.fastForward(15_001);
  const observed = page.waitForResponse((response) => response.url().endsWith('/version.json'));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await observed;
  await expect(page.getByText('Uma nova versão do portal está disponível.')).toBeVisible();
}

test('a clean production tab moves from A to B only on a workspace menu click', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  await page.clock.install();
  await page.goto(server.origin + '/calendarios');
  await expect(page.locator('#calendar-list')).toBeVisible();
  const manifestResponse = await page.request.get(server.origin + '/version.json');
  expect(manifestResponse.headers()['cache-control']).toBe('no-store');
  expect(manifestResponse.headers()['content-type']).toContain('application/json');
  expect((await page.request.get(server.origin + '/assets/missing.js')).status()).toBe(404);
  expect((await page.request.get(server.origin + '/unknown')).status()).toBe(404);
  expect((await page.request.get(server.origin + '/.vite/manifest.json')).status()).toBe(404);
  const a = await server.version('a');
  const b = await server.version('b');
  expect(a.buildId).not.toBe(b.buildId);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--update-fixture-build').trim(),
    ),
  ).toBe('a');
  await page.evaluate(() => {
    document.documentElement.dataset.oldDocument = 'yes';
  });
  server.select('b');
  await observeNewVersion(page);
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  await page.locator('[data-page="institution"]').click();
  await expect(page).toHaveURL(server.origin + '/documentos');
  await expect(
    page.getByRole('heading', { name: 'Base institucional', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-old-document');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--update-fixture-build').trim(),
    ),
  ).toBe('b');
  // A new document executes B and observes the same identity, so there is no loop.
  await expect(page.getByText('Uma nova versão do portal está disponível.')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('portal-update-attempts-v1') ?? '[]'),
    ),
  ).toMatchObject([{ from: a.buildId, target: b.buildId, count: 1 }]);
});

test('a detached draft blocks manual and menu updates without submitting or discarding it', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  await page.clock.install();
  await page.goto(server.origin + '/calendarios');
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await page.locator('#calendar-courses').fill('Curso ainda não enviado');
  await page.locator('[data-page="institution"]').click();
  const warning = page.waitForEvent('dialog');
  const reload = page.reload({ timeout: 1000 }).catch(() => undefined);
  const dialog = await warning;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await reload;
  await page.evaluate(() => {
    document.documentElement.dataset.oldDocument = 'yes';
  });
  server.select('b');
  await observeNewVersion(page);
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeDisabled();
  await page.locator('[data-page="calendars"]').click();
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await expect(page.locator('#calendar-courses')).toHaveValue('Curso ainda não enviado');
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  expect(await page.evaluate(() => window.portalRouterTest.mutations)).toHaveLength(0);
});

for (const { width, switchIdentity } of [
  { width: 1440, switchIdentity: false },
  { width: 390, switchIdentity: false },
  { width: 1440, switchIdentity: true },
]) {
  test(`delayed HTML keeps the old document inert and cancels late replacement in ${width}px${switchIdentity ? ' after identity change' : ''}`, async ({
    page,
    cleanup,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const server = await startUpdateServer(cleanup, 'portal-navigation');
    server.selectManifest('b');
    await page.goto(server.origin + '/calendarios');
    await expect(page.locator('#calendar-list')).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.dataset.oldDocument = 'yes';
    });
    server.select('b');
    await expect(page.getByText('Uma nova versão do portal está disponível.')).toBeVisible();
    // A pending document navigation makes Playwright evaluate/locators wait for its new
    // context. Observe the visible old DOM before navigation, without changing its behavior.
    let visible:
      | {
          text: string;
          inert: boolean;
          replacedOwner: boolean;
          box?: { x: number; y: number; width: number; height: number };
        }
      | undefined;
    page.on('console', (event) => {
      if (event.text().startsWith('update-dom:'))
        visible = JSON.parse(event.text().slice('update-dom:'.length)) as typeof visible;
    });
    await page.evaluate((changeIdentity) => {
      const previousDrafts = window.updateDrafts;
      const observe = () => {
        const button = [...document.querySelectorAll('button')].find(
          (button) => button.textContent === 'Cancelar atualização',
        );
        console.debug(
          'update-dom:' +
            JSON.stringify({
              text: document.querySelector('.portal-update')?.textContent,
              inert: document.querySelector<HTMLElement>('.portal-update-scope')?.inert,
              replacedOwner: window.updateDrafts !== previousDrafts,
              box: button?.getBoundingClientRect().toJSON(),
            }),
        );
      };
      let changedIdentity = false;
      new MutationObserver(() => {
        if (
          changeIdentity &&
          !changedIdentity &&
          document.querySelector('.portal-update')?.textContent?.includes('Atualizando portal…')
        ) {
          changedIdentity = true;
          const self = window.portalRouterTest.members.find((member) => member.id === 'user-a')!;
          window.portalRouterTest.publishMember({ ...self, active: false });
        }
        observe();
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      observe();
    }, switchIdentity);
    const { arrival, release } = server.delayNext('/documentos');
    const failed = page.waitForEvent('requestfailed', {
      predicate: (request) =>
        request.isNavigationRequest() && request.url().endsWith('/documentos'),
      timeout: 25_000,
    });
    if (width === 390) await page.getByRole('button', { name: 'Navegação · Calendários' }).click();
    await page.locator('[data-page="institution"]').click({ noWaitAfter: true });
    await arrival;
    await expect.poll(() => visible?.text).toContain('Atualizando portal…');
    expect(visible?.inert).toBe(true);
    if (switchIdentity) await expect.poll(() => visible?.replacedOwner).toBe(true);
    expect(visible?.inert).toBe(true);
    await expect.poll(() => visible?.text, { timeout: 15_000 }).toContain('Cancelar atualização');
    const box = visible!.box!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await failed;
    await expect.poll(() => visible?.inert).toBe(false);
    release();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
    await page.getByRole('button', { name: 'Novo calendário' }).click();
    await page.locator('#calendar-courses').fill('Novo trabalho depois de cancelar');
    await expect(page.locator('#calendar-courses')).toHaveValue('Novo trabalho depois de cancelar');
    await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  });
}

test('a failed screen chunk preserves detached drafts and the exact draft owner', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  await page.goto(server.origin + '/calendarios');
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await page.locator('#calendar-courses').fill('Curso preservado');
  await page.evaluate(() => {
    window.updateOwners = { editor: window.updateEditor, drafts: window.updateDrafts };
  });
  await page.route('**/assets/AccountsPage-*.js', (route) => route.abort('failed'));
  await page.locator('[data-page="accounts"]').click();
  await expect(
    page.getByRole('heading', { name: 'Não foi possível abrir esta página' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.updateOwners?.drafts === window.updateDrafts)).toBe(true);
  await page.locator('[data-page="calendars"]').click();
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await expect(page.locator('#calendar-courses')).toHaveValue('Curso preservado');
});

test('review edits, query preferences and reversion use their real owners', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  server.selectManifest('b');
  await page.goto(server.origin + '/revisoes/calendar-a');
  await expect(page.locator('#review-items')).toBeVisible();
  await expect(page.getByText('Uma nova versão do portal está disponível.')).toBeVisible();
  await page.locator('#review-items > li').first().locator('.review-item__notes summary').click();
  await page
    .locator('#review-items > li')
    .first()
    .locator('textarea')
    .fill('Observações ainda não confirmadas');
  await page.locator('[data-page="institution"]').click();
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeDisabled();
  await page.locator('[data-page="review-panel"]').click();
  await page.locator('#open-review').click();
  await page.locator('#review-items > li').first().locator('.review-item__notes summary').click();
  await expect(page.locator('#review-items > li').first().locator('textarea')).toHaveValue(
    'Observações ainda não confirmadas',
  );
  expect(await page.evaluate(() => window.portalRouterTest.mutations)).toHaveLength(0);
});

test('private tokens and unavailable storage cannot authorize an update', async ({
  page,
  context,
  cleanup,
}) => {
  const access = await startUpdateServer(cleanup, 'router-auth');
  access.selectManifest('b');
  await page.goto(access.origin + '/ativar-conta#token=private-update-token');
  await expect(page.locator('#activation-form')).toBeVisible();
  await expect(page).toHaveURL(access.origin + '/ativar-conta');
  await expect(page.getByText('Uma nova versão do portal está disponível.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeDisabled();
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  const portal = await startUpdateServer(cleanup, 'portal-navigation');
  portal.selectManifest('b');
  const other = await context.newPage();
  await other.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Unavailable', 'SecurityError');
    };
  });
  await other.goto(portal.origin + '/calendarios');
  await expect(other.getByText('Uma nova versão do portal está disponível.')).toBeVisible();
  await other.evaluate(() => {
    document.documentElement.dataset.oldDocument = 'yes';
  });
  await other.locator('[data-page="institution"]').click();
  await expect(
    other.getByRole('heading', { name: 'Base institucional', exact: true }),
  ).toBeVisible();
  await expect(other.locator('html')).toHaveAttribute('data-old-document', 'yes');
});

test('CSS failure retries the original production URL before displaying the recovered screen', async ({
  page,
  cleanup,
}) => {
  const { origin } = await startUpdateServer(cleanup, 'portal-navigation');
  await page.goto(origin + '/calendarios');
  const failed: string[] = [];
  await page.route('**/assets/DocumentsPage-*.css', (route) => {
    failed.push(route.request().url());
    return route.abort('failed');
  });
  await page.locator('[data-page="institution"]').click();
  await expect(
    page.getByRole('heading', { name: 'Não foi possível abrir esta página' }),
  ).toBeVisible();
  await page.unroute('**/assets/DocumentsPage-*.css');
  const retry = page.waitForResponse((response) => response.url() === failed[0]);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  expect((await retry).status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Base institucional', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (href) => [...document.styleSheets].some((sheet) => sheet.href === href),
      failed[0],
    ),
  ).toBe(true);
});

test('upload and private submission remain protected after their forms unmount', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  server.selectManifest('b');
  await page.route('**/__synthetic-upload', (route) =>
    route.fulfill({ json: { storageId: 'synthetic-file' } }),
  );
  await page.goto(server.origin + '/documentos/novo');
  await page.locator('#document-year').fill('2027');
  await page.locator('#document-title').fill('Documento em envio');
  await page.locator('#document-source').fill('Fonte sintética');
  await page.locator('#document-file').setInputFiles({
    name: 'privado.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nDocumento sintético'),
  });
  await page.evaluate(() => {
    window.portalRouterTest.deferNextMutation = true;
  });
  await page.locator('#document-form button[type="submit"]').click();
  await expect
    .poll(() => page.evaluate(() => window.portalRouterTest.pendingMutation))
    .toBe('uploadDocument');
  await page.evaluate(() => {
    document.documentElement.dataset.oldDocument = 'yes';
  });
  await page.locator('[data-page="calendars"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeDisabled();
  await page.evaluate(() => window.portalRouterTest.resolvePendingMutation());
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  expect(await page.evaluate(() => Object.values(sessionStorage).join(''))).not.toContain(
    'privado.pdf',
  );
});

test('manual verification is cancelled by editing, and filters alone allow a later clean update', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  server.selectManifest('b');
  await page.goto(server.origin + '/calendarios/novo');
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  await page.evaluate(() => {
    document.documentElement.dataset.oldDocument = 'yes';
  });
  const { arrival, release } = server.delayNext('/version.json');
  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  await arrival;
  await page.locator('#calendar-courses').fill('Edição durante a consulta');
  release();
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeDisabled();
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  await page.locator('#calendar-courses').fill('');
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  // Modified menu clicks retain native browser behavior and never authorize an update.
  await page.locator('[data-page="institution"]').click({ modifiers: ['Control'] });
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  // Explicit manual action rechecks, then reloads this URL without another form submission.
  server.select('b');
  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-old-document');
  await expect(page.locator('#create-calendar')).toBeVisible();
});

test('stale evidence follows SPA and only a future gesture may replace the document', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  server.selectManifest('b');
  await page.clock.install();
  await page.goto(server.origin + '/calendarios');
  await expect(page.getByText('Uma nova versão do portal está disponível.')).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.oldDocument = 'yes';
  });
  await page.clock.fastForward(31_000);
  await page.locator('[data-page="institution"]').click();
  await expect(
    page.getByRole('heading', { name: 'Base institucional', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  await page.locator('#document-year-filter').fill('2027');
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  server.select('b');
  await page.locator('[data-page="calendars"]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-old-document');
});

test('back-forward cache restores the old clean document without unlocking a different attempt', async ({
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  const browser = await chromium.launch({
    channel: 'chromium',
    ignoreDefaultArgs: ['--disable-back-forward-cache'],
  });
  cleanup(() => browser.close());
  const context = await browser.newContext();
  cleanup(() => context.close());
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.addEventListener('pageshow', (event) => {
      document.documentElement.dataset.persisted = String(event.persisted);
    });
  });
  server.selectManifest('b');
  await page.goto(server.origin + '/calendarios');
  await expect(page.getByText('Uma nova versão do portal está disponível.')).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.oldDocument = 'yes';
  });
  server.select('b');
  await page.locator('[data-page="institution"]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-old-document');
  await page.goBack({ waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  await expect(page.locator('html')).toHaveAttribute('data-persisted', 'true');
  await expect(page.locator('.portal-update-scope')).toHaveJSProperty('inert', false);
  await page.locator('[data-page="institution-events"]').click();
  await expect(page).toHaveURL(server.origin + '/eventos-institucionais');
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('portal-update-attempts-v1') ?? '[]'),
    ),
  ).toHaveLength(1);
});

test('a private file form without a draft key keeps its detached submission protected', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  server.selectManifest('b');
  await page.route('**/__synthetic-upload', (route) =>
    route.fulfill({ json: { storageId: 'synthetic-file' } }),
  );
  await page.goto(server.origin + '/documentos?missing-document=1');
  const original = page.locator('[data-restore-document="document-0"]');
  const row = page.locator('#document-list li').filter({ hasText: 'Documento rascunho' });
  await row.getByText('Gerenciar', { exact: true }).click();
  await original.locator('input[type="file"]').setInputFiles({
    name: 'original-privado.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nArquivo sintético'),
  });
  await page.evaluate(() => {
    window.portalRouterTest.deferNextMutation = true;
  });
  await original.locator('button[type="submit"]').click();
  await expect
    .poll(() => page.evaluate(() => window.portalRouterTest.pendingMutation))
    .toBe('restoreDocumentOriginal');
  await page.locator('[data-page="calendars"]').click();
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeDisabled();
  const risk = await page.evaluate(() => window.updateDrafts.protection.getSnapshot());
  expect(risk).toContainEqual({ kind: 'operation', loss: true });
  expect(JSON.stringify(risk)).not.toContain('original-privado');
  await page.evaluate(() => window.portalRouterTest.resolvePendingMutation());
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
});

test('going offline after a recent observation never replaces the current document', async ({
  page,
  context,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  await page.clock.install();
  await page.goto(server.origin + '/calendarios');
  await page.locator('[data-page="institution"]').click();
  await expect(
    page.getByRole('heading', { name: 'Base institucional', exact: true }),
  ).toBeVisible();
  await page.locator('[data-page="calendars"]').click();
  server.selectManifest('b');
  await observeNewVersion(page);
  await page.evaluate(() => {
    document.documentElement.dataset.oldDocument = 'yes';
  });
  await context.setOffline(true);
  await page.locator('[data-page="institution"]').click();
  await expect(
    page.getByRole('heading', { name: 'Base institucional', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  expect(await page.evaluate(() => sessionStorage.getItem('portal-update-attempts-v1'))).toBeNull();
});

test('explicitly discarded editor fields cannot reappear as a detached draft', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup);
  await page.goto(server.origin + '/calendarios/synthetic-calendar/eventos?aba=eventos');
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Preenchimento a descartar');
  await page.locator('#close-event-panel').click();
  await page.locator('.portal-back').click();
  await page.getByRole('button', { name: 'Salvar e sair', exact: true }).click();
  await expect(page.locator('#calendar-list')).toBeVisible();
  expect(await page.evaluate(() => window.updateDrafts.protection.getSnapshot())).toEqual([]);
});

test('enabling the conclusion editor without changing content is not pending work', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  server.selectManifest('b');
  await page.goto(server.origin + '/revisoes/calendar-a');
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  await page.locator('#edit-conclusion').click();
  await expect(page.locator('#review-conclusion')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  await page.getByRole('link', { name: 'Voltar à lista de revisões', exact: true }).click();
  expect(await page.evaluate(() => window.updateDrafts.protection.getSnapshot())).toEqual([]);
});

test('a rendering failure in the event panel keeps its owners and fields alive', async ({
  page,
  cleanup,
}) => {
  const { origin } = await startUpdateServer(cleanup);
  await page.goto(origin + '/calendarios/synthetic-calendar/eventos?aba=eventos');
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Preenchimento conservado no painel');
  await page.evaluate(() => {
    window.updateOwners = { editor: window.updateEditor, drafts: window.updateDrafts };
    window.updatePanelFault = true;
  });
  await page.locator('#close-event-panel').click();
  await expect(
    page.getByRole('heading', { name: 'Não foi possível exibir esta parte do editor' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.updateOwners?.editor === window.updateEditor &&
        window.updateOwners?.drafts === window.updateDrafts,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    window.updatePanelFault = false;
  });
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.locator('#resume-event').click();
  await expect(page.locator('#event-name')).toHaveValue('Preenchimento conservado no painel');
});

test('a document that loads its origin after an update exposes manual recovery and stops automatic retries', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  server.selectManifest('b');
  await page.clock.install();
  await page.goto(server.origin + '/calendarios');
  await expect(page.getByText('Uma nova versão do portal está disponível.')).toBeVisible();
  // Keep HTML in A to model a stale document response while the public manifest reports B.
  await page.locator('[data-page="institution"]').click();
  await expect(page.getByText(/A atualização anterior voltou à versão de origem/)).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.returned = 'yes';
  });
  await page.clock.fastForward(600_001);
  await page.locator('[data-page="calendars"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-returned', 'yes');
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('portal-update-attempts-v1') ?? '[]'),
    ),
  ).toHaveLength(1);
});

test('Google login intentionally hands off the document without an extra beforeunload confirmation', async ({
  page,
  cleanup,
}) => {
  const { origin } = await startUpdateServer(cleanup, 'router-auth');
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.dismiss();
  });
  await page.goto(origin + '/?google=1');
  await page.locator('#google-login').click();
  await expect(page).toHaveURL(origin + '/oauth-complete');
  expect(dialogs).toEqual([]);
});

test('reopening a remote calendar keeps the document and a usable editor session without another confirmation', async ({
  page,
  cleanup,
}) => {
  const { origin } = await startUpdateServer(cleanup);
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.dismiss();
  });
  await page.goto(origin + '/calendarios/synthetic-calendar/editar');
  await page.locator('#week-evidence').fill('Preenchimento local a descartar');
  await page.evaluate(() => {
    document.documentElement.dataset.oldDocument = 'yes';
    window.updateOwners = { editor: window.updateEditor, drafts: window.updateDrafts };
    window.editorTest.record.version++;
    window.editorTest.record.state.weekEvidence = 'Decisão confirmada na outra sessão';
    return window.publishReviewerCalendar();
  });
  await page.getByRole('button', { name: 'Reabrir calendário atualizado' }).click();
  await page.getByRole('button', { name: 'Reabrir calendário', exact: true }).click();
  await expect(page.locator('#week-evidence')).toHaveValue('Decisão confirmada na outra sessão');
  expect(await page.evaluate(() => window.updateOwners?.editor === window.updateEditor)).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-old-document', 'yes');
  expect(dialogs).toEqual([]);
  await page.locator('#week-evidence').fill('Edição depois de reabrir');
  await page.locator('#editor-continue').click();
  await expect.poll(() => page.evaluate(() => window.editorTest.calls.saves)).toBe(1);
});

test('a removed A chunk after serving B keeps drafts editable until protected recovery loads B CSS', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  await page.clock.install();
  await page.goto(server.origin + '/calendarios/novo');
  await page.locator('#calendar-courses').fill('Rascunho da versão A');
  await page.evaluate(() => {
    window.updateOwners = { editor: window.updateEditor, drafts: window.updateDrafts };
  });
  server.select('b');
  await observeNewVersion(page);
  const missing = page.waitForResponse(
    (response) => response.url().includes('/assets/') && response.status() === 404,
  );
  await page.locator('[data-page="institution"]').click();
  await missing;
  await expect(
    page.getByRole('heading', { name: 'Não foi possível abrir esta página' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.updateOwners?.drafts === window.updateDrafts)).toBe(true);
  await page.locator('[data-page="calendars"]').click();
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await expect(page.locator('#calendar-courses')).toHaveValue('Rascunho da versão A');
  await page.locator('#calendar-courses').fill('');
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
  await page.locator('[data-page="institution"]').click();
  await expect(
    page.getByRole('heading', { name: 'Base institucional', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--update-fixture-build').trim(),
    ),
  ).toBe('b');
});

test('a successful A to B to A rollback does not report a failed update', async ({
  page,
  cleanup,
}) => {
  const server = await startUpdateServer(cleanup, 'portal-navigation');
  server.selectManifest('b');
  await page.clock.install();
  await page.goto(server.origin + '/calendarios');
  await expect(page.getByText('Uma nova versão do portal está disponível.')).toBeVisible();
  server.select('b');
  const arrivedB = page.waitForResponse((response) => response.url().endsWith('/version.json'));
  await page.locator('[data-page="institution"]').click();
  await arrivedB;
  await expect(
    page.getByRole('heading', { name: 'Base institucional', exact: true }),
  ).toBeVisible();
  server.selectManifest('a');
  await observeNewVersion(page);
  server.select('a');
  await page.locator('[data-page="calendars"]').click();
  await expect(page.locator('#calendar-list')).toBeVisible();
  await expect(page.getByText(/A atualização anterior voltou à versão de origem/)).toHaveCount(0);
  const attempts = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('portal-update-attempts-v1') ?? '[]'),
  );
  expect(attempts).toHaveLength(2);
  const a = await server.version('a');
  const b = await server.version('b');
  expect(attempts).toMatchObject([
    { from: a.buildId, target: b.buildId },
    { from: b.buildId, target: a.buildId },
  ]);
});

test('choosing Google with local credentials filled preserves the existing departure protection', async ({
  page,
  cleanup,
}) => {
  const { origin } = await startUpdateServer(cleanup, 'router-auth');
  await page.goto(origin + '/?google=1');
  await page.locator('#email').fill('acesso-local@example.invalid');
  const dialogs: string[] = [];
  page.once('dialog', (dialog) => {
    dialogs.push(dialog.type());
    void dialog.dismiss();
  });
  await page.locator('#google-login').click({ noWaitAfter: true });
  await expect.poll(() => dialogs).toEqual(['beforeunload']);
  await expect(page.locator('#google-login')).toBeEnabled();
  await expect(page.locator('#email')).toHaveValue('acesso-local@example.invalid');
});
