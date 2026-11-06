import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import type {} from '../fixtures/review-ui-client.ts';
import type {} from '../fixtures/editor-client.ts';

const viewports = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
] as const;

async function assertNoOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
}

async function openReview(page: Page, origin: string) {
  await page.goto(origin + '/revisoes/synthetic-review');
  await expect(page.locator('#review-items > li').first()).toBeVisible();
}

async function assess(page: Page, id: string, status: string, notes?: string) {
  const criterion = page.locator(`#review-items > li:has([data-fields="${id}"])`);
  await criterion.locator(`[data-choice="${status}"]`).click();
  if (notes) await criterion.locator('textarea').fill(notes);
}

const returnedLastReturn = {
  submissionId: 'synthetic-round-1',
  sequence: 1,
  at: '2026-10-22T15:00:00Z',
  note: 'Ajustar as datas apontadas.',
  returnedCriteria: [
    { criterionId: 'VI', title: 'Aproveitamento e certificação', note: 'Falta o prazo.' },
    { criterionId: 'annual', title: 'Dias letivos anuais', note: 'Faltam 12 dias.' },
  ],
};

for (const [name, width, height] of viewports) {
  test(`the return note is filled from the saved parecer at ${name}`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height });
    await openReview(page, new URL(await fixtureServer('review')).origin);
    await assess(page, 'VI', 'NAO_ATENDIDO', 'Falta o prazo de aproveitamento.');
    await assess(page, 'minutes', 'NAO_ATENDIDO');
    await assess(page, 'annual', 'ATENDIDO');
    await page.locator('button[form="review-form"]').click();
    await expect(page.locator('#review-message')).toContainText('Parecer salvo');

    await page.locator('[data-lifecycle-action="return"]').click();
    const note = page.locator('#lifecycle-return-note');
    await note.fill('Reveja o calendário.');
    const fill = page.getByRole('button', { name: 'Preencher com os critérios não atendidos' });
    await fill.click();
    const filled =
      'Reveja o calendário.\n\nCritérios não atendidos:\n- Atas do CGPC e do Codic\n- Aproveitamento e certificação: Falta o prazo de aproveitamento.';
    await expect(note).toHaveValue(filled);
    await fill.click();
    await expect(note).toHaveValue(filled);
    await expect(page.locator('#lifecycle-fill-outcome')).toContainText('já estão na nota');
    // The text stays editable before it goes.
    await note.fill(`${filled}\nAté sexta-feira.`);
    await assertNoOverflow(page);
    await page.locator('.lifecycle-form button[type="submit"]').click();
    await expect(page.locator('#review-locked-notice')).toBeVisible();
    // The client sends only the note; the server reads the criteria from the saved parecer.
    const transition = await page.evaluate(() => window.reviewUiTest.calls.lastTransition);
    expect(transition).toMatchObject({ action: 'return', note: `${filled}\nAté sexta-feira.` });
    expect(Object.keys(transition!)).not.toContain('returnedCriteria');
  });
}

test('a note that cannot hold every criterion says which ones stayed out', async ({
  page,
  fixtureServer,
}) => {
  await openReview(page, new URL(await fixtureServer('review')).origin);
  for (const id of ['VI', 'VII', 'VIII']) await assess(page, id, 'NAO_ATENDIDO', 'x'.repeat(1900));
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('#review-message')).toContainText('Parecer salvo');
  await page.locator('[data-lifecycle-action="return"]').click();
  await page.getByRole('button', { name: 'Preencher com os critérios não atendidos' }).click();
  const value = await page.locator('#lifecycle-return-note').inputValue();
  expect(value.length).toBeLessThanOrEqual(4000);
  expect(value).toContain('Trancamento e cancelamento');
  await expect(page.locator('#lifecycle-fill-outcome')).toContainText(
    'Ficaram de fora Editais de transferência e reingresso',
  );
});

test('with nothing unmet in the saved parecer the fill says why it is unavailable', async ({
  page,
  fixtureServer,
}) => {
  await openReview(page, new URL(await fixtureServer('review')).origin);
  await page.locator('[data-lifecycle-action="return"]').click();
  const fill = page.getByRole('button', { name: 'Preencher com os critérios não atendidos' });
  await expect(fill).toBeDisabled();
  await expect(fill).toHaveAttribute('aria-describedby', 'lifecycle-fill-unavailable');
  await expect(page.locator('#lifecycle-fill-unavailable')).toContainText('Nenhum critério');
});

