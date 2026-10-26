import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`guided editor validates the first step and exposes contextual actions at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await expect(page.locator('.editor-step-number')).toHaveCount(7);
    await expect(page.locator('.autosave-panel')).toBeHidden();
    await expect(page.getByText('Salvamento automático ativo.')).toHaveCount(0);
    await expect(page.locator('#make-definitive')).toHaveCount(0);
    await expect(page.locator('#total')).toHaveCount(0);
    await expect(page.locator('#editor-section-title')).toHaveText('Semana letiva');
    await expect(page.locator('[aria-current="page"] .editor-step-title')).toHaveText(
      'Semana letiva',
    );
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
    await expect(page.locator('.editor-calendar-details dt')).toHaveText([
      'Forma de oferta/nível',
      'Organização',
    ]);
    await expect(page.locator('#campus, #year')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Identificação', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Semana letiva', exact: true })).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'Campus', exact: true })).toHaveCount(0);
    await expect(page.getByRole('spinbutton', { name: 'Ano', exact: true })).toHaveCount(0);
    await expect(page.locator('#week-evidence')).toHaveAccessibleDescription(
      /resolução, portaria ou ata de reunião/,
    );

    const weekdays = page.locator('#weekdays input');
    await expect(weekdays).toHaveCount(5);
    for (const checkbox of await weekdays.all()) await checkbox.uncheck();
    await page.locator('#week-evidence').fill('Decisão da semana letiva');
    await page.locator('#week-confirmed').check();
    await page
      .getByRole('button', { name: 'Continuar para períodos letivos', exact: true })
      .click();
    await expect(page.locator('#week-form [role="alert"]')).toContainText(
      'Selecione pelo menos um dia regular.',
    );
    await expect(page).toHaveURL(/\/editar$/);
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);

    await page.locator('#weekdays input[value="1"]').check();
    await page
      .getByRole('button', { name: 'Continuar para períodos letivos', exact: true })
      .click();
    await expect(page).toHaveURL(/\/periodos$/);
    await expect(page.locator('#editor-section-title')).toBeFocused();
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 2 de 7');
    await expect(page.locator('#editor-section-title')).toHaveText('Períodos letivos');
    await expect(page.locator('#editor-continue')).toHaveText('Continuar para etapas de avaliação');
    await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'saved');
    expect(await page.evaluate(() => window.editorTest.record.state.weekdays)).toEqual([1]);

    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/avaliacoes$/);
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 3 de 7');
    await expect(page.locator('#editor-section-title')).toHaveText('Etapas de avaliação');
    await expect(page.locator('#editor-continue')).toHaveText('Continuar para sábados letivos');
    await expect(page.locator('#period-form')).toHaveCount(0);
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/dias$/);
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 4 de 7');
    await expect(page.locator('#editor-continue')).toHaveText('Continuar para férias docentes');
    await expect(page.locator('#vacation-form')).toHaveCount(0);
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/ferias$/);
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 5 de 7');
    await expect(page.locator('#editor-continue')).toHaveText(
      'Continuar para atividades e datas do campus',
    );
    await expect(page.locator('#saturday-form')).toHaveCount(0);
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/eventos$/);
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 6 de 7');
    await selectEditorSection(page, 'issues');
    await expect(page.locator('#total')).toBeVisible();
    await expect(page.locator('#export-calendar')).toBeVisible();
    await expect(page.locator('#make-definitive')).toHaveText('Concluir e tornar definitivo');
    await page.locator('#make-definitive').click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'Isso não representa aprovação institucional.',
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('#make-definitive')).toBeFocused();
    expect(await page.evaluate(() => window.editorTest.calls.conversions)).toBe(0);
    await selectEditorSection(page, 'edit');
    const saves = await page.evaluate(() => window.editorTest.calls.saves);
    await page.locator('#week-evidence').fill('Nova decisão ainda em preenchimento');
    await expect(page.locator('.editor-save-indicator')).toHaveText(
      'Campos ainda em preenchimento',
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
  const toggle = page.locator('.editor-more > summary');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const importCopy = page.getByRole('button', { name: 'Importar cópia', exact: true });
  await expect(importCopy).toBeVisible();
  await expect(importCopy).toHaveAccessibleDescription('Restaurar uma cópia editável (.json)');
  await expect(importCopy).toHaveAttribute('title', /substituídos após sua confirmação/);
  await expect(importCopy.locator('svg')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(page.locator('.editor-more-content')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  const steps = page.locator('.editor-step-menu');
  await expect(steps).not.toHaveAttribute('open');
  await steps.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-view="events"]')).toBeVisible();
  await page.locator('[data-view="events"]').click();
  await expect(steps.locator('summary')).toContainText('Etapa 6 de 7');
  await expect(steps).not.toHaveAttribute('open');
  await expect(page.locator('#editor-section-title')).toBeFocused();
  await expect(page.locator('#calendario-anterior')).not.toHaveAttribute('open');
  await expect(page.locator('#history-file')).toBeHidden();
});
