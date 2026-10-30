import { test, expect } from './test.ts';

test('consulta de documentos com links externos e gerenciamento recolhido', async ({
  page,
  fixtureServer,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/documentos?ano=2027');
  await expect(page.locator('#document-list li')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Abrir PDF em outra aba' })).toHaveCount(2);
  await expect(page).toHaveScreenshot('documentos-lista.png', { fullPage: true });
});
