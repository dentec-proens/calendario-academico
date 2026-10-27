import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';

for (const width of [1440, 390]) {
  test(`step 6 contains only resolution and campus activities at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'events');
    await expect(page.getByRole('tab')).toHaveCount(2);
    await expect(
      page.getByRole('tab', { name: /Atividades\/Eventos da Resolução/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /Atividades\/Eventos do Campus/ })).toBeVisible();
    await expect(page.locator('#history-form, #history-file, [data-tab="anterior"]')).toHaveCount(
      0,
    );
    await expect(page.locator('#activity-checklist')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const fixture of ['editor', 'editor-reviewer'] as const) {
  test(`legacy history URLs open step 6 and preserve filters for ${fixture}`, async ({
    page,
    fixtureServer,
  }) => {
    const origin = new URL(await fixtureServer(fixture)).origin;
    await page.goto(
      origin +
        '/calendarios/synthetic-calendar/historico?busca=referencia&aba=anterior&atividadeSituacao=all',
    );
    await expect(page).toHaveURL(/\/eventos\?busca=referencia&atividadeSituacao=all$/);
    await expect(page.locator('[data-tab="atividades"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 5 de 6');
    await expect(page.locator('#history-file')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#activity-status')).toHaveValue('all');
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
  await expect(page.locator('[data-tab="atividades"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#activity-checklist')).toBeVisible();
  await expect(page.locator('#history-file')).toHaveCount(0);
});
