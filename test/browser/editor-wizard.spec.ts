import { test, expect } from './test.ts';
import { configureOffer, fillRequiredVacations, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`guided editor validates the first step and exposes contextual actions at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await expect(page.locator('.editor-step-number')).toHaveCount(6);
    await expect(page.locator('.autosave-panel')).toBeHidden();
    await expect(page.locator('#review-progress')).toHaveCount(0);
    await expect(page.locator('#editor-section-title')).toContainText('Semana letiva');
    await expect(page.locator('[aria-current="page"] .editor-step-title')).toHaveText(
      'Semana letiva',
    );
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
    await expect(page.getByRole('list', { name: 'Formas de oferta e níveis' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Passo 1 de 6: Semana letiva', exact: true }),
    ).toHaveCount(1);

    const weekdays = page.locator('#weekdays input');
    await expect(weekdays).toHaveCount(5);

    for (const checkbox of await weekdays.all()) await checkbox.uncheck();

    await page
      .getByRole('button', { name: 'Continuar para organização por oferta', exact: true })
      .click();
    await expect(page.locator('#week-form [role="alert"]')).toContainText(
      'Selecione pelo menos um dia regular.',
    );
    await expect(page).toHaveURL(/\/editar$/);
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);

    await page.locator('#weekdays input[value="1"]').check();
    await page
      .getByRole('button', { name: 'Continuar para organização por oferta', exact: true })
      .click();
    await expect(page).toHaveURL(/\/periodos$/);
    await expect(page.locator('#editor-section-title')).toBeFocused();
    await expect(page.locator('#editor-section-title')).toHaveAccessibleName(
      'Passo 2 de 6: Organização por oferta',
    );
    await expect(page.locator('#editor-section-title')).toContainText('Organização por oferta');
    await expect(page.locator('#assessment-area')).toBeVisible();
    await expect(page.locator('#editor-continue')).toHaveText('Continuar para sábados letivos');
    await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'saved');
    expect(await page.evaluate(() => window.editorTest.record.state.weekdays)).toEqual([1]);
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/periodos$/);
    await expect(page.locator('#organization-continue [role="alert"]')).toContainText(
      'Técnico integrado',
    );
    await configureOffer(page, 'integrado', '2027-03-01', '2027-03-26');
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/dias$/);
    await expect(page.locator('#editor-section-title')).toHaveAccessibleName(
      'Passo 3 de 6: Sábados letivos',
    );
    await expect(page.getByRole('heading', { name: /Sábados letivos/ })).toHaveCount(1);
    await expect(page.locator('#editor-continue')).toHaveText('Continuar para férias');
    await expect(page.locator('#vacation-add-teacher')).toHaveCount(0);
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/ferias$/);
    await expect(page.locator('#editor-section-title')).toHaveAccessibleName(
      'Passo 4 de 6: Férias',
    );
    await expect(page.getByRole('heading', { name: 'Férias docentes' })).toHaveCount(1);
    await expect(page.locator('#editor-continue')).toHaveText('Continuar para atividades');
    await expect(page.locator('#saturday-form')).toHaveCount(0);
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/atividades$/);
    await expect(page.locator('#editor-section-title')).toHaveAccessibleName(
      'Passo 5 de 6: Atividades',
    );
    await expect(page.locator('#new-event')).toHaveText('Adicionar data do campus');
    await expect(page.locator('#editor-continue')).toHaveText('Continuar para conferir e enviar');
    await fillRequiredVacations(page);
    await selectEditorSection(page, 'issues');
    await expect(page.locator('#review-progress')).toBeVisible();
    await expect(
      page
        .locator('.editor-footer-conclusion')
        .getByRole('link', { name: 'Visualizar calendário' }),
    ).toBeVisible();
    // The review step ends in the submission, repeated in its footer.
    await expect(page.locator('[data-lifecycle-footer-action="submit"]')).toHaveText(
      'Enviar para análise',
    );
    const submit = page.locator('[data-lifecycle-action="submit"]');
    await expect(submit).toHaveText('Enviar para análise');
    await submit.click();
    await expect(page.getByRole('alertdialog')).toContainText('ficará travado para edição');
    await page.keyboard.press('Escape');
    await expect(submit).toBeFocused();
    expect(await page.evaluate(() => window.editorTest.calls.transitions)).toBe(0);
    await selectEditorSection(page, 'edit');
    // Autosave from the earlier steps may still be scheduled or in flight; count from rest.
    await expect(page.locator('.editor-save-indicator')).not.toHaveText(
      /Salvando|ainda não salvas/,
    );
    const saves = await page.evaluate(() => window.editorTest.calls.saves);
    await page.locator('#weekdays input[value="1"]').uncheck();

    await expect(page.locator('.editor-save-indicator')).toHaveText(
      'Alterações ainda não incluídas',
    );
    await expect(page.locator('#unapplied-status')).toBeVisible();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(saves);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('secondary actions support the keyboard and the mobile step picker follows the URL', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  const toggle = page.locator('.editor-more-trigger');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const importCopy = page.getByRole('menuitem', { name: 'Importar cópia', exact: true });
  await expect(importCopy).toBeVisible();
  await expect(importCopy).toHaveAccessibleDescription('Restaurar uma cópia editável (.json)');
  await expect(importCopy).toHaveAttribute('title', /substituídos após sua confirmação/);
  await expect(importCopy.locator('svg')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(page.locator('.editor-more-content')).toBeHidden();
  // The stacked header puts the menu on the left; it must still open inside the viewport.
  for (const width of [850, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await toggle.click();
    const box = (await page.locator('.editor-more-content').boundingBox())!;
    expect(box.x, `${width}px`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${width}px`).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(page.locator('.editor-more-content')).toBeHidden();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const steps = page.locator('.editor-step-menu');
  await expect(steps).not.toHaveAttribute('open');
  await steps.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-view="events"]')).toBeVisible();
  await page.locator('[data-view="events"]').click();
  await expect(steps.locator('summary')).toContainText('Passo 5 de 6');
  await expect(steps).not.toHaveAttribute('open');
  await expect(page.locator('#editor-section-title')).toBeFocused();
});
