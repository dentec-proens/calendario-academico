import { test, expect } from './test.ts';
import { syntheticPdf } from '../helpers/synthetic-pdf.ts';
import type {} from '../fixtures/portal-router-client.ts';

// The full Chromium includes its native PDF viewer; headless shell forces downloads.
test.use({ channel: 'chromium' });

for (const width of [1440, 390]) {
  test(`abrir PDF em outra aba pelo teclado preserva a lista e os filtros em ${width}px`, async ({
    page,
    context,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await context.route('**/__synthetic-document.pdf', (route) =>
      route.fulfill({ contentType: 'application/pdf', body: syntheticPdf() }),
    );
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/documentos?ano=2027&situacao=vigente');
    const link = page.getByRole('link', { name: 'Abrir PDF em outra aba' });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('href', '/documentos/document-1/abrir');
    await link.focus();
    const popupPromise = page.waitForEvent('popup');
    await page.keyboard.press('Enter');
    const popup = await popupPromise;
    await expect(popup).toHaveURL(origin + '/__synthetic-document.pdf');
    await expect(page).toHaveURL(origin + '/documentos?ano=2027&situacao=vigente');
    await expect(page.locator('#document-year-filter')).toHaveValue('2027');
    await expect(page.locator('#document-status-filter')).toHaveValue('vigente');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await popup.close();
    await expect(link).toBeFocused();
  });
}

test('ações de vigência ficam recolhidas e arquivar exige confirmação', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/documentos');
  const draft = page.locator('#document-list li').filter({ hasText: 'Documento rascunho' });
  await expect(draft.getByRole('button', { name: 'Definir como vigente' })).toBeHidden();
  await draft.getByText('Gerenciar', { exact: true }).click();
  await expect(draft.getByRole('button', { name: 'Definir como vigente' })).toBeDisabled();
  await draft.getByRole('checkbox').check();
  await draft.getByRole('button', { name: 'Definir como vigente' }).click();
  await expect(page.locator('#document-message')).toContainText('Vigência atualizada');
  const current = page.locator('#document-list li').filter({ hasText: 'Documento vigente' });
  await current.getByText('Gerenciar', { exact: true }).click();
  await current.getByRole('button', { name: 'Retirar de vigência' }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('preservado no histórico');
  await confirmation.getByRole('button', { name: 'Cancelar' }).click();
  expect(await page.evaluate(() => window.portalRouterTest.mutations)).toHaveLength(1);
  await current.getByRole('button', { name: 'Retirar de vigência' }).click();
  await confirmation.getByRole('button', { name: 'Retirar de vigência' }).click();
  await expect.poll(() => page.evaluate(() => window.portalRouterTest.mutations.length)).toBe(2);
});

test('original indisponível não oferece link e mantém restauração para ADMIN', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/documentos?missing-document=1');
  const missing = page.locator('#document-list li').filter({ hasText: 'Documento rascunho' });
  await expect(missing.getByRole('link', { name: 'Abrir PDF em outra aba' })).toHaveCount(0);
  await expect(missing).toContainText('aguardando restauração');
  await missing.getByText('Gerenciar', { exact: true }).click();
  await expect(missing.getByRole('button', { name: 'Restaurar PDF original' })).toBeVisible();
});

test('falha ao obter o link permite tentar novamente na aba de abertura', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.goto(origin + '/documentos/document-missing/abrir');
  await expect(page.getByRole('alert')).toContainText('Documento não encontrado.');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect.poll(() => page.evaluate(() => window.portalRouterTest.mutations.length)).toBe(2);
  await expect(page.getByRole('alert')).toContainText('Documento não encontrado.');
});
