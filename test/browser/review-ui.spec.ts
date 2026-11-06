import { test, expect } from './test.ts';
import type {} from '../fixtures/review-ui-client.ts';

test('the queue tells how long a submission has waited, only while it waits', async ({
  page,
  fixtureServer,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-26T15:00:00Z'));
  await page.goto(await fixtureServer('review'));
  await expect(page.locator('[data-waiting]').first()).toHaveText('Aguardando há 3 dias');
  await page.evaluate(() => window.reviewUiTest.publishLegacy2027Review());
  await page.getByRole('tab', { name: 'Em análise' }).click();
  await expect(page.locator('[data-open-review]').first()).toBeVisible();
  await expect(page.locator('[data-waiting]')).toHaveCount(0);
});

test('2027 rules invalidate legacy assessments while preserving their observations as context', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('review'));
  await expect(page.locator('[data-open-review]').first()).toBeVisible();
  await page.evaluate(() => window.reviewUiTest.publishLegacy2027Review());
  await page.getByRole('tab', { name: 'Em análise' }).click();
  await page.locator('[data-open-review]').first().click();
  const ethics = page.locator('#criterion-title-XXV').locator('xpath=ancestor::li');
  await expect(ethics).toContainText('Ética e da Cidadania');
  await expect(ethics.locator('[data-origin]')).toHaveText('A avaliar');
  await expect(ethics.locator('[data-choice="PENDENTE"]')).toHaveAttribute('aria-checked', 'true');
  await ethics.locator('.review-item__notes summary').click();
  await expect(ethics.locator('textarea')).toHaveValue(
    /Contexto da revisão anterior.*Semana cultural conforme a regra anterior/,
  );
  await expect(page.locator('#review-progress')).toContainText(/^0 de/);
  expect(await page.evaluate(() => window.reviewUiTest.calls.saves)).toBe(0);
});

test('direct review separates the rule, the record and the assessment on keyboard and mobile', async ({
  page,
  fixtureServer,
}) => {
  const fixtureUrl = await fixtureServer('review');
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
  await page.locator('[data-open-review]').first().click();
  const item = '#review-items > li:first-child';
  const notes = `${item} textarea`;
  const notesToggle = page.locator(`${item} .review-item__notes summary`);
  const choice = `${item} [data-choice="ATENDIDO"]`;
  await expect(page.locator(notes)).toBeHidden();
  await expect(page.locator(notes)).toBeEnabled();
  await expect(page.locator(`${item} [data-rule]`)).toContainText('pelo menos 200 dias letivos');
  await expect(page.locator(`${item} [data-registered]`)).toContainText(
    /Contagem automática indisponível/,
  );
  await expect(page.locator(`${item} [data-check]`)).toContainText('Carga horária do PPC');
  await notesToggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(notes)).toBeVisible();
  await expect(page.locator(notes)).toHaveAccessibleName('Observações (opcional)');
  await expect(page.locator(`${item} [role="radiogroup"]`)).toHaveAccessibleName(
    'Avaliação: Dias letivos anuais',
  );
  await expect(page.locator(`${item} [role="radio"]`)).toHaveCount(4);
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
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator(choice)).toHaveAttribute('aria-checked', 'true');
  expect(
    await page.evaluate(() => window.reviewUiTest.calls.saves),
    'choosing an assessment does not save the parecer',
  ).toBe(0);
  await expect(page.locator(`${item} [data-origin]`)).toContainText(/por salvar/i);
  await page.locator(notes).fill('Avaliação documental registrada.');
  await expect(page.locator(notes)).toHaveValue('Avaliação documental registrada.');
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('[data-origin="annual"]'))
    .toHaveText('Salvo')
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
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').click();
  await page.getByRole('tab', { name: 'Em análise' }).click();
  await page.locator('[data-open-review]').first().click();
  await expect(page.locator('[data-origin="annual"]')).toHaveText('Salvo');
  await expect(notesToggle).toContainText('observação registrada');
  await expect(page.locator(notes)).toBeHidden();
  await expect(page.locator(notes)).toHaveValue('Avaliação documental registrada.');
  await notesToggle.click();
  await page.locator(notes).fill('Observação alterada, com a avaliação mantida.');
  await expect(page.locator(notes)).toHaveValue('Observação alterada, com a avaliação mantida.');
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('[data-origin="annual"]')).toHaveText('Salvo');
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').click();
  await page.locator('[data-open-review]').first().click();
  await expect(page.locator('[data-origin="annual"]')).toHaveText('Salvo');
  await expect(page.locator(notes)).toHaveValue('Observação alterada, com a avaliação mantida.');
  await page.locator(`${item} [data-choice="PENDENTE"]`).click();
  await expect(page.locator('[data-origin="annual"]')).toHaveText('A avaliar · por salvar');
  await page.locator(choice).click();
  await page.evaluate(() => {
    window.reviewUiTest.calls.failSave = true;
  });
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('#review-message')).toContainText('Falha sintética ao salvar');
  // A failed save must not read as saved.
  await expect(page.locator('#review-message .ui-notice')).toHaveAttribute('data-tone', 'danger');
  expect(
    await page.locator(`${item} [data-origin]`).evaluate((node) => node.textContent ?? ''),
    'failed persistence must retain the pending-save badge',
  ).toMatch(/por salvar/i);
  // Reopening from the list remounts the analysis with its notes collapsed.
  await notesToggle.click();
  await page.locator(notes).fill('Nova observação ainda por salvar.');
  await expect(page.locator(notes)).toHaveValue('Nova observação ainda por salvar.');
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
      await page
        .locator(choice)
        .evaluate((node) => node.closest('label')!.getBoundingClientRect().height >= 44),
    ).toBeTruthy();
    await notesToggle.click();
    await expect(page.locator(notes)).toBeHidden();
    await expect(notesToggle).toContainText('observação registrada');
    await notesToggle.click();
    await expect(page.locator(notes)).toHaveValue('Nova observação ainda por salvar.');
  }
  expect(requests, 'isolated UI test cannot contact a real backend').toEqual([]);
  expect(errors).toEqual([]);
});

