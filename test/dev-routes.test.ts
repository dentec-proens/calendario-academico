import { expect, test } from 'vitest';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { applicationPages } from '../vite.config.ts';

test('Vite serves direct application URLs and keeps unknown routes and assets as 404', async (t) => {
  const server = await createServer({
    configFile: false,
    envDir: false,
    root: fileURLToPath(new URL('../web/', import.meta.url)),
    appType: 'mpa',
    plugins: [applicationPages],
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  t.onTestFinished(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address !== 'object') throw new Error('Vite did not start');
  const origin = `http://127.0.0.1:${address.port}`;
  for (const path of [
    '/calendarios/novo',
    '/documentos',
    '/revisoes/calendar-a',
    '/eventos-institucionais/event-a/editar',
  ]) {
    const response = await fetch(origin + path);
    expect(response.status, path).toBe(200);
    expect(await response.text()).toContain('/portal/main.tsx');
  }
  const editor = await fetch(origin + '/calendarios/calendar-a/historico');
  expect(editor.status).toBe(200);
  expect(await editor.text()).toContain('/native/editor.tsx');
  for (const path of [
    '/portal',
    '/editor',
    '/ativar',
    '/api/status',
    '/not-a-route',
    '/assets/missing.js',
    '/calendarios/a/unknown',
  ]) {
    expect((await fetch(origin + path)).status, path).toBe(404);
  }
});
