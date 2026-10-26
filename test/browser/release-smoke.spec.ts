import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from './test.ts';
import { protectCandidate, verifyCalendarPdf } from '../../scripts/release-smoke-browser.ts';

test('production smoke downloads a PDF through the actual calendar preview control', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.route('**/smoke-reference.pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7\n%%EOF\n' }),
  );
  await page.evaluate(async () => {
    const modulePath = '/test/fixtures/editor-event-drafts-client.ts';
    const module = (await import(modulePath)) as { convex: { action: () => Promise<unknown> } };
    module.convex.action = () =>
      Promise.resolve({ url: new URL('/smoke-reference.pdf', location.origin).href });
  });
  page.setDefaultTimeout(2000);
  await verifyCalendarPdf(page);
  await expect(page.locator('#message')).toContainText('PDF gerado');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});

test('candidate protection never reaches another origin through a redirect', async ({ page }) => {
  const headers: Array<string | undefined> = [];
  const external = createServer((request, response) => {
    headers.push(request.headers['x-vercel-trusted-oidc-idp-token'] as string | undefined);
    response.setHeader('Content-Type', 'text/html');
    response.end('<html><body>External</body></html>');
  });
  const candidate = createServer((request, response) => {
    headers.push(request.headers['x-vercel-trusted-oidc-idp-token'] as string | undefined);
    response.writeHead(302, {
      Location: `http://127.0.0.1:${(external.address() as AddressInfo).port}/`,
    });
    response.end();
  });
  try {
    await new Promise<void>((resolve) => external.listen(0, '127.0.0.1', resolve));
    await new Promise<void>((resolve) => candidate.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(candidate.address() as AddressInfo).port}`;
    await protectCandidate(page, url, {
      name: 'x-vercel-trusted-oidc-idp-token',
      value: 'synthetic-oidc',
    });
    await page.goto(url);
    await expect(page.locator('body')).toContainText('External');
    expect(headers[0]).toBe('synthetic-oidc');
    expect(headers.slice(1).every((value) => value === undefined)).toBe(true);
  } finally {
    await Promise.all(
      [external, candidate].map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
    );
  }
});