for (const [name, width, height] of viewports) {
  test(`the index counts each situation and filters the list by keyboard at ${name}`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height });
    await openReview(page, new URL(await fixtureServer('review')).origin);
    const items = page.locator('#review-items > li');
    const total = await items.count();
    const index = page.getByRole('group', { name: 'Critérios por situação' });
    await expect(index.getByRole('button', { name: `Todos ${total}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await assess(page, 'VI', 'NAO_ATENDIDO');
    await assess(page, 'minutes', 'NAO_APLICAVEL');
    await assess(page, 'annual', 'ATENDIDO');
    await expect(index.getByRole('button', { name: `A avaliar ${total - 3}` })).toBeVisible();
    await expect(index.getByRole('button', { name: 'Atendido 1', exact: true })).toBeVisible();
    await expect(index.getByRole('button', { name: 'Não aplicável 1' })).toBeVisible();
    await assertNoOverflow(page);

    const unmet = index.getByRole('button', { name: 'Não atendido 1' });
    await unmet.focus();
    // Focus is visible on the control that a keyboard reaches.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(unmet).toBeFocused();
    await expect(unmet).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(unmet).toHaveAttribute('aria-pressed', 'true');
    await expect(unmet).toBeFocused();
    await expect(page.locator('#review-items > li:visible')).toHaveCount(1);
    await expect(page.locator('#review-items > li:visible')).toContainText(
      'Aproveitamento e certificação',
    );
    await expect(page.locator('p[role="status"].visually-hidden')).toContainText(
      `Mostrando 1 de ${total} critérios: Não atendido.`,
    );
    // Assessing does not take the criterion away before its observation is written.
    await assess(page, 'VI', 'ATENDIDO');
    await expect(page.locator('#review-items > li:visible')).toHaveCount(1);
    await expect(index.getByRole('button', { name: 'Não atendido 0' })).toBeVisible();
    // The bar stays fixed under the shorter list, and saving refreshes what the filter shows.
    await expect(page.locator('.review-bar')).toBeInViewport();
    await page.locator('button[form="review-form"]').click();
    await expect(page.locator('#review-message')).toContainText('Parecer salvo');
    await expect(page.locator('[data-review-empty]')).toContainText('Não atendido');
    await index.getByRole('button', { name: `Todos ${total}` }).click();
    await expect(page.locator('#review-items > li:visible')).toHaveCount(total);
  });
}

async function openEditorReturned(
  page: Page,
  fixtureUrl: string,
  status: 'devolvido' | 'rascunho',
) {
  await page.goto(`${fixtureUrl}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(
    async ({ lastReturn, status }) => {
      Object.assign(window.editorTest.record, { status, lastReturn });
      await window.publishReviewerCalendar();
    },
    { lastReturn: returnedLastReturn, status },
  );
  await expect(page.locator('#return-note')).toBeVisible();
}

for (const [name, width, height] of viewports)
  for (const status of ['devolvido', 'rascunho'] as const)
    test(`the campus sees the criteria of the return in a calendar ${status} at ${name}`, async ({
      page,
      fixtureServer,
    }) => {
      await page.setViewportSize({ width, height });
      await openEditorReturned(page, await fixtureServer('editor'), status);
      const note = page.locator('#return-note');
      await expect(note).toContainText('Ajustar as datas apontadas.');
      const list = note.getByRole('group').or(note.locator('details'));
      await expect(list).toContainText('Critérios não atendidos (2)');
      await expect(note.locator('[data-returned-criterion="VI"]')).toContainText('Falta o prazo.');
      // The day count has no one step that decides it, so it has no link; the proof of the
      // selector is the link of the criterion that does have one.
      await expect(note.locator('[data-returned-criterion="annual"]')).toContainText(
        'Faltam 12 dias.',
      );
      await expect(note.locator('[data-returned-criterion="annual"] a')).toHaveCount(0);
      await assertNoOverflow(page);
      await note.getByRole('link', { name: 'Corrigir Aproveitamento e certificação' }).click();
      await expect(page).toHaveURL(/\/atividades\?.*atividade=recognition/);
      await expect(page.locator('[data-activity-details], #event-form').first()).toBeVisible();
    });
