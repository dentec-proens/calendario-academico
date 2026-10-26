import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from 'vite';
import { test, expect } from './test.ts';
import type { Cleanup } from './test.ts';
import type {} from '../fixtures/router-auth-client.ts';

async function startAuthServer(cleanup: Cleanup) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const html =
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/test/fixtures/router-auth.ts"></script></body></html>';
  const server = await createServer({
    configFile: false,
    envDir: false,
    root,
    cacheDir: 'node_modules/.vite-playwright-router-auth',
    oxc: { jsx: { runtime: 'automatic' } },
    optimizeDeps: {
      entries: [],
      include: [
        'react',
        'react-dom/client',
        'react/jsx-runtime',
        '@tanstack/react-router',
        '@tanstack/react-form',
        '@base-ui/react/field',
      ],
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: [
        {
          find: /^@convex-dev\/auth\/react$/,
          replacement: join(root, 'test/fixtures/router-auth-context.ts'),
        },
        {
          find: /^(?:\.\/client\.ts|.*\/shared\/convex\/client\.ts)$/,
          replacement: join(root, 'test/fixtures/router-auth-client.ts'),
        },
      ],
    },
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    plugins: [
      {
        name: 'synthetic-router-auth',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (!request.headers.accept?.includes('text/html')) {
              next();
              return;
            }
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          });
        },
      },
    ],
  });
  cleanup(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address !== 'object')
    throw new Error('Fixture de autenticação indisponível.');
  return `http://127.0.0.1:${address.port}`;
}

test('unauthenticated editor and audit URLs return to login with the requested destination', async ({
  page,
  cleanup,
}) => {
  const origin = await startAuthServer(cleanup);
  for (const destination of ['/calendarios/calendar-a/historico', '/logs']) {
    await page.goto(origin + destination);
    await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
    const url = new URL(page.url());
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('retorno')).toBe(destination);
  }
});

test('public activation removes the fragment and submits its token without requiring login', async ({
  page,
  cleanup,
}) => {
  const origin = await startAuthServer(cleanup);
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) remoteRequests.push(request.url());
    expect(request.url()).not.toContain('private-invitation');
  });
  await page.goto(origin + '/ativar-conta#token=private-invitation');
  await expect(page.locator('#activation-form')).toBeVisible();
  await expect(page).toHaveURL(origin + '/ativar-conta');
  await page.locator('#activation-email').fill('convite@example.invalid');
  await page.locator('#activation-password').fill('senha-sintetica-2027');
  await page.locator('#activation-confirm').fill('senha-sintetica-2027');
  await page.locator('#activate-button').click();
  await expect(page.locator('#invite-message')).toContainText('Conta ativada');
  expect(await page.evaluate(() => window.routerAuthTest.acceptedToken)).toBe('private-invitation');
  expect(remoteRequests).toEqual([]);
});

test('public password reset removes the fragment and retains the token for submission', async ({
  page,
  cleanup,
}) => {
  const origin = await startAuthServer(cleanup);
  await page.goto(origin + '/recuperar-senha#token=private-reset');
  await expect(page.locator('#reset-form')).toBeVisible();
  await expect(page).toHaveURL(origin + '/recuperar-senha');
  await page.locator('#password').fill('senha-sintetica-2027');
  await page.locator('#confirmation').fill('senha-sintetica-2027');
  await page.locator('#reset-form button').click();
  await expect(page.getByText('Senha sintética atualizada.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.routerAuthTest.resetToken)).toBe('private-reset');
  await expect(page.locator('#reset-form')).toBeHidden();
});
