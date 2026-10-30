import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-client.ts';
import type {} from '../fixtures/portal-router-client.ts';

test('each collection form supports a direct URL and reload', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  const forms = [
    ['/calendarios/novo', '#create-calendar'],
    ['/documentos/novo', '#document-form'],
    ['/eventos-institucionais/novo', '#catalogue-form'],
    ['/campi/novo', '#campus-form'],
    ['/contas/nova', '#user-form'],
  ];
  for (const [path, form] of forms) {
    await page.goto(origin + path);
    await expect(page.locator(form), `${path} opens its form`).toBeVisible();
    await page.reload();
    await expect(page.locator(form), `${path} reloads the same form`).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  }
});

test('a trailing slash resolves to the same canonical form and review', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/calendarios/novo/');
  await expect(page).toHaveURL(origin + '/calendarios/novo');
  await expect(page.locator('#create-calendar')).toBeVisible();
  await page.goto(origin + '/revisoes/calendar-a/');
  await expect(page).toHaveURL(origin + '/revisoes/calendar-a');
  await expect(page.locator('#review-content')).toBeVisible();
});

test('a delayed campus creation preserves the section selected during the request', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/campi/novo');
  await page.locator('#campus-name').fill('Campus cadastrado de forma assíncrona');
  await page.evaluate(() => {
    window.portalRouterTest.deferNextMutation = true;
  });
  await page.locator('#campus-form button[type="submit"]').click();
  await expect
    .poll(() => page.evaluate(() => window.portalRouterTest.pendingMutation))
    .toBe('createCampus');
  await page.locator('[data-page="calendars"]').click();
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.evaluate(() => window.portalRouterTest.resolvePendingMutation());
  await expect
    .poll(() => page.evaluate(() => window.portalRouterTest.completedMutation))
    .toBe('createCampus');
  await expect(page).toHaveURL(origin + '/calendarios');
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.locator('[data-page="campuses"]').click();
  await page.getByRole('button', { name: 'Cadastrar campus', exact: true }).click();
  await expect(page.locator('#campus-name')).toHaveValue('');
});

test('document upload updates its list filter atomically and cannot navigate away from another section', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.route('**/__synthetic-upload', (route) =>
    route.fulfill({ json: { storageId: 'synthetic-file' } }),
  );
  const fillUpload = async () => {
    await page.locator('#document-year').fill('2029');
    await page.locator('#document-title').fill('Norma de teste');
    await page.locator('#document-source').fill('Resolução sintética');
    await page.locator('#document-file').setInputFiles({
      name: 'norma.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\nDocumento sintético'),
    });
  };
  await page.goto(origin + '/documentos/novo?situacao=vigente');
  await fillUpload();
  await page.locator('#document-form button[type="submit"]').click();
  await expect(page).toHaveURL(origin + '/documentos?ano=2029');
  await expect(page.locator('#document-message')).toContainText('Arquivo preservado como rascunho');
  await expect(page.locator('#document-year-filter')).toHaveValue('2029');
  await expect(page.locator('#document-status-filter')).toHaveValue('');

  await page.getByRole('button', { name: 'Adicionar documento' }).click();
  await fillUpload();
  await page.evaluate(() => {
    window.portalRouterTest.deferNextMutation = true;
  });
  await page.locator('#document-form button[type="submit"]').click();
  await expect
    .poll(() => page.evaluate(() => window.portalRouterTest.pendingMutation))
    .toBe('uploadDocument');
  await page.locator('[data-page="calendars"]').click();
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.evaluate(() => window.portalRouterTest.resolvePendingMutation());
  await expect.poll(() => page.evaluate(() => window.portalRouterTest.pendingMutation)).toBeNull();
  await expect
    .poll(() => page.evaluate(() => window.portalRouterTest.completedMutation))
    .toBe('uploadDocument');
  await expect(page.locator('#document-form')).toHaveCount(0);
  await expect(page).toHaveURL(origin + '/calendarios');
  await expect(page.locator('#calendar-list')).toBeVisible();
});

test('URL, browser history and collection drafts stay synchronized', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/calendarios');
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await expect(page).toHaveURL(origin + '/calendarios/novo');
  await page.locator('#calendar-courses').fill('Curso ainda não enviado');
  await page.goBack();
  await expect(page).toHaveURL(origin + '/calendarios');
  await expect(page.locator('#calendar-list')).toBeVisible();
  await expect(page.locator('#create-calendar')).toBeHidden();
  await page.goForward();
  await expect(page.locator('#create-calendar')).toBeVisible();
  await expect(page.locator('#calendar-courses')).toHaveValue('Curso ainda não enviado');
  await page.locator('[data-page="institution"]').click();
  await expect(page).toHaveURL(origin + '/documentos');
  await page.goBack();
  await expect(page).toHaveURL(origin + '/calendarios/novo');
  await expect(page.locator('#calendar-courses')).toHaveValue('Curso ainda não enviado');
  await page.locator('#calendars').getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page).toHaveURL(origin + '/calendarios');
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await expect(page.locator('#calendar-courses')).toHaveValue('Curso ainda não enviado');
});