test('a review submission remains attached to its form while navigating away and back', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('review'));
  await page.locator('[data-open-review]').first().click();
  await page.locator('#review-process').fill('23354.000004/2027-04');
  await page.evaluate(() => {
    window.reviewUiTest.calls.deferNextSave = true;
  });
  await page.locator('button[form="review-form"]').click();
  await expect.poll(() => page.evaluate(() => window.reviewUiTest.calls.pendingSave)).toBe(true);
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').click();
  await expect(page.locator('#review-content')).toHaveCount(0);
  await page.locator('[data-open-review]').first().click();
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
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('review'));
  await page.locator('[data-open-review]').first().click();
  await page.locator('#review-process').fill('23354.000005/2027-05');
  await page.evaluate(() => {
    window.reviewUiTest.calls.deferNextSave = true;
  });
  await page.locator('button[form="review-form"]').click();
  await expect.poll(() => page.evaluate(() => window.reviewUiTest.calls.pendingSave)).toBe(true);
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').click();
  await page.locator('[data-open-review]').first().click();
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
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('review'));
  await page.locator('[data-open-review]').first().click();
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

test('the review list states each parecer and names the next step', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('review'));
  const row = page.locator('#review-calendars > li').first();
  const action = page.locator('[data-open-review="synthetic-review"]');
  await expect(row.locator('[data-review-label]')).toHaveText('Parecer não iniciado');
  await expect(row.locator('[data-review-assignee]')).toHaveText('Sem responsável');
  await expect(action).toHaveText('Ver parecer');
  await page.locator('[data-assume-review="synthetic-review"]').click();
  await expect(page.locator('#review-assignee')).toHaveText('Você');
  const item = page.locator('#review-items > li').first();
  await item.locator('[data-choice="ATENDIDO"]').click();
  await page.getByRole('button', { name: 'Salvar parecer' }).first().click();
  await expect(page.locator('#review-message')).toContainText('Parecer salvo');
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link').click();
  // Saving started the review, so the calendar left the first tab.
  await page.getByRole('tab', { name: 'Em análise' }).click();
  await expect(row.locator('[data-review-label]')).toHaveText(
    /^Em andamento · 1 de \d+ critérios avaliados$/,
  );
  await expect(row).toContainText('Rev. 1');
  await expect(row.locator('[data-review-assignee]')).toContainText('Com você');
  await expect(action).toHaveText('Continuar parecer');
  await page.locator('[data-release-review="synthetic-review"]').click();
  await expect(row.locator('[data-review-assignee]')).toHaveText('Sem responsável');
});

