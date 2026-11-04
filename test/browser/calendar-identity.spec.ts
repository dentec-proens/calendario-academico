import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`the editor title is renamed from its own panel at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(await fixtureServer('editor'));
    const rename = page.getByRole('button', { name: 'Renomear calendário' });
    await rename.click();
    const panel = page.getByRole('dialog', { name: 'Nome do calendário' });
    await expect(panel).toContainText('O ano letivo e o campus fazem parte do nome e não mudam.');
    await panel.getByLabel('Complemento do nome (opcional)').fill('Proposta A');
    await expect(panel.locator('.editor-name-preview')).toHaveText(
      'O nome fica: Calendário 2027 - Campus Campus de teste — Proposta A',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(panel).toBeHidden();
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste — Proposta A');
    await expect(rename).toBeFocused();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  });

  test(`the editor header shows the identity and saves it from the side panel at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(await fixtureServer('editor'));
    const identity = page.locator('#calendar-identity');
    await expect(identity).toHaveText(/Curso sintético/);
    const edit = page.getByRole('button', { name: 'Editar identificação do calendário' });
    await edit.click();
    const panel = page.getByRole('dialog', { name: 'Identificação' });
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel('Cursos')).toHaveValue('Curso sintético');
    await panel.getByLabel('Cursos').fill('Técnico em Informática, Técnico em Administração');
    await panel.getByLabel('Turmas (opcional)').fill('1º ano A');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel.getByRole('button', { name: 'Salvar identificação' }).click();
    await expect(panel).toBeHidden();
    await expect(identity).toHaveText(
      /Técnico em Informática, Técnico em Administração · 1º ano A/,
    );
    await expect(edit).toBeFocused();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  });
}

test('missing courses block the submission and are filled from the review issues', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await page.evaluate(() => {
    window.editorTest.record.courses = '';
    return window.publishReviewerCalendar();
  });
  await expect(page.locator('#calendar-identity')).toContainText('Cursos não informados');
  const submit = page.locator('[data-lifecycle-action="submit"]');
  await expect(submit).toBeDisabled();
  await expect(page.locator('#lifecycle-submit-unavailable')).toHaveText(
    'Informe os cursos do calendário na identificação.',
  );

  await selectEditorSection(page, 'issues');
  const issue = page.locator('#issue-list [data-issue="identity"]');
  await expect(issue).toContainText('Informe os cursos do calendário na identificação.');
  await issue.getByRole('button', { name: 'Informar cursos' }).click();
  const panel = page.getByRole('dialog', { name: 'Identificação' });
  await panel.getByLabel('Cursos').fill('Curso em preenchimento');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.locator('#calendar-identity').getByRole('button', { name: 'Informar cursos' }).click();
  await expect(panel.getByLabel('Cursos')).toHaveValue('Curso em preenchimento');
  await panel.getByRole('button', { name: 'Descartar alterações' }).click();
  await expect(panel.getByLabel('Cursos')).toHaveValue('');
  await panel.getByLabel('Cursos').fill('Técnico em Informática');
  await panel.getByRole('button', { name: 'Salvar identificação' }).click();
  await expect(panel).toBeHidden();
  await expect(issue).toHaveCount(0);
  await expect(submit).toBeEnabled();
});

test('a reviewer reads the identity without the edit action', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('editor-reviewer'));
  await expect(page.locator('#calendar-identity')).toHaveText(/Curso sintético/);
  await expect(page.locator('#calendar-identity button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Renomear calendário' })).toHaveCount(0);
});

test('an unsaved name left in the closed panel counts as unapplied work', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  const rename = page.getByRole('button', { name: 'Renomear calendário' });
  await rename.click();
  const panel = page.getByRole('dialog', { name: 'Nome do calendário' });
  await panel.getByLabel('Complemento do nome (opcional)').fill('Proposta em preenchimento');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await expect(page.locator('.editor-save-indicator')).toHaveText('Campos ainda em preenchimento');
  await rename.click();
  await expect(panel.getByLabel('Complemento do nome (opcional)')).toHaveValue(
    'Proposta em preenchimento',
  );
  await panel.getByRole('button', { name: 'Descartar alterações' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#unapplied-status')).toBeHidden();
});

test('an unsaved identity left in the closed panel counts as unapplied work', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  const edit = page.getByRole('button', { name: 'Editar identificação do calendário' });
  await edit.click();
  const panel = page.getByRole('dialog', { name: 'Identificação' });
  await panel.getByLabel('Turmas (opcional)').fill('1º ano A');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await expect(page.locator('.editor-save-indicator')).toHaveText('Campos ainda em preenchimento');
  await edit.click();
  await expect(panel.getByLabel('Turmas (opcional)')).toHaveValue('1º ano A');
  await panel.getByRole('button', { name: 'Descartar alterações' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#unapplied-status')).toBeHidden();
});

test('reopening the calendar after a remote change discards the unsaved identity', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  const edit = page.getByRole('button', { name: 'Editar identificação do calendário' });
  await edit.click();
  const panel = page.getByRole('dialog', { name: 'Identificação' });
  await panel.getByLabel('Turmas (opcional)').fill('Turma descartada');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.editorTest.record.version++;
    return window.publishReviewerCalendar();
  });
  await page.getByRole('button', { name: 'Reabrir calendário atualizado' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reabrir calendário' }).click();
  await expect(page.locator('#unapplied-status')).toBeHidden();
  await expect(page.locator('[data-lifecycle-action="submit"]')).toBeEnabled();
  await edit.click();
  await expect(panel.getByLabel('Turmas (opcional)')).toHaveValue('');
});