test('institutional event editing has a stable record URL and reload restores the saved event', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  const editPath = '/eventos-institucionais/synthetic-event/editar';
  await page.goto(origin + '/eventos-institucionais');
  await page.locator('[data-edit="synthetic-event"]').click();
  await expect(page).toHaveURL(origin + editPath);
  await expect(page.locator('#catalogue-name')).toHaveValue('Evento institucional de teste');
  await page.reload();
  await expect(page).toHaveURL(origin + editPath);
  await expect(page.locator('#catalogue-name')).toHaveValue('Evento institucional de teste');
  await page.locator('#catalogue-name').fill('Edição ainda não enviada');
  await page.locator('[data-page="institution"]').click();
  await page.goBack();
  await expect(page.locator('#catalogue-name')).toHaveValue('Edição ainda não enviada');
  await page.locator('#cancel-catalogue').click();
  await expect(page).toHaveURL(origin + '/eventos-institucionais');
  await page.locator('[data-edit="synthetic-event"]').click();
  await expect(page).toHaveURL(origin + editPath);
  await expect(page.locator('#catalogue-id')).toHaveValue('synthetic-event');
  await expect(page.locator('#catalogue-name')).toHaveValue('Evento institucional de teste');
});

test('section and record links keep native browser shortcuts and canonical URLs', async ({
  page,
  context,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/calendarios');
  const documents = page.locator('[data-page="institution"]');
  await expect(documents).toHaveJSProperty('tagName', 'A');
  await expect(documents).toHaveAttribute('href', '/documentos');
  const [newTab] = await Promise.all([
    context.waitForEvent('page'),
    documents.click({ modifiers: ['ControlOrMeta'] }),
  ]);
  await expect(newTab).toHaveURL(origin + '/documentos');
  await expect(newTab.locator('#document-list')).toBeVisible();
  await expect(page).toHaveURL(origin + '/calendarios');
  await newTab.close();
  await expect(page.locator('#calendar-list a').first()).toHaveAttribute(
    'href',
    '/calendarios/calendar-a/editar',
  );
  await expect(page.getByRole('link', { name: 'Usar calendário anterior' })).toHaveCount(0);
});

test('mobile keyboard navigation changes route, closes the menu and focuses the heading', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/calendarios');
  await page.locator('.sidebar-toggle').click();
  await page.locator('[data-page="institution"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(origin + '/documentos');
  await expect(page.locator('.portal-sidebar')).toBeHidden();
  await expect(page.locator('#panel-title')).toBeFocused();
  await expect(page.locator('#document-list')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test('review analysis has a direct URL and browser back returns to its list', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes');
  await page.locator('[data-open-review]').first().click();
  await expect(page).toHaveURL(origin + '/revisoes/calendar-a');
  await expect(page.locator('#review-content')).toBeVisible();
  await page.reload();
  await expect(page.locator('#review-content')).toBeVisible();
  await expect(page.locator('#review-heading')).toContainText('Calendário de teste');
  await page.goBack();
  await expect(page).toHaveURL(origin + '/revisoes');
  await expect(page.locator('#review-content')).toBeHidden();
  await page.goForward();
  await expect(page.locator('#review-content')).toBeVisible();
});

test('review deep links work beyond the first result page and missing records never show another calendar', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes/calendar-offpage');
  await expect(page.locator('#review-heading')).toContainText('Calendário calendar-offpage');
  await expect(page.locator('#review-calendars')).toHaveCount(0);
  await page.goto(origin + '/revisoes/inexistente');
  await expect(page.locator('#review-message')).toContainText('Calendário não encontrado');
  await expect(page.locator('#review-content')).toBeHidden();
});

test('review drafts survive browser navigation between records', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes/calendar-b?multiple-reviews=1');
  await expect(page.locator('#review-heading')).toContainText('Calendário calendar-b');
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').click();
  await page.locator('[data-open-review="calendar-a"]').click();
  await expect(page.locator('#review-heading')).toContainText('Calendário de teste');
  await page.locator('#review-process').fill('23354.000001/2027-01');
  await page.goBack();
  await page.goBack();
  await expect(page.locator('#review-heading')).toContainText('Calendário calendar-b');
  await page.locator('#review-process').fill('23354.000002/2027-02');
  await page.goForward();
  await page.goForward();
  await expect(page.locator('#review-heading')).toContainText('Calendário de teste');
  await expect(page.locator('#review-process')).toHaveValue('23354.000001/2027-01');
  await page.goBack();
  await page.goBack();
  await expect(page.locator('#review-process')).toHaveValue('23354.000002/2027-02');
});

test('a removed review record disappears without opening an unrelated analysis', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  for (const id of ['calendar-a', 'calendar-offpage']) {
    await page.goto(origin + '/revisoes/' + id);
    await expect(page.locator('#review-content')).toBeVisible();
    await page.evaluate((calendarId) => window.portalRouterTest.removeCalendar(calendarId), id);
    await expect(page.locator('#review-content')).toBeHidden();
    await expect(page.locator('#review-message')).toContainText('deixou de estar disponível');
    await expect(page.locator('#workspace')).toBeVisible();
  }
});

