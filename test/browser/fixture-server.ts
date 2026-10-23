import { readFile } from 'node:fs/promises';
import { createServer as createSocketServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type { Cleanup } from './test.ts';

type Fixture =
  | 'portal'
  | 'review'
  | 'editor'
  | 'editor-confirmation'
  | 'editor-reviewer'
  | 'confirmation'
  | 'online-users';

type FixtureDefinition = {
  path: string;
  entry?: string;
  client?: string;
};

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures: Record<Fixture, FixtureDefinition> = {
  portal: { path: '/__portal', entry: 'portal-navigation' },
  review: { path: '/__review', entry: 'review-ui', client: 'review-ui-client' },
  editor: { path: '/__editor', entry: 'editor', client: 'editor-event-drafts-client' },
  'editor-confirmation': {
    path: '/__editor',
    entry: 'editor',
    client: 'editor-client',
  },
  'editor-reviewer': {
    path: '/__editor',
    entry: 'editor',
    client: 'editor-reviewer-client',
  },
  confirmation: { path: '/test/fixtures/confirmation.html' },
  'online-users': { path: '/test/fixtures/online-users.html' },
};

async function startServer(
  name: string,
  fixture: FixtureDefinition,
  cleanup: Cleanup,
  convexUrl = 'https://synthetic.convex.cloud',
) {
  let html: string | undefined;
  if (fixture.path === '/__editor') {
    html = (await readFile(join(root, 'web/editor.html'), 'utf8'))
      .replaceAll('href="/style.css"', 'href="/web/style.css"')
      .replaceAll('href="/portal.css"', 'href="/web/portal.css"')
      .replace('src="/native/editor.tsx"', `src="/test/fixtures/${fixture.entry}.ts"`);
  } else if (fixture.entry) {
    html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"><main></main></div><script type="module" src="/test/fixtures/${fixture.entry}.ts"></script></body></html>`;
  }
  const server = await createServer({
    configFile: false,
    envDir: false,
    root,
    cacheDir: `node_modules/.vite-playwright-${name}`,
    define: { 'import.meta.env.VITE_CONVEX_URL': JSON.stringify(convexUrl) },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'lucide-react',
        'convex/react',
        'convex/server',
        '@convex-dev/auth/react',
      ],
    },
    oxc: { jsx: { runtime: 'automatic' } },
    resolve: {
      alias: fixture.client
        ? [
            {
              find: /^(?:\.?\.\/native\/client\.ts|.*\/web\/native\/client\.ts)$/,
              replacement: join(root, `test/fixtures/${fixture.client}.ts`),
            },
          ]
        : [],
    },
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    plugins: html
      ? [
          {
            name: `playwright-${name}`,
            configureServer(server) {
              server.middlewares.use(fixture.path, (_request, response) => {
                response.setHeader('Content-Type', 'text/html');
                response.end(html);
              });
            },
          },
        ]
      : [],
  });
  cleanup(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address !== 'object') throw new Error('Fixture server did not start');
  const origin = `http://127.0.0.1:${address.port}`;
  return { origin, url: origin + fixture.path };
}

/** Serve real UI and CSS with a named synthetic client, without deployment credentials. */
export async function startFixtureServer(fixture: Fixture, cleanup: Cleanup) {
  return (await startServer(fixture, fixtures[fixture], cleanup)).url;
}

/** Exercise connection failures against an unused loopback port, never a real deployment. */
export async function startBackendFixtureServer(cleanup: Cleanup) {
  const socket = createSocketServer();
  cleanup(() => {
    if (socket.listening) return new Promise<void>((resolve) => socket.close(() => resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  if (!address || typeof address !== 'object') throw new Error('Backend port was not assigned');
  await new Promise<void>((resolve, reject) => {
    socket.close((error) => (error ? reject(error) : resolve()));
  });
  const server = await startServer(
    'backend-availability',
    { path: '/test/fixtures/backend-availability.html' },
    cleanup,
    `http://127.0.0.1:${address.port}`,
  );
  return { ...server, backendPort: address.port };
}