test('a parecer held by a colleague is read only until assumed, and keeps the draft', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('review')).origin;
  await page.goto(origin + '/revisoes/synthetic-review');
  const save = page.getByRole('button', { name: 'Salvar parecer' }).first();
  await page.locator('#review-process').fill('Processo do rascunho local');
  await expect(save).toBeEnabled();
  await page.evaluate(() => window.reviewUiTest.publishAssignee('Fulana'));
  await expect(page.locator('#review-assignee')).toHaveText('Fulana');
  await expect(save).toBeDisabled();
  await page.locator('#assume-review').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Assumir parecer' }).click();
  await expect(page.locator('#review-assignee')).toHaveText('Você');
  await expect(save).toBeEnabled();
  await expect(page.locator('#review-process')).toHaveValue('Processo do rascunho local');
});

test('a suggestion waits for the reviewer, who may filter what is left to assess', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('review'));
  await page.evaluate(() => window.reviewUiTest.publishCountedCalendar());
  await page.locator('[data-open-review]').first().click();
  const items = page.locator('#review-items > li');
  await expect(items.first()).toBeVisible();
  const total = await items.count();
  const suggested = page.locator('[data-suggestion]').first();
  await expect(suggested).toContainText('Sugestão do sistema');
  const id = await suggested.getAttribute('data-suggestion');
  const criterion = page.locator(`#review-items > li:has([data-fields="${id}"])`);
  await expect(criterion.locator('[data-choice="PENDENTE"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('#review-progress')).toContainText(/^0 de/);

  await page.getByRole('radio', { name: `A avaliar (${total})` }).click();
  // Assessing keeps the criterion in the list, with the observation open for what is missing.
  await criterion.locator('[data-choice="NAO_ATENDIDO"]').click();
  await expect(criterion).toBeVisible();
  await expect(criterion.locator('textarea')).toBeVisible();
  await expect(page.locator('#review-progress')).toContainText(/^1 de/);
  await expect(page.getByRole('radio', { name: `A avaliar (${total - 1})` })).toBeChecked();

  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('#review-message')).toContainText('Parecer salvo');
  await expect(criterion).toBeHidden();
  await page.getByRole('radio', { name: `Todos (${total})` }).click();
  await expect(criterion).toBeVisible();
  await expect(criterion.locator('[data-origin]')).toHaveText('Salvo');
});

test('the list says what the review does not assess, and warns of an unconfirmed scope', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('review'));
  await page.locator('[data-open-review]').first().click();
  await expect(page.locator('#review-scope-warning')).toContainText('Escopo da norma a confirmar');
  await page.locator('.review-not-evaluated summary').click();
  await expect(page.locator('.review-not-evaluated')).toContainText('Art. 15');
});

test('coverage reads by activity, without optional activities that have nothing to assess', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('review'));
  await page.evaluate(() => window.reviewUiTest.publishCountedCalendar());
  await page.locator('[data-open-review]').first().click();
  await expect(page.locator('#review-scope-warning')).toHaveCount(0);
  const family = page.locator('[data-registered="XVI"]');
  await expect(family.locator('.review-coverage li')).toHaveCount(1);
  await expect(family.locator('.review-coverage small').first()).toContainText('Obrigatório');
  // Many activities collapse behind how they stand.
  const stages = page.locator('[data-registered="XIII"] .review-item__coverage-all summary');
  await expect(stages).toContainText(/^Ver \d+ atividades: \d+ completas/);
});