test('an opened analysis names the calendar and links back to the review list', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes/calendar-a?multiple-reviews=1');
  await expect(page.locator('#review-content')).toBeVisible();
  await expect(page.locator('#panel-title')).toHaveText('Parecer do calendário');
  await expect(page).toHaveTitle('Parecer do calendário · PROENS');
  await expect(page.getByRole('heading', { level: 2, name: /Calendário de teste/ })).toBeVisible();
  await expect(page.locator('#review-calendars')).toHaveCount(0);
  await expect(page.locator('[data-page="review-panel"]')).toHaveAttribute('aria-current', 'page');
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').click();
  await expect(page).toHaveURL(origin + '/revisoes');
  await expect(page.locator('#panel-title')).toHaveText('Revisões e pareceres');
  await expect(page.getByRole('navigation', { name: 'Trilha de navegação' })).toHaveCount(0);
  await expect(page.locator('[data-open-review]').first()).toBeVisible();
});

test('a delayed review response cannot reopen a section the user already left', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes');
  await expect(page.locator('[data-open-review]').first()).toBeVisible();
  await page.evaluate(() => {
    window.portalRouterTest.deferNextReview = true;
  });
  await page.locator('[data-open-review]').first().click();
  await expect
    .poll(() => page.evaluate(() => window.portalRouterTest.pendingReviewId))
    .toBe('calendar-a');
  await page.locator('[data-page="institution"]').click();
  await expect(page.locator('#document-list')).toBeVisible();
  await page.evaluate(() => window.portalRouterTest.resolvePendingReview());
  await expect(page).toHaveURL(origin + '/documentos');
  await expect(page.locator('#review-content')).toBeHidden();
});

test('direct restricted URLs respect the current role and unknown URLs show a recovery link', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  for (const path of ['/contas/nova', '/campi/novo', '/revisoes/calendar-a']) {
    await page.goto(origin + path + '?role=CAMPUS');
    await expect(page.locator('#calendar-list')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/calendarios');
    await expect(page.locator('#user-form, #campus-form, #review-content')).toHaveCount(0);
  }
  for (const path of ['/documentos/novo', '/eventos-institucionais/synthetic-event/editar']) {
    await page.goto(origin + path + '?role=CAMPUS');
    const destination = path.startsWith('/documentos') ? '/documentos' : '/eventos-institucionais';
    await expect(
      page.locator(destination === '/documentos' ? '#document-list' : '#catalogue-list'),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(destination);
    await expect(page.locator('#document-form, #catalogue-form')).toHaveCount(0);
  }
  await page.goto(origin + '/calendarios/novo?role=PARECERISTA');
  await expect(page.locator('#review-panel')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/revisoes');
  await expect(page.locator('#create-calendar')).toHaveCount(0);
  await page.goto(origin + '/calendarios/calendar-a/secao-inexistente');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Ir para a página inicial' }).click();
  await expect(page.locator('#calendar-list')).toBeVisible();
});

test('focused assessment and vacation steps support direct URLs and reload', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  for (const [segment, visible, absent] of [
    ['avaliacoes', '#assessment-area', '#saturday-form'],
    ['ferias', '#vacation-form', '#saturday-form'],
  ]) {
    const url = origin + '/calendarios/synthetic-calendar/' + segment;
    await page.goto(url);
    await expect(page.locator(visible)).toBeVisible();
    await expect(page.locator(absent)).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(
      segment === 'avaliacoes'
        ? origin + '/calendarios/synthetic-calendar/periodos#assessment-area'
        : url,
    );
    await expect(page.locator(visible)).toBeVisible();
    await expect(page.locator(absent)).toHaveCount(0);
  }
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});

test('editor sections support direct URLs, reload and Back/Forward without discarding a draft', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  const editor = origin + '/calendarios/synthetic-calendar/';
  await page.goto(editor + 'eventos?aba=eventos');
  await expect(page.locator('#event-list')).toBeVisible();
  await page.reload();
  await expect(page.locator('#event-list')).toBeVisible();
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Evento ainda não aplicado');
  await page.locator('#close-event-panel').click();
  await page.locator('[data-view="periods"]').click();
  // Step links keep the query, so returning to step 6 shows the same tab.
  await expect(page).toHaveURL(editor + 'periodos?aba=eventos');
  await expect(page.locator('#periods')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(editor + 'eventos?aba=eventos');
  await expect(page.locator('#event-name')).toHaveValue('Evento ainda não aplicado');
  await page.goForward();
  await expect(page.locator('#periods')).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});
