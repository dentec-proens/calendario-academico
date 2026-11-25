import { createServer as createSocketServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type { Cleanup } from './test.ts';

type Fixture =
  | 'portal'
  | 'router-auth'
  | 'review'
  | 'review-session'
  | 'editor'
  | 'editor-confirmation'
  | 'editor-reviewer'
  | 'editor-reviewer-saturdays'
  | 'editor-other-campus'
  | 'editor-mixed-offers'
  | 'editor-offer-without-periods'
  | 'editor-session'
  | 'confirmation'
  | 'notice'
  | 'online-users';

/**
 * `autosave: 'real'` keeps the application's 1.5 s autosave wait, for tests about what happens
 * inside it; every other server saves 100 ms after the last change, so tests don't wait for it.
 */
export type FixtureOptions = { autosave?: 'real' };
export type FixtureServer = (fixture: Fixture, options?: FixtureOptions) => Promise<string>;

const fixtureAutosaveDelay = 100;

type FixtureDefinition = {
  path: string;
  entry?: string;
  client?: string;
  auth?: string;
};

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures: Record<Fixture, FixtureDefinition> = {
  portal: { path: '/__portal', entry: 'portal-navigation', client: 'portal-router-client' },
  'router-auth': {
    path: '/__auth',
    entry: 'router-auth',
    client: 'router-auth-client',
    auth: 'router-auth-context',
  },
  review: { path: '/__review', entry: 'review-ui', client: 'review-ui-client' },
  'review-session': {
    path: '/__review-session',
    entry: 'review-session',
    client: 'review-session-client',
    auth: 'review-session-auth',
  },
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
  'editor-reviewer-saturdays': {
    path: '/__editor',
    entry: 'editor',
    client: 'editor-reviewer-saturdays-client',
  },
  'editor-other-campus': {
    path: '/__editor',
    entry: 'editor',
    client: 'editor-other-campus-client',
  },
  'editor-mixed-offers': {
    path: '/__editor',
    entry: 'editor',
    client: 'editor-mixed-offers-client',
  },
  'editor-offer-without-periods': {
    path: '/__editor',
    entry: 'editor',
    client: 'editor-offer-without-periods-client',
  },
  'editor-session': {
    path: '/__editor-session',
    entry: 'editor-session',
    client: 'editor-session-client',
    auth: 'editor-session-auth',
  },
  confirmation: { path: '/test/fixtures/confirmation.html' },
  notice: { path: '/test/fixtures/notice.html' },
  'online-users': { path: '/test/fixtures/online-users.html' },
};

async function startServer(
  name: string,
  fixture: FixtureDefinition,
  cleanup: Cleanup,
  convexUrl = 'https://synthetic.convex.cloud',
  // `null` keeps the application's own wait; an omitted argument takes the fixture wait.
  autosaveDelay: number | null = fixtureAutosaveDelay,
) {
  let html: string | undefined;
  if (fixture.entry) {
    html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"><main></main></div><script type="module" src="/test/fixtures/${fixture.entry}.ts"></script></body></html>`;
  }
  const server = await createServer({
    configFile: false,
    envDir: false,
    root,
    cacheDir: `node_modules/.vite-playwright-${name}-worker-${process.env.TEST_WORKER_INDEX ?? '0'}`,
    define: {
      'import.meta.env.VITE_CONVEX_URL': JSON.stringify(convexUrl),
      ...(autosaveDelay === null
        ? {}
        : { 'import.meta.env.DENTEC_FIXTURE_AUTOSAVE_DELAY': JSON.stringify(autosaveDelay) }),
    },
    optimizeDeps: {
      entries: [],
      // Keep React's optimized module graph stable for the entire worker.
      // Discovering another dependency after navigation can replace shared
      // chunks and mix two React instances in an already loaded page.
      noDiscovery: true,
      exclude: fixture.auth ? ['@convex-dev/auth/react'] : [],
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'lucide-react',
        'convex/react',
        'convex/server',
        '@noble/hashes/sha2.js',
        '@noble/hashes/utils.js',
        ...(!fixture.auth ? ['@convex-dev/auth/react'] : []),
        '@tanstack/react-router',
        '@tanstack/react-form',
        '@base-ui/react/field',
        '@base-ui/react/button',
        '@base-ui/react/dialog',
        '@base-ui/react/radio-group',
        '@base-ui/react/radio',
        '@base-ui/react/menu',
        '@daypicker/react',
        '@daypicker/react/locale',
        '@tanstack/react-devtools',
        '@tanstack/react-form-devtools',
        '@tanstack/react-router-devtools',
      ],
    },
    oxc: { jsx: { runtime: 'automatic' } },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: fixture.client
        ? [
            {
              find: /^(?:\.\/client\.ts|.*\/shared\/convex\/client\.ts)$/,
              replacement: join(root, `test/fixtures/${fixture.client}.ts`),
            },
            {
              find: /^@convex-dev\/auth\/react$/,
              replacement: join(root, `test/fixtures/${fixture.auth ?? 'router-auth-context'}.ts`),
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
              server.middlewares.use((request, response, next) => {
                const pathname = new URL(request.url ?? '/', 'http://fixture.invalid').pathname;
                // A synthetic document also serves its real application's deep links. Asset
                // requests still pass through Vite; no test contacts a remote deployment.
                const navigation =
                  request.headers.accept?.includes('text/html') && !/\.[^/]+$/.test(pathname);
                if (pathname !== fixture.path && !navigation) {
                  next();
                  return;
                }
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
export async function startFixtureServer(
  fixture: Fixture,
  cleanup: Cleanup,
  options: FixtureOptions = {},
) {
  const real = options.autosave === 'real';
  return (
    await startServer(
      real ? `${fixture}-real-autosave` : fixture,
      fixtures[fixture],
      cleanup,
      undefined,
      real ? null : fixtureAutosaveDelay,
    )
  ).url;
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
