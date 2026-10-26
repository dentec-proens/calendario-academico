import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from './test.ts';
import type { Cleanup } from './test.ts';
import {
  assertReleaseOrigin,
  routeReleaseDeployment,
  verifyCalendarPdf,
} from '../../scripts/release-smoke-browser.ts';

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

async function serve(server: Server, cleanup: Cleanup) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const protection = { name: 'x-vercel-trusted-oidc-idp-token', value: 'synthetic-oidc' };

for (const width of [390, 1440])
  test(`immutable editor downloads a CORS-protected PDF at the canonical origin (${width}px)`, async ({
    page,
    fixtureServer,
    cleanup,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const fixture = new URL(await fixtureServer('editor'));
    const canonical = await serve(
      createServer((_request, response) => response.end('Public version is unchanged')),
      cleanup,
    );
    // A fulfilled navigation has no loopback address-space classification.
    // Permit only this test origin to reach its synthetic local backend; the
    // browser still enforces that backend's CORS policy (including the denial below).
    await page.context().grantPermissions(['local-network-access'], { origin: canonical });
    const assetCredentials: Array<string | undefined> = [];
    const candidate = await serve(
      createServer((request, response) => {
        void (async () => {
          assetCredentials.push(request.headers[protection.name] as string | undefined);
          if (request.headers[protection.name] !== protection.value) {
            response.writeHead(401);
            response.end();
            return;
          }
          try {
            const asset = await fetch(fixture.origin + (request.url ?? '/'));
            response.writeHead(asset.status, {
              'Content-Type': asset.headers.get('content-type') ?? 'text/plain',
            });
            response.end(Buffer.from(await asset.arrayBuffer()));
          } catch {
            response.writeHead(502);
            response.end();
          }
        })();
      }),
      cleanup,
    );
    const downloads: Array<{ origin?: string; credential?: string }> = [];
    const pdf = await serve(
      createServer((request, response) => {
        downloads.push({
          origin: request.headers.origin,
          credential: request.headers[protection.name] as string | undefined,
        });
        // Exactly the production policy: allow the canonical origin only. The
        // helper must not relax this response or proxy this third-party request.
        response.writeHead(200, {
          'Content-Type': 'application/pdf',
          ...(request.url === '/calendar.pdf' ? { 'Access-Control-Allow-Origin': canonical } : {}),
        });
        response.end('%PDF-1.7\n%%EOF\n');
      }),
      cleanup,
    );
    await routeReleaseDeployment(page, {
      portalUrl: canonical,
      deploymentUrl: candidate,
      protection,
    });
    await page.goto(canonical + fixture.pathname + fixture.search);
    assertReleaseOrigin(page, canonical);
    await expect(page.locator('#record-title')).toBeVisible();
    await page.evaluate(async (url) => {
      const modulePath = '/test/fixtures/editor-event-drafts-client.ts';
      const module = (await import(modulePath)) as { convex: { action: () => Promise<unknown> } };
      module.convex.action = () => Promise.resolve({ url });
    }, pdf + '/calendar.pdf');
    const denied = await page.evaluate(
      (url) =>
        fetch(url).then(
          () => false,
          () => true,
        ),
      pdf + '/forbidden.pdf',
    );
    expect(denied).toBe(true);
    await verifyCalendarPdf(page);
    expect(new URL(page.url()).origin).toBe(canonical);
    expect(downloads).toEqual([
      { origin: canonical, credential: undefined },
      { origin: canonical, credential: undefined },
    ]);
    expect(assetCredentials.length).toBeGreaterThan(1);
    expect(assetCredentials.every((value) => value === protection.value)).toBe(true);
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    expect(await (await page.request.get(canonical)).text()).toBe('Public version is unchanged');
  });

test('deployment protection never reaches another origin through a redirect', async ({
  page,
  cleanup,
}) => {
  const credentials: Array<string | undefined> = [];
  const external = await serve(
    createServer((request, response) => {
      credentials.push(request.headers[protection.name] as string | undefined);
      response.end('<html><body>External</body></html>');
    }),
    cleanup,
  );
  const candidate = await serve(
    createServer((request, response) => {
      credentials.push(request.headers[protection.name] as string | undefined);
      response.writeHead(302, { Location: external });
      response.end();
    }),
    cleanup,
  );
  let publicRequests = 0;
  const canonical = await serve(
    createServer((_request, response) => {
      publicRequests++;
      response.end('Public');
    }),
    cleanup,
  );
  await routeReleaseDeployment(page, {
    portalUrl: canonical,
    deploymentUrl: candidate,
    protection,
  });
  await expect(page.goto(canonical)).rejects.toThrow();
  expect(credentials).toEqual([protection.value]);
  expect(publicRequests).toBe(0);
  const escaped = await page.context().newPage();
  await escaped.goto(external);
  expect(credentials.at(-1)).toBeUndefined();
  expect(() => assertReleaseOrigin(escaped, canonical)).toThrow(/origem canônica/);
});

test('same-deployment redirects cannot fall through to the public build', async ({
  page,
  cleanup,
}) => {
  let candidate = '';
  const credentials: Array<string | undefined> = [];
  candidate = await serve(
    createServer((request, response) => {
      credentials.push(request.headers[protection.name] as string | undefined);
      if (request.url === '/') {
        response.writeHead(302, { Location: candidate + '/landing?confirmed=1' });
        response.end();
      } else response.end('<html><body>Candidate landing</body></html>');
    }),
    cleanup,
  );
  let publicRequests = 0;
  const canonical = await serve(
    createServer((_request, response) => {
      publicRequests++;
      response.end('Public');
    }),
    cleanup,
  );
  await routeReleaseDeployment(page, {
    portalUrl: canonical,
    deploymentUrl: candidate,
    protection,
  });
  await expect(page.goto(canonical)).rejects.toThrow();
  expect(publicRequests).toBe(0);
  expect(credentials).toEqual([protection.value]);
});

test('candidate HTTP and transport failures never fall back to the public build', async ({
  page,
  cleanup,
}) => {
  let publicRequests = 0;
  const canonical = await serve(
    createServer((_request, response) => {
      publicRequests++;
      response.end('Public');
    }),
    cleanup,
  );
  const server = createServer((_request, response) => {
    response.writeHead(503);
    response.end('Candidate failed');
  });
  const candidate = await serve(server, cleanup);
  await routeReleaseDeployment(page, { portalUrl: canonical, deploymentUrl: candidate });
  const response = await page.goto(canonical);
  expect(response?.status()).toBe(503);
  await expect(page.locator('body')).toContainText('Candidate failed');
  // Close the same server to exercise an actual connection failure. Resource
  // cleanup remains idempotent after the explicit shutdown.
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await expect(page.goto(canonical)).rejects.toThrow();
  expect(publicRequests).toBe(0);
});
