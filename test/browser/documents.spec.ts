import { test, expect } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';
import { documentPdf } from '../fixtures/document-pdf.ts';
import type {} from '../fixtures/portal-router-client.ts';

for (const width of [1440, 390]) {
  test(`consultar PDF, paginar, ampliar e voltar aos filtros em ${width}px`, async ({
    page,
    cleanup,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/__synthetic-document.pdf', (route) =>
      route.fulfill({ contentType: 'application/pdf', body: documentPdf() }),
    );
    const origin = new URL(await startFixtureServer('portal', cleanup)).origin;
    await page.goto(origin + '/documentos?ano=2027&situacao=vigente');
    const trigger = page.getByRole('button', { name: 'Visualizar PDF' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const reader = page.getByRole('dialog', { name: 'Documento vigente' });
    await expect(reader).toBeVisible();
    await expect(reader.getByRole('button', { name: 'Voltar à lista' })).toBeFocused();
    await expect(reader.locator('canvas')).toBeVisible();
    await expect(reader.locator('.document-reader__stage')).toHaveAttribute('aria-busy', 'false');
    await reader.getByText('Texto da página 1', { exact: true }).click();
    await expect(reader.locator('.document-reader__text')).toContainText(
      'Diretrizes institucionais',
    );
    await reader.getByRole('button', { name: 'Próxima página' }).click();
    await expect(reader.locator('.document-reader__text')).toContainText(
      'Conferencia do calendario',
    );
    await expect(reader.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
    await reader.getByLabel('Zoom').selectOption('2');
    await expect(reader.locator('.document-reader__stage')).toHaveAttribute('aria-busy', 'false');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await expect(
      reader.getByRole('link', { name: 'Abrir PDF original em outra aba' }),
    ).toHaveAttribute('href', /^blob:/);
    const download = page.waitForEvent('download');
    await reader.getByRole('button', { name: 'Baixar cópia' }).click();
    expect((await download).suggestedFilename()).toBe('teste.pdf');
    await page.keyboard.press('Escape');
    await expect(reader).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(origin + '/documentos?ano=2027&situacao=vigente');
    await expect(page.locator('#document-year-filter')).toHaveValue('2027');
  });
}

test('ações de vigência ficam recolhidas e arquivar exige confirmação', async ({
  page,
  cleanup,
}) => {
  const origin = new URL(await startFixtureServer('portal', cleanup)).origin;
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

test('falha no arquivo permite fechar e tentar novamente; original ausente não abre o leitor', async ({
  page,
  cleanup,
}) => {
  const origin = new URL(await startFixtureServer('portal', cleanup)).origin;
  await page.route('**/__synthetic-document.pdf', (route) => route.fulfill({ status: 503 }));
  await page.goto(origin + '/documentos?missing-document=1');
  const missing = page.locator('#document-list li').filter({ hasText: 'Documento rascunho' });
  await expect(missing.getByRole('button', { name: 'Visualizar PDF' })).toBeDisabled();
  await expect(missing).toContainText('aguardando restauração');
  const current = page.locator('#document-list li').filter({ hasText: 'Documento vigente' });
  await current.getByRole('button', { name: 'Visualizar PDF' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Não foi possível exibir o PDF',
  );
  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await page.route('**/__synthetic-document.pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: documentPdf() }),
  );
  await current.getByRole('button', { name: 'Visualizar PDF' }).click();
  await expect(page.locator('.document-reader__stage')).toHaveAttribute('aria-busy', 'false');
});

test('fechar enquanto o PDF carrega impede que uma resposta tardia reabra o leitor', async ({
  page,
  cleanup,
}) => {
  const origin = new URL(await startFixtureServer('portal', cleanup)).origin;
  await page.goto(origin + '/documentos?role=CAMPUS');
  await expect(page.getByText('Gerenciar', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    window.portalRouterTest.deferNextMutation = true;
  });
  await page.getByRole('button', { name: 'Visualizar PDF' }).first().click();
  await expect
    .poll(() => page.evaluate(() => window.portalRouterTest.pendingMutation))
    .toBe('downloadDocument');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.portalRouterTest.resolvePendingMutation());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Visualizar PDF' }).first()).toBeFocused();
});
