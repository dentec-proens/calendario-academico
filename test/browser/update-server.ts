import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { staticPortal } from '../../src/app-server.ts';
import type { Cleanup } from './test.ts';

/** Production route tree and bundler with local services and observable build/state probes. */
export async function startUpdateServer(cleanup: Cleanup, entry = 'editor') {
  const directory = await mkdtemp(join(tmpdir(), 'portal-update-'));
  await mkdir(resolve('test/.temp'), { recursive: true });
  const source = await mkdtemp(resolve('test/.temp/update-'));
  cleanup(() => rm(directory, { recursive: true, force: true }));
  cleanup(() => rm(source, { recursive: true, force: true }));
  await writeFile(
    join(source, 'index.html'),
    `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/test/fixtures/${entry}.ts"></script></body></html>`,
  );
  const root = resolve('.');
  for (const name of ['a', 'b']) {
    const output = join(directory, name);
    await build({
      root,
      logLevel: 'silent',
      define: {
        'import.meta.env.VITE_CONVEX_URL': JSON.stringify('https://synthetic.convex.cloud'),
      },
      resolve: {
        alias: [
          {
            find: /^(?:\.\/client\.ts|.*\/shared\/convex\/client\.ts)$/,
            replacement: join(
              root,
              `test/fixtures/${entry === 'editor' ? 'editor-event-drafts-client' : entry === 'router-auth' ? 'router-auth-client' : 'portal-router-client'}.ts`,
            ),
          },
          {
            find: /^@convex-dev\/auth\/react$/,
            replacement: join(root, 'test/fixtures/router-auth-context.ts'),
          },
        ],
      },
      plugins: [
        {
          name: 'update-owner-probes',
          enforce: 'pre',
          transform(code, id) {
            if (id.endsWith('/web/style.css'))
              return code + '\n:root { --update-fixture-build: ' + name + '; }';
            if (id.endsWith('/EventPanel.tsx'))
              return code.replace(
                'export default function EventPanel() {',
                'export default function EventPanel() { if (window.updatePanelFault) throw new Error("Synthetic panel failure");',
              );
            if (id.endsWith('/CalendarEditorProvider.tsx'))
              return code.replace(
                'const controller = useSession(record);',
                'const controller = useSession(record); window.updateEditor = controller.session;',
              );
            if (id.endsWith('/forms/drafts.tsx'))
              return code.replace(
                'return <DraftContext.Provider',
                'window.updateDrafts = drafts; return <DraftContext.Provider',
              );
          },
        },
      ],
      build: { outDir: output, rolldownOptions: { input: join(source, 'index.html') } },
    });
    await copyFile(
      join(output, 'test/.temp', source.split('/').at(-1)!, 'index.html'),
      join(output, 'index.html'),
    );
  }
  let selected = 'a';
  let manifest: 'a' | 'b' | undefined;
  const delays = new Map<string, { wait: Promise<void>; arrived: () => void }>();
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fixture.invalid').pathname;
    const directoryForRequest = join(
      directory,
      path === '/version.json' && manifest ? manifest : selected,
    );
    const delay = delays.get(path);
    if (delay) {
      delays.delete(path);
      delay.arrived();
      void delay.wait.then(() => staticPortal(directoryForRequest)(request, response));
    } else staticPortal(directoryForRequest)(request, response);
  });
  cleanup(() => new Promise<void>((done) => server.close(() => done())));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    delayNext(path: string) {
      let release!: () => void;
      let arrived!: () => void;
      const arrival = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      delays.set(path, { wait, arrived });
      cleanup(release);
      return { arrival, release };
    },
    selectManifest: (name: 'a' | 'b') => {
      manifest = name;
    },
    select: (name: 'a' | 'b') => {
      selected = name;
    },
    version: async (name: 'a' | 'b') =>
      JSON.parse(await readFile(join(directory, name, 'version.json'), 'utf8')) as {
        buildId: string;
      },
  };
}
