import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';

for (const width of [1440, 390]) {
  test(`activity search accepts accents and unaccented text at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'events');
    await page.locator('#activity-status').selectOption('all');
    const search = page.getByRole('searchbox', { name: 'Buscar atividade' });
    const enrolment = page.locator('[data-activity-row="enrolment-0"]');
    for (const query of ['matrícula', 'matri\u0301cula', 'MATRICULA']) {
      await search.fill('');
      await search.pressSequentially(query);
      await expect(search).toHaveValue(query);
      await expect(enrolment, `Busca: ${query}`).toBeVisible();
      await expect(page.locator('[data-activity-row="admission-notice-0"]')).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get('atividadeBusca')).toBe(query);
    }
    await page.reload();
    await expect(search).toHaveValue('MATRICULA');
    await expect(enrolment).toBeVisible();
    await search.fill('atividade inexistente');
    await expect(page.locator('#activity-empty')).toBeVisible();
    await search.fill('');
    await expect(enrolment).toBeVisible();
  });
}