test('a closed parecer shows a suggestion saved long ago as a proposal, not as an assessment', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('review')).origin;
  await page.goto(origin + '/revisoes/synthetic-review');
  await expect(page.locator('#review-items')).toBeVisible();
  await page.evaluate(() => window.reviewUiTest.publishSavedSuggestion());
  await page.reload();
  await page.evaluate(() => window.reviewUiTest.publishSavedSuggestion());
  const first = page.locator('#review-items > li').first();
  await expect(first.locator('[data-origin]')).toHaveText('Proposta automática, não confirmada');
  await expect(first.locator('[data-choice="ATENDIDO"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#review-progress')).toContainText(/^0 de/);
});

for (const width of [1360, 390]) {
  test(`an internal date is listed apart, with the Interna badge, never as a related record at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('review'));
    await page.evaluate(() => window.reviewUiTest.publishInternalDates());
    await page.locator('[data-open-review]').first().click();
    const item = page.locator('#criterion-title-XXVI').locator('xpath=ancestor::li');
    const related = item.locator('.review-item__records:not([data-internal-dates])');
    await expect(related.locator('li')).toHaveText(['5 out · Semana Cultural Interescolar']);
    const internal = item.locator('[data-internal-dates="XXVI"]');
    await expect(internal.locator('summary')).toHaveText(
      'Datas internas do campus, só para consulta (1)',
    );
    await internal.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(internal.locator('li')).toHaveCount(1);
    await expect(internal.locator('li')).toContainText('Ensaio da Semana Cultural');
    await expect(internal.locator('li [data-internal-badge]')).toHaveText('Interna');
    await expect(internal).toContainText('não comprovam o critério');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('the tabs count what awaits review and stay quiet when nothing does', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('review'));
  const waiting = page.getByRole('tab', { name: 'Aguardando análise' });
  await expect(waiting.locator('[data-queue-count="enviado"]')).not.toHaveCount(0);
  await expect(page.locator('[data-queue-count="em_revisao"]')).toHaveCount(0);
  await expect(
    page.getByRole('tab', { name: 'Concluídos' }).locator('[data-queue-count]'),
  ).toHaveCount(0);
});

test('the parecer opens with its state and offers exporting once a review is saved', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('review')).origin;
  await page.goto(origin + '/revisoes/synthetic-review');
  await expect(page.locator('#review-progress')).toHaveText(/^0 de \d+$/);
  // The synthetic calendar has no periods, so the count is unavailable and the notice says why.
  await expect(page.locator('#review-conflicts')).toHaveText('A conferir');
  await expect(page.locator('#review-conflicts-notice')).toContainText('Contagem indisponível');
  await expect(page.locator('#review-comparison-headline')).toHaveText('Primeiro envio');
  await expect(page.locator('#review-status')).toContainText('Envio 1');
  const preview = page.locator('#preview-review');
  await expect(preview).toHaveCount(0);
  await page.locator('button[form="review-form"]').click();
  await expect(preview).toBeVisible();
  await page.getByRole('button', { name: 'Exportar' }).click();
  await expect(page.getByRole('menuitem', { name: 'Copiar para o SEI' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Baixar HTML' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Baixar TXT' })).toBeVisible();
});

test('a first submission keeps its history a click away; a resubmission opens what changed', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('review')).origin;
  await page.goto(origin + '/revisoes/synthetic-review');
  const panel = page.locator('#review-comparison-panel');
  const toggle = page.locator('#toggle-comparison');
  await expect(toggle).toHaveText('Ver histórico');
  await expect(panel).toBeHidden();
  await page.evaluate(() => window.reviewUiTest.publishResubmission());
  await expect(page.locator('#review-comparison-headline')).toHaveText('1 alteração');
  await expect(panel).toBeVisible();
  await expect(page.locator('#submission-comparison-title')).toHaveText(
    'Alterações desde o envio 1',
  );
  await expect(panel).toContainText('Ajustar a semana letiva.');
  await toggle.click();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveText('Ver alterações');
});

test('a new edit retires the confirmation that the parecer was saved', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('review')).origin;
  await page.goto(origin + '/revisoes/synthetic-review');
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('#review-message')).toContainText('Parecer salvo');
  await page.locator('#review-process').fill('23354.000006/2027-06');
  await expect(page.locator('#review-message')).toBeEmpty();
});

test('saving stays in reach and the outcome in view along the long list of criteria', async ({
  page,
  fixtureServer,
}) => {
  await page.setViewportSize({ width: 1360, height: 800 });
  const origin = new URL(await fixtureServer('review')).origin;
  await page.goto(origin + '/revisoes/synthetic-review');
  const save = page.locator('button[form="review-form"]');
  await expect(save).toBeInViewport();
  const item = page.locator('#review-items > li').nth(10);
  await item.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await save.click();
  await expect(page.locator('#review-message')).toContainText('Parecer salvo');
  await expect(page.locator('#review-message')).toBeInViewport();
});

test('concluding states why it is unavailable until the review allows it', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('review')).origin;
  await page.goto(origin + '/revisoes/synthetic-review');
  await expect(page.locator('#review-progress')).toBeVisible();
  await page.evaluate(() => window.reviewUiTest.publishStatus('em_revisao'));
  const conclude = page.locator('[data-lifecycle-action="conclude"]');
  const reason = page.locator('#lifecycle-conclude-unavailable');
  await expect(conclude).toBeDisabled();
  await expect(reason).toContainText('Salve o parecer deste envio');
  const item = page.locator('#review-items > li').first();
  await item.locator('[data-choice="ATENDIDO"]').click();
  await expect(reason).toContainText('Salve ou descarte as alterações');
  await page.locator('button[form="review-form"]').click();
  await expect(page.locator('#review-message')).toContainText('Parecer salvo');
  await expect(reason).toContainText(/^Faltam \d+ critérios:/);
  await expect(conclude).toBeDisabled();
});

test('a parecer that can no longer change leaves copying to the SEI as the main action', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('review')).origin;
  await page.goto(origin + '/revisoes/synthetic-review');
  const save = page.locator('button[form="review-form"]');
  await save.click();
  await expect(page.locator('#review-message')).toContainText('Parecer salvo');
  await page.evaluate(() => window.reviewUiTest.publishStatus('revisado'));
  await expect(page.locator('#copy-review')).toHaveClass(/ui-button--primary/);
  await expect(save).toHaveCount(0);
  await expect(page.locator('[data-lifecycle-action="reopen"]')).toHaveClass(
    /ui-button--secondary/,
  );
});

test('withdrawing, which only the administration sees here, stays in the actions menu', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('review')).origin;
  await page.goto(origin + '/revisoes/synthetic-review?role=ADMIN');
  await expect(page.locator('[data-lifecycle-action="return"]')).toBeVisible();
  await page.getByRole('button', { name: 'Mais ações' }).click();
  await page.locator('[data-lifecycle-action="withdraw"]').click();
  await expect(page.getByRole('alertdialog')).toContainText('Recolher envio');
});

for (const [width, height] of [
  [1360, 800],
  [390, 844],
]) {
  test(`the fixed bar never covers a control reached by keyboard at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height });
    const origin = new URL(await fixtureServer('review')).origin;
    await page.goto(origin + '/revisoes/synthetic-review');
    // Saved, the bar has all its buttons and is at its tallest.
    await page.locator('button[form="review-form"]').click();
    await expect(page.locator('#preview-review')).toBeVisible();
    await page.locator('#review-process').focus();
    for (let step = 0; step < 40; step++) {
      await page.keyboard.press('Tab');
      const covered = await page.evaluate(() => {
        const focused = document.activeElement as HTMLElement;
        if (focused.closest('.review-bar') || !focused.closest('#review-form')) return false;
        const { left, width, bottom } = focused.getBoundingClientRect();
        const bar = document.querySelector('.review-bar')!.getBoundingClientRect();
        return left + width / 2 > bar.left && bottom > bar.top;
      });
      expect(covered, `focused control ${step} is under the bar`).toBe(false);
    }
  });
}
