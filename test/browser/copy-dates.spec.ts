import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-client.ts';
import type {} from '../fixtures/portal-router-client.ts';

const sourceDate = (id: string, changes: Record<string, unknown> = {}) => ({
  id,
  name: id,
  start: '2027-09-20',
  end: '2027-09-20',
  effect: 'exclude',
  category: 'feriado',
  offers: ['integrado', 'subsequente'],
  ...changes,
});

/** A calendar of the same campus and year, with one date of each kind the list tells apart. */
async function openCopyScreen(page: Page, origin: string) {
  await page.goto(origin + '/calendarios/synthetic-calendar/atividades');
  await expect(page.locator('#event-list')).toBeVisible();
  await page.evaluate(
    (events) => {
      const { record } = window.editorTest;
      window.editorTest.addCopySource({
        id: 'source-calendar',
        name: 'Calendário de origem',
        status: 'vigente',
        offerKinds: ['integrado', 'subsequente'],
        state: {
          ...record.state,
          offers: [
            ...record.state.offers,
            {
              id: 'subsequente',
              kind: 'subsequente',
              delivery: 'presencial',
              organization: 'anual',
            },
          ],
          teacherVacations: { firstStart: '2027-01-03', firstEnd: '2027-02-01' },
          events: events,
        },
      } as never);
    },
    [
      sourceDate('Aniversário do município'),
      sourceDate('Recesso do subsequente', { offers: ['subsequente'] }),
      sourceDate('Semana da Ética', {
        activity: { activityId: 'ethics-week' },
        start: '2027-05-03',
        end: '2027-05-07',
        effect: 'note',
        category: 'evento',
      }),
      sourceDate('Sábado letivo', {
        start: '2027-03-13',
        end: '2027-03-13',
        effect: 'include',
        category: 'sabado',
      }),
    ],
  );
  await page.locator('#copy-dates').click();
  await expect(page).toHaveURL(/\/copiar-datas/);
  await page.locator('#copy-dates-source').selectOption('source-calendar');
  await expect(page).toHaveURL(/origem=source-calendar/);
}

const row = (page: Page, id: string) => page.locator(`[data-copy-date="${id}"]`);

for (const width of [1440, 390]) {
  test(`the person chooses the dates and can undo the copy at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('editor')).origin;
    await openCopyScreen(page, origin);

    // A date of every offer of the source starts marked, and teacher vacations are one choice.
    const shared = page.locator('[data-copy-group="shared"]');
    await expect(shared.locator('[data-copy-date]')).toHaveCount(2);
    await expect(row(page, 'Aniversário do município').locator('input')).toBeChecked();
    await expect(row(page, 'teacher-vacations').locator('input')).toBeChecked();
    // The rest waits for the person, saying why.
    await expect(row(page, 'Recesso do subsequente').locator('input')).not.toBeChecked();
    await expect(row(page, 'Recesso do subsequente')).toContainText('só para Técnico subsequente');
    await expect(row(page, 'Semana da Ética').locator('input')).not.toBeChecked();
    await expect(row(page, 'Semana da Ética')).toContainText('Atividade:');
    await expect(row(page, 'Sábado letivo').locator('input')).toBeDisabled();
    await expect(row(page, 'Sábado letivo')).toContainText('Fora dos períodos');
    await expect(row(page, 'Sábado letivo').getByRole('link')).toHaveText(
      'Abrir Organização por oferta',
    );
    await expect(page.locator('#copy-dates-apply')).toHaveText('Aplicar 2 datas');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    // The keyboard reaches the choice; the count follows it.
    await row(page, 'Semana da Ética').locator('input').focus();
    await page.keyboard.press('Space');
    await expect(row(page, 'Semana da Ética').locator('input')).toBeChecked();
    await expect(page.locator('#copy-dates-apply')).toHaveText('Aplicar 3 datas');
    await page.locator('[data-copy-group="shared"] button').click();
    await expect(page.locator('#copy-dates-apply')).toHaveText('Aplicar 1 data');
    await row(page, 'Aniversário do município').locator('label').click();
    await expect(page.locator('#copy-dates-apply')).toHaveText('Aplicar 2 datas');

    const before = await page.evaluate(() => window.editorTest.calls.saves);
    await page.locator('#copy-dates-apply').click();
    await expect(page).toHaveURL(/\/atividades/);
    expect(new URL(page.url()).search).not.toContain('origem');
    const notice = page.locator('[data-undo-notice]');
    await expect(notice).toContainText('2 datas copiadas');
    await expect
      .poll(() => page.evaluate(() => window.editorTest.calls.saves))
      .toBeGreaterThan(before);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.editorTest.record.state.events.slice(2).map(({ name, offers, activity }) => ({
            name,
            offers,
            linked: Boolean(activity),
          })),
        ),
      )
      .toEqual([
        { name: 'Aniversário do município', offers: ['integrado'], linked: false },
        { name: 'Semana da Ética', offers: ['integrado'], linked: true },
      ]);
    await notice.locator('[data-undo]').click();
    await expect(page.getByText('Cópia desfeita.')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.editorTest.record.state.events.length))
      .toBe(2);
  });
}

test('reopening the screen lists only what this calendar does not have', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await openCopyScreen(page, origin);
  await page.locator('#copy-dates-apply').click();
  await expect(page).toHaveURL(/\/atividades/);
  await page.locator('#copy-dates').click();
  await page.locator('#copy-dates-source').selectOption('source-calendar');
  await expect(row(page, 'Recesso do subsequente')).toBeVisible();
  await expect(page.locator('[data-copy-group="shared"]')).toHaveCount(0);
  await expect(page.locator('#copy-dates-help')).toContainText('2 datas da origem já estão');
});

for (const width of [1440, 390]) {
  test(`a new calendar starts from a copy and opens the copy screen at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/calendarios');
    await expect(page.locator('#new-calendar-from-copy')).toBeVisible();
    await page.locator('#new-calendar-from-copy').click();
    await expect(page).toHaveURL(/\/calendarios\/nova-copia/);
    await expect(page.locator('#create-calendar-from-copy')).toBeVisible();
    // The source settles campus and year; without it nothing is created.
    await page.locator('#calendar-offer-graduacao').check();
    await page.locator('#calendar-offer-graduacao-organization [data-choice="semestral"]').click();
    const source = page.locator('#calendar-source');
    const sourceId = await source.locator('option').nth(1).getAttribute('value');
    await source.selectOption(sourceId!);
    await page.locator('#create-calendar-from-copy button[type="submit"]').click();
    await expect(page).toHaveURL(
      new RegExp(`/calendarios/calendar-new/copiar-datas\\?.*origem=${sourceId}`),
    );
    const mutations = await page.evaluate(() => window.portalRouterTest.mutations);
    expect(mutations.find(({ name }) => name === 'calendars:createCalendar')?.args).toMatchObject({
      body: { offers: [{ kind: 'graduacao', organization: 'semestral' }] },
    });
  });
}

test('a calendar alone in its campus and year says there is nothing to copy', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/copiar-datas?origem=gone');
  await expect(page.locator('#copy-dates-no-source')).toContainText('Não há outro calendário');
});
