import { test, expect } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';
import type {} from '../fixtures/review-ui-client.ts';

test('direct review distinguishes automatic indications, confirmation and saved decisions on keyboard and mobile', async ({
  page,
  cleanup,
}) => {
  const fixtureUrl = await startFixtureServer('review', cleanup);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:')) requests.push(request.url());
  });
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.goto(fixtureUrl);
  await page.locator('#open-review').click();
  const item = '#review-items > li:first-child';
  const confirm = `${item} [data-confirm-criterion]`;
  const notes = `${item} textarea`;
  const notesToggle = page.locator(`${item} .review-item__notes summary`);
  const choice = `${item} [data-choice="ATENDIDO"]`;
  await expect(page.locator(notes)).toBeHidden();
  await expect(page.locator(`${item} [data-edit-criterion]`)).toHaveCount(0);
  await expect(page.locator(notes)).toBeEnabled();
  await expect(page.locator(confirm)).toBeDisabled();
  await expect(page.locator(`${item} .review-item__signal`)).toContainText(
    /Contagem automática indisponível/,
  );
  await notesToggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(notes)).toBeVisible();
  await expect(page.locator(notes)).toHaveAccessibleName('Observações (opcional)');
  await expect(
    page
      .locator(`${item} .review-item__notes`)
      .getByText('Selecione uma avaliação para confirmar.', {
        exact: true,
      }),
  ).toHaveCount(0);
  await expect(page.locator(`${item} [role="radio"]`)).toHaveCount(3);
  await page.locator(choice).focus();
  await page.keyboard.press('Space');
  const selectedBackground = () =>
    page
      .locator(`${item} [role="radio"][aria-checked="true"]`)
      .evaluate((node) => getComputedStyle(node.closest('label')!).backgroundColor);
  const attendedBackground = await selectedBackground();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`${item} [data-choice="NAO_ATENDIDO"]`)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const notAttendedBackground = await selectedBackground();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`${item} [data-choice="NAO_APLICAVEL"]`)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const notApplicableBackground = await selectedBackground();
  expect(new Set([attendedBackground, notAttendedBackground, notApplicableBackground]).size).toBe(
    3,
  );
  await page.keyboard.press('ArrowLeft');
  await page.locator(confirm).click();
  expect(
    await page.evaluate(() => window.reviewUiTest.calls.saves),
    'confirmation cannot persist or imply saving',
  ).toBe(0);
  await expect(page.locator(`${item} [data-origin]`)).toContainText(/por salvar/);
  await page.locator(notes).fill('Conferência documental registrada.');
  await expect(page.locator(notes)).toHaveValue('Conferência documental registrada.');
  await expect(page.locator(`${item} [data-origin]`)).toContainText(/não confirmada/);
  await page.locator(confirm).click();
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('[data-origin="annual"]'))
    .toHaveText('Conferido e salvo')
    .catch(async (cause: unknown) => {
      throw new Error(
        JSON.stringify(
          await page.evaluate(() => ({
            calls: window.reviewUiTest.calls,
            message: document.querySelector('#review-message')?.textContent,
            status: document.querySelector('[data-origin="annual"]')?.textContent,
            invalid: Array.from(document.querySelectorAll(':invalid')).map(
              (element) => element.outerHTML,
            ),
          })),
        ),
        { cause },
      );
    });
  expect(await page.evaluate(() => window.reviewUiTest.calls.saves)).toBe(1);
  await notesToggle.click();
  await expect(page.locator(notes)).toBeHidden();
  await page.locator('#open-review').click();
  await expect(page.locator('[data-origin="annual"]')).toHaveText('Conferido e salvo');
  await expect(notesToggle).toContainText('observação registrada');
  await expect(page.locator(notes)).toBeHidden();
  await expect(page.locator(notes)).toHaveValue('Conferência documental registrada.');
  await notesToggle.click();
  await page.locator(notes).fill('Observação alterada e salva sem nova confirmação.');
  await expect(page.locator(notes)).toHaveValue(
    'Observação alterada e salva sem nova confirmação.',
  );
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('[data-origin="annual"]')).toHaveText(
    'Avaliação salva · não confirmada',
  );
  await expect(page.locator(confirm)).toBeEnabled();
  await page.locator('#open-review').click();
  await expect(page.locator('[data-origin="annual"]')).toHaveText(
    'Avaliação salva · não confirmada',
  );
  await expect(page.locator(notes)).toHaveValue(
    'Observação alterada e salva sem nova confirmação.',
  );
  const clear = page.locator(item).getByRole('button', { name: 'Limpar avaliação', exact: true });
  await expect(clear).toHaveText('Limpar');
  await clear.click();
  await expect(page.locator(`${item} [role="radio"][aria-checked="true"]`)).toHaveCount(0);
  await expect(page.locator(confirm)).toBeDisabled();
  await page.locator(choice).click();
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('[data-origin="annual"]')).toHaveText(
    'Avaliação salva · não confirmada',
  );
  await page.locator(confirm).click();
  await page.evaluate(() => {
    window.reviewUiTest.calls.failSave = true;
  });
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('#review-message')).toContainText('Falha sintética ao salvar');
  expect(
    await page.locator(`${item} [data-origin]`).evaluate((node) => node.textContent ?? ''),
    'failed persistence must retain the pending-save badge',
  ).toMatch(/por salvar/);
  await page.locator(notes).fill('Nova observação precisa de confirmação.');
  await expect(page.locator(notes)).toHaveValue('Nova observação precisa de confirmação.');
  await page.locator(notes).focus();
  await page.waitForFunction((notes) => {
    const control = document.querySelector(notes)!;
    const label = control.closest('.ui-field')!.querySelector('.ui-field__label')!;
    return getComputedStyle(label).color === getComputedStyle(control).borderTopColor;
  }, notes);
  expect(await page.locator(notes).evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe(
    'none',
  );
  await page.locator('#edit-conclusion').click();
  await page.locator('#review-conclusion').hover();
  await page.waitForFunction(() => {
    const control = document.querySelector('#review-conclusion')!;
    return (
      getComputedStyle(control.closest('label')!).color === getComputedStyle(control).borderTopColor
    );
  });
  expect(
    await page.locator('#review-conclusion').evaluate((node) => getComputedStyle(node).boxShadow),
  ).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator(choice)
      .evaluate((node) => getComputedStyle(node.parentElement!).transitionDuration),
  ).toBe('0s');
  for (const width of [1100, 768, 560, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      `no horizontal overflow at ${width}px`,
    ).toBe(false);
    expect(
      await page.locator(confirm).evaluate((node) => node.getBoundingClientRect().height >= 44),
    ).toBeTruthy();
    await notesToggle.click();
    await expect(page.locator(notes)).toBeHidden();
    await expect(notesToggle).toContainText('observação registrada');
    await notesToggle.click();
    await expect(page.locator(notes)).toHaveValue('Nova observação precisa de confirmação.');
  }
  expect(requests, 'isolated UI test cannot contact a real backend').toEqual([]);
  expect(errors).toEqual([]);
});

