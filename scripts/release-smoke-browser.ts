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

/** Rehearse immutable build bytes at the final browser origin without changing DNS or CORS. */
export async function routeReleaseDeployment(
  page: Page,
  {
    portalUrl,
    deploymentUrl,
    protection,
  }: {
    portalUrl: string;
    deploymentUrl: string;
    protection?: { name: string; value: string };
  },
) {
  const portal = new URL(portalUrl),
    deployment = new URL(deploymentUrl);
  for (const url of [portal, deployment]) {
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw Error('A validação exige origens HTTP distintas, sem caminho ou credenciais.');
  }
  if (portal.origin === deployment.origin)
    throw Error('O deployment imutável deve diferir da origem pública.');
  await page.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== portal.origin) return route.fallback();
    const headers = { ...request.headers() };
    delete headers.host;
    if (protection) headers[protection.name] = protection.value;
    try {
      // Fetch exactly one hop. Backend and download requests bypass this
      // route and retain their original Origin and CORS response headers.
      const response = await route.fetch({
        url: deployment.origin + url.pathname + url.search,
        headers,
        maxRedirects: 0,
        timeout: 30_000,
      });
      // Playwright routes only the first hop of browser redirect chains. A
      // redirect could therefore hit the public build without interception.
      // Rehearsal must fail instead of silently validating another deployment.
      if (response.status() >= 300 && response.status() < 400 && response.headers().location) {
        console.error('Smoke: redirecionamento do deployment bloqueado.');
        await route.abort('failed');
        return;
      }
      await route.fulfill({ response });
    } catch {
      // Playwright transport errors can contain request headers. Abort without
      // logging credentials or falling back to the currently public build.
      console.error('Smoke: falha no transporte para o deployment conferido.');
      await route.abort('failed');
    }
  });
}

export function assertReleaseOrigin(page: Page, portalUrl: string) {
  if (new URL(page.url()).origin !== new URL(portalUrl).origin)
    throw Error('A validação saiu da origem canônica.');
}
