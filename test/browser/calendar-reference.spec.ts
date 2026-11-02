import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';

for (const width of [1440, 390]) {
  test(`resolution and campus activities are consecutive steps at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'events');
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 5 de 7');
    await expect(page.locator('#editor-section-title')).toHaveText('Atividades da Resolução');
    await expect(page.locator('#activity-checklist')).toBeVisible();
    await expect(page.locator('#editor-continue')).toHaveText(
      'Continuar para atividades do campus',
    );
    await page.locator('#editor-continue').click();
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 6 de 7');
    await expect(page.locator('#editor-section-title')).toHaveText('Atividades do Campus');
    await expect(page.locator('#event-list')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const fixture of ['editor', 'editor-reviewer'] as const) {
  test(`legacy history URLs open step 5 and preserve filters for ${fixture}`, async ({
    page,
    fixtureServer,
  }) => {
    const origin = new URL(await fixtureServer(fixture)).origin;
    await page.goto(
      origin +
        '/calendarios/synthetic-calendar/historico?busca=referencia&aba=anterior&atividadeSituacao=all',
    );
    await expect(page).toHaveURL(/\/eventos\?busca=referencia&atividadeSituacao=all$/);
    await expect(page.locator('#activity-checklist')).toBeVisible();
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 5 de 7');
    await page.reload();
    // The former "all" situation is the default view now.
    await expect(page.locator('#activity-view-todas')).toBeChecked();
    await expect(page.locator('#activity-status')).toHaveValue('');
  });
}

test('old reference tab and fragment fall back to the resolution activities', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(
    origin + '/calendarios/synthetic-calendar/eventos?aba=anterior#calendario-anterior',
  );
  await expect(page.locator('#activity-checklist')).toBeVisible();
});

for (const section of ['eventos', 'historico']) {
  test(`the former campus tab link of ${section} opens the campus activities step`, async ({
    page,
    fixtureServer,
  }) => {
    const origin = new URL(await fixtureServer('editor')).origin;
    await page.goto(
      origin + `/calendarios/synthetic-calendar/${section}?aba=eventos&atividadeBusca=prazo`,
    );
    await expect(page).toHaveURL(/\/atividades-campus\?atividadeBusca=prazo$/);
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 6 de 7');
    await expect(page.locator('#event-list')).toBeVisible();
  });
}
