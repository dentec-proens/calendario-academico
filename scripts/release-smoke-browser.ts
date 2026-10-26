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

/** Restrict protection credentials to the immutable deployment, including redirects. */
export async function protectCandidate(
  page: Page,
  url: string,
  protection: { name: string; value: string },
) {
  const origin = new URL(url).origin;
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) return route.continue();
    // route.continue headers also follow redirects. Fetch only this hop and
    // fulfill it so the browser's next request is independently scoped.
    const response = await route.fetch({
      headers: { ...request.headers(), [protection.name]: protection.value },
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
}
