import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { test, expect } from './test.ts';
import type { Cleanup } from './test.ts';
import type {} from '../fixtures/router-boundaries.ts';

async function startDocuments(cleanup: Cleanup) {
  const server = await createServer({
    configFile: false,
    envDir: false,
    root: fileURLToPath(new URL('../../', import.meta.url)),
    cacheDir: 'node_modules/.vite-playwright-router-boundaries',
    oxc: { jsx: { runtime: 'automatic' } },
    optimizeDeps: {
      entries: [],
      include: ['react', 'react-dom/client', 'react/jsx-runtime', '@tanstack/react-router'],
    },
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    plugins: [
      {
        name: 'synthetic-router-documents',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (!request.headers.accept?.includes('text/html')) {
              next();
              return;
            }
            response.setHeader('Content-Type', 'text/html');
            response.end(
              '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/test/fixtures/router-boundaries.ts"></script></body></html>',
            );
          });
        },
      },
    ],
  });
  cleanup(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address !== 'object')
    throw new Error('Documentos sintéticos indisponíveis.');
  return `http://127.0.0.1:${address.port}`;
}

for (const control of ['link', 'action']) {
  test(`${control} navigation preserves the original document and URL when leaving a draft is canceled`, async ({
    page,
    cleanup,
  }) => {
    const origin = await startDocuments(cleanup);
    const initial = origin + '/calendarios/calendar-a/eventos';
    for (const [destination, path, documentName] of [
      ['logs', '/logs', 'logs.html'],
      ['calendar', '/calendarios/calendar-b/eventos', 'editor.html'],
    ]) {
      await page.goto(initial);
      await expect(page.getByRole('heading', { name: 'Editor calendar-a' })).toBeVisible();
      const originalDocument = await page.evaluate(() => window.routerDocumentId);
      await page.locator('#draft').fill('Alteração ainda não salva');
      const dialog = page.waitForEvent('dialog');
      const click = page.locator(`#${destination}-${control}`).click();
      const confirmation = await dialog;
      expect(confirmation.type()).toBe('beforeunload');
      await confirmation.dismiss();
      await click;
      await expect(page).toHaveURL(initial);
      await expect(page.locator('#draft')).toHaveValue('Alteração ainda não salva');
      expect(await page.evaluate(() => window.routerDocumentId)).toBe(originalDocument);
      await page.locator('#draft').fill('');
      await page.locator(`#${destination}-${control}`).click();
      await expect(page).toHaveURL(origin + path);
      await expect(page.locator('main')).toHaveAttribute('data-document', documentName);
      await expect
        .poll(() => page.evaluate(() => window.routerDocumentId))
        .not.toBe(originalDocument);
    }
  });
}
