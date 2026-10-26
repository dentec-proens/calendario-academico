import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

/** Exercise the same preview and download controls offered to a person in the editor. */
export async function verifyCalendarPdf(page: Page) {
  await page.locator('[data-view="calendar"]').click();
  await page.locator('#months').waitFor();
  console.log('Smoke: editor e visualização confirmados; aguardando PDF.');
  const [pdf] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByRole('button', { name: 'Baixar PDF', exact: true }).click(),
  ]).catch(async (cause: unknown) => {
    const message = await page
      .locator('#message')
      .textContent()
      .catch(() => '');
    throw new Error(`O smoke não recebeu o PDF. ${message ?? ''}`, { cause });
  });
  const path = await pdf.path();
  if (!path || !(await readFile(path)).subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw Error('O smoke não confirmou um PDF válido.');
}
