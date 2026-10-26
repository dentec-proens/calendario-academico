import { test, expect } from './test.ts';
import { documentPdf } from '../fixtures/document-pdf.ts';

test('consulta de documentos, gerenciamento recolhido e leitura de PDF', async ({
  page,
  fixtureServer,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  const origin = new URL(await fixtureServer('portal')).origin;
  await page.route('**/__synthetic-document.pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: documentPdf() }),
  );
  await page.goto(origin + '/documentos?ano=2027');
  await expect(page.locator('#document-list li')).toHaveCount(2);
  await expect(page).toHaveScreenshot('documentos-lista.png', { fullPage: true });
  await page.locator('[data-view-document="document-1"]').click();
  await expect(page.locator('.document-reader__stage')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('dialog')).toHaveScreenshot('documento-leitura.png');
});
