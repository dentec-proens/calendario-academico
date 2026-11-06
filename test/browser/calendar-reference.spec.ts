import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';

for (const width of [1440, 390]) {
  test(`activities and campus dates share step 5, followed by the review at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'events');
    await expect(page.locator('#editor-section-title')).toHaveAccessibleName(
      'Passo 5 de 6: Atividades',
    );
    await expect(page.locator('#editor-section-title')).toContainText('Atividades');
    await expect(page.locator('#activity-checklist')).toBeVisible();
    await expect(page.locator('#event-list')).toBeVisible();
    await expect(page.locator('#editor-continue')).toHaveText('Continuar para conferir e enviar');
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
    await expect(page).toHaveURL(
      /\/atividades\?busca=referencia&aba=anterior&atividadeSituacao=all$/,
    );
    await expect(page.locator('#activity-checklist')).toBeVisible();
    await expect(page.locator('#editor-section-title')).toHaveAccessibleName(
      'Passo 5 de 6: Atividades',
    );
    await page.reload();
    // The former "all" situation is the default view now.
    await expect(page.locator('#activity-pendency-todas')).toBeChecked();
    await expect(page.locator('#activity-status')).toHaveValue('');
  });
}

test('old reference tab and fragment fall back to the resolution activities', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(
    origin + '/calendarios/synthetic-calendar/atividades?aba=anterior#calendario-anterior',
  );
  await expect(page.locator('#activity-checklist')).toBeVisible();
});

for (const section of ['eventos', 'atividades-campus']) {
  test(`the former ${section} step has no alias`, async ({ page, fixtureServer }) => {
    const origin = new URL(await fixtureServer('editor')).origin;
    await page.goto(origin + `/calendarios/synthetic-calendar/${section}?aba=eventos`);
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  });
}
