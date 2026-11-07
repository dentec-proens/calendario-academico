import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-client.ts';
import type {} from '../fixtures/portal-router-client.ts';

test('each collection form supports a direct URL and reload', async ({ page, fixtureServer }) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  const forms = [
    ['/calendarios/novo', '#create-calendar'],
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

test('URL, browser history and collection drafts stay synchronized', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/calendarios');
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await expect(page).toHaveURL(origin + '/calendarios/novo');
  await page.locator('#calendar-offer-subsequente').check();
  await page.goBack();
  await expect(page).toHaveURL(origin + '/calendarios');
  await expect(page.locator('#calendar-list')).toBeVisible();
  await expect(page.locator('#create-calendar')).toBeHidden();
  await page.goForward();
  await expect(page.locator('#create-calendar')).toBeVisible();
  await expect(page.locator('#calendar-offer-subsequente')).toBeChecked();
  await page.locator('[data-page="rules"]').click();
  await expect(page).toHaveURL(origin + '/regras');
  await page.goBack();
  await expect(page).toHaveURL(origin + '/calendarios/novo');
  await expect(page.locator('#calendar-offer-subsequente')).toBeChecked();
  await page.locator('#calendars').getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page).toHaveURL(origin + '/calendarios');
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.getByRole('button', { name: 'Novo calendário' }).click();
  await expect(page.locator('#calendar-offer-subsequente')).toBeChecked();
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
  await page.locator('[data-page="rules"]').click();
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
  const documents = page.locator('[data-page="rules"]');
  await expect(documents).toHaveJSProperty('tagName', 'A');
  await expect(documents).toHaveAttribute('href', '/regras');
  const [newTab] = await Promise.all([
    context.waitForEvent('page'),
    documents.click({ modifiers: ['ControlOrMeta'] }),
  ]);
  await expect(newTab).toHaveURL(origin + '/regras');
  await expect(newTab.locator('.rules-page')).toBeVisible();
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
  await page.locator('[data-page="rules"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(origin + '/regras');
  await expect(page.locator('.portal-sidebar')).toBeHidden();
  await expect(page.locator('#panel-title')).toBeFocused();
  await expect(page.locator('.rules-page')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test('the review trail returns to the tab the parecer was opened from', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  const filters = 'campus=campus-a&situacao=em_revisao';
  await page.goto(`${origin}/revisoes?queue-status=em_revisao&${filters}`);
  await expect(page.getByRole('tab', { name: 'Em análise' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.locator('[data-open-review="calendar-a"]').click();
  await expect(page).toHaveURL(`${origin}/revisoes/calendar-a?${filters}`);
  await expect(page.locator('#review-content')).toBeVisible();
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').click();
  await expect(page).toHaveURL(`${origin}/revisoes?${filters}`);
  await expect(page.getByRole('tab', { name: 'Em análise' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('#campus-filter')).toHaveValue('campus-a');
  await expect(page.locator('[data-open-review="calendar-a"]')).toBeVisible();
});

test('the review queue keeps its tab in the URL and falls back from a situation it omits', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  const first = page.getByRole('tab', { name: 'Aguardando análise' });
  await page.goto(origin + '/revisoes?situacao=rascunho');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-open-review]').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Devolvidos' }).click();
  await expect(page).toHaveURL(origin + '/revisoes?situacao=devolvido');
  await expect(page.locator('#review-message')).toContainText('Nenhum calendário devolvido');
  await first.click();
  await expect(page).toHaveURL(origin + '/revisoes');
});

test('the review queue keeps the holder filter in the URL for the tabs that have one', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes');
  await page.locator('#review-holder-filter').selectOption('meus');
  await expect(page).toHaveURL(origin + '/revisoes?responsavel=meus');
  await page.getByRole('tab', { name: 'Em análise' }).click();
  await expect(page).toHaveURL(origin + '/revisoes?situacao=em_revisao&responsavel=meus');
  await expect(page.locator('#review-holder-filter')).toHaveValue('meus');
  await page.getByRole('tab', { name: 'Vigentes' }).click();
  await expect(page).toHaveURL(origin + '/revisoes?situacao=vigente');
  await expect(page.getByRole('combobox', { name: 'Filtrar por campus' })).toBeVisible();
  await expect(page.locator('#review-holder-filter')).toHaveCount(0);
});

test('the arrows move through the review tabs even when pressed quickly', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes');
  await page.getByRole('tab', { name: 'Aguardando análise' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Concluídos' })).toBeFocused();
  await expect(page).toHaveURL(origin + '/revisoes?situacao=revisado');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Em análise' })).toBeFocused();
});

test('the review tabs bring their own styles on direct entry and from another page', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes');
  await expect(page.locator('.review-tabs')).toHaveCSS('display', 'flex');
  await page.goto(origin + '/calendarios');
  await page.getByRole('link', { name: 'Revisões e pareceres' }).click();
  await expect(page.locator('.review-tabs')).toHaveCSS('display', 'flex');
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
  await page.locator('[data-page="rules"]').click();
  await expect(page.locator('.rules-page')).toBeVisible();
  await page.evaluate(() => window.portalRouterTest.resolvePendingReview());
  await expect(page).toHaveURL(origin + '/regras');
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
  await page.goto(origin + '/eventos-institucionais/synthetic-event/editar?role=CAMPUS');
  await expect(page.locator('#catalogue-list')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/eventos-institucionais');
  await expect(page.locator('#catalogue-form')).toHaveCount(0);
  await page.goto(origin + '/calendarios/novo?role=PARECERISTA');
  await expect(page.locator('#review-panel')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/revisoes');
  await expect(page.locator('#create-calendar')).toHaveCount(0);
  await page.goto(origin + '/calendarios/calendar-a/secao-inexistente');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  // A calendar the profile cannot open (removed or of another campus) is not a failure.
  await page.goto(origin + '/calendarios/calendario-de-outro-campus/pendencias');
  await expect(page.getByRole('heading', { name: 'Registro indisponível' })).toBeVisible();
  await expect(page.getByText('Ocorreu um erro nesta tela')).toHaveCount(0);
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
    ['ferias', '#vacation-add-teacher', '#saturday-form'],
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
  await page.goto(editor + 'atividades');
  await expect(page.locator('#event-list')).toBeVisible();
  await page.reload();
  await expect(page.locator('#event-list')).toBeVisible();
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Evento ainda não aplicado');
  await page.locator('#close-event-panel').click();
  await page.locator('[data-view="periods"]').click();
  await expect(page).toHaveURL(editor + 'periodos');
  await expect(page.locator('#periods')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(editor + 'atividades');
  await expect(page.locator('#event-name')).toHaveValue('Evento ainda não aplicado');
  await page.goForward();
  await expect(page.locator('#periods')).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});

test('the campus filter of the review queue lives in the URL with the selected tab', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes');
  const row = page.locator('[data-open-review="calendar-a"]');
  await expect(row).toBeVisible();
  await page.locator('#campus-filter').selectOption('campus-a');
  await expect(page).toHaveURL(origin + '/revisoes?campus=campus-a');
  await expect(row).toBeVisible();
  await page.getByRole('tab', { name: 'Devolvidos' }).click();
  await expect(page).toHaveURL(origin + '/revisoes?campus=campus-a&situacao=devolvido');
  await expect(page.locator('#review-message')).toContainText(
    'Nenhum calendário devolvido neste campus no momento.',
  );
  await page.locator('#campus-filter').selectOption('');
  await expect(page).toHaveURL(origin + '/revisoes?situacao=devolvido');
  await expect(page.locator('#review-message')).toContainText(
    'Nenhum calendário devolvido no momento.',
  );
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Devolvidos' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goto(origin + '/revisoes?campus=inexistente');
  await expect(page.locator('#campus-filter')).toHaveValue('');
  await expect(row).toBeVisible();
});

test('the calendar list leads reviewers to the parecer, past the draft stage', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  const parecer = page.getByRole('link', { name: 'Abrir parecer' });
  await page.goto(origin + '/calendarios?calendar-status=vigente&queue-status=vigente');
  await expect(parecer).toHaveAttribute('href', '/revisoes/calendar-a?situacao=vigente');
  await parecer.click();
  await expect(page.locator('#review-content')).toBeVisible();
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').click();
  await expect(page).toHaveURL(origin + '/revisoes?situacao=vigente');
  await expect(page.getByRole('tab', { name: 'Vigentes' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const list = page.locator('#calendar-list');
  await page.goto(origin + '/calendarios');
  await expect(list).toContainText('Calendário de teste');
  await expect(parecer, 'a draft has no parecer').toHaveCount(0);
  await page.goto(origin + '/calendarios?calendar-status=vigente&role=CAMPUS');
  await expect(list).toContainText('Calendário de teste');
  await expect(parecer, 'the campus does not read pareceres').toHaveCount(0);
});

test('the review queue opens the calendar in another tab, keeping the list', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/revisoes');
  const link = page.locator('[data-open-calendar="calendar-a"]');
  await expect(link).toHaveAccessibleName('Abrir calendário em outra aba');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', /^\/calendarios\/calendar-a\//);
});