test('a review submission remains attached to its form while navigating away and back', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('review', cleanup));
  await page.locator('#open-review').click();
  await page.locator('#review-process').fill('23354.000004/2027-04');
  await page.evaluate(() => {
    window.reviewUiTest.calls.deferNextSave = true;
  });
  await page.locator('button[form="review-form"]').click();
  await expect.poll(() => page.evaluate(() => window.reviewUiTest.calls.pendingSave)).toBe(true);
  await page.getByRole('link', { name: 'Voltar à lista de revisões' }).click();
  await expect(page.locator('#review-content')).toHaveCount(0);
  await page.locator('#open-review').click();
  await expect(page.locator('#review-process')).toHaveValue('23354.000004/2027-04');
  await expect(page.locator('button[form="review-form"]')).toBeDisabled();
  expect(await page.evaluate(() => window.reviewUiTest.calls.saves)).toBe(1);
  await page.evaluate(() => window.reviewUiTest.resolvePendingSave());
  await expect(page.locator('button[form="review-form"]')).toBeEnabled();
  await expect(page.locator('.review-save-status')).toHaveText('Todas as alterações foram salvas.');
  await expect(page.locator('#review-process')).toHaveValue('23354.000004/2027-04');
  expect(await page.evaluate(() => window.reviewUiTest.calls.saves)).toBe(1);
});

test('a failure after a review remount retains values and permits an explicit retry', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('review', cleanup));
  await page.locator('#open-review').click();
  await page.locator('#review-process').fill('23354.000005/2027-05');
  await page.evaluate(() => {
    window.reviewUiTest.calls.deferNextSave = true;
  });
  await page.locator('button[form="review-form"]').click();
  await expect.poll(() => page.evaluate(() => window.reviewUiTest.calls.pendingSave)).toBe(true);
  await page.getByRole('link', { name: 'Voltar à lista de revisões' }).click();
  await page.locator('#open-review').click();
  await expect(page.locator('button[form="review-form"]')).toBeDisabled();
  await page.evaluate(() => {
    window.reviewUiTest.calls.failSave = true;
    window.reviewUiTest.resolvePendingSave();
  });
  await expect(page.locator('#review-message')).toContainText('Falha sintética ao salvar');
  await expect(page.locator('#review-process')).toHaveValue('23354.000005/2027-05');
  await expect(page.locator('button[form="review-form"]')).toBeEnabled();
  await page.evaluate(() => {
    window.reviewUiTest.calls.failSave = false;
  });
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('.review-save-status')).toHaveText('Todas as alterações foram salvas.');
  expect(await page.evaluate(() => window.reviewUiTest.calls.saves)).toBe(2);
});

test('review refreshes a pristine snapshot and rejects a stale draft without losing its process number', async ({
  page,
  cleanup,
}) => {
  await page.goto(await startFixtureServer('review', cleanup));
  await page.locator('#open-review').click();
  await page.locator('#review-process').fill('Processo inicial');
  await page.locator('button[form="review-form"]').click();
  await expect.poll(() => page.evaluate(() => window.reviewUiTest.calls.saves)).toBe(1);
  await expect(page.locator('#review-process')).toBeEnabled();
  await page.evaluate(() => window.reviewUiTest.publishReview('Processo atualizado na revisão 2'));
  await expect(page.locator('#review-process')).toHaveValue('Processo atualizado na revisão 2');
  await page.locator('#review-process').fill('Processo do rascunho local');
  await page.evaluate(() => window.reviewUiTest.publishReview('Processo atualizado na revisão 3'));
  await expect(page.locator('#review-process')).toHaveValue('Processo do rascunho local');
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('#review-content [role="alert"]')).toContainText(
    'Outro revisor atualizou',
  );
  expect(await page.evaluate(() => window.reviewUiTest.calls.lastSave?.revision)).toBe(2);
  await expect(page.locator('#review-process')).toHaveValue('Processo do rascunho local');
});
