import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import { calendarReferenceAnchor } from '../../src/calendar-reference.ts';

test('campus activities show first and optional PDF files survive disclosure toggles', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await selectEditorSection(page, 'events');
  await expect(page.locator('#editor-section-title')).toHaveText('Atividades e datas do campus');
  await expect(page.locator('#editor-section-title')).toBeFocused();
  const reference = page.locator(`#${calendarReferenceAnchor}`);
  await expect(reference).not.toHaveAttribute('open');
  await expect(page.locator('#history-file')).toBeHidden();
  await expect(page.locator('#activity-checklist')).toBeVisible();
  await reference.locator(':scope > summary').click();
  const file = page.locator('#history-file');
  await file.setInputFiles({
    name: 'referencia.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 referencia sintética'),
  });
  await reference.locator(':scope > summary').click();
  await expect(file).toBeHidden();
  await reference.locator(':scope > summary').click();
  await expect(file).toHaveValue(/referencia\.pdf$/);
  await expect(page.locator('#history-form')).toHaveCount(1);
  await expect(page.locator('#event-form')).toHaveCount(1);
});

test('legacy history URLs open the optional reference and preserve search and focus', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/historico?busca=referencia');
  await expect(page).toHaveURL(
    origin + '/calendarios/synthetic-calendar/eventos?busca=referencia#' + calendarReferenceAnchor,
  );
  await expect(page.locator(`#${calendarReferenceAnchor}`)).toHaveAttribute('open', '');
  await expect(page.locator('#history-file')).toBeFocused();
  await expect(page.locator('#history-file')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 6 de 7');
  await page.reload();
  await expect(page.locator('#history-file')).toBeFocused();
});

test('read-only reference entries focus the disclosure instead of the disabled upload control', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor-reviewer')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/historico');
  await expect(page.locator('#history-file')).toBeDisabled();
  await expect(page.locator('#open-history')).toBeFocused();
  await expect(page.locator('#history-list')).toContainText('anterior.pdf');
});
