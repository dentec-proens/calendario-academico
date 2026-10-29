import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { retainFrontendAssets } from '../../scripts/frontend-assets.ts';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function build(files: Record<string, string>) {
  const directory = await mkdtemp(join(tmpdir(), 'frontend-assets-'));
  directories.push(directory);
  await mkdir(join(directory, 'assets'));
  for (const [path, bytes] of Object.entries(files)) await writeFile(join(directory, path), bytes);
  return directory;
}
function previous(directory: string, replace?: (path: string, bytes: Buffer) => Buffer) {
  return {
    origin: 'https://previous.invalid',
    fetcher: (async (input, init) => {
      expect(init?.redirect).toBe('error');
      const url = new URL(input instanceof Request ? input.url : input);
      expect(url.origin).toBe('https://previous.invalid');
      const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      try {
        const bytes = await readFile(join(directory, path));
        return new Response(new Uint8Array(replace ? replace(path, bytes) : bytes), {
          headers: { 'Content-Type': path.endsWith('.json') ? 'application/json' : 'text/plain' },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    }) satisfies typeof fetch,
  };
}

test('successive publications retain complete old graphs without replacing HTML or version discovery', async () => {
  const a = await build({
    'index.html': '<div id="root"></div><script src="/assets/index-AAAAAAAA.js"></script>',
    'version.json': '{"buildId":"a"}',
    'assets/index-AAAAAAAA.js': 'import("./issues-AAAAAAAA.js")',
    'assets/issues-AAAAAAAA.js':
      'import "./shared-AAAAAAAA.js"; const preloads = ["assets/review-AAAAAAAA.css"]; new URL("/assets/pdf-AAAAAAAA.mjs", import.meta.url)',
    'assets/shared-AAAAAAAA.js': 'export const a = 1;',
    'assets/review-AAAAAAAA.css':
      '.review { color: red; } @font-face { src: url(/assets/font-AAAAAAAA.ttf) }',
    'assets/font-AAAAAAAA.ttf': 'synthetic font',
    'assets/pdf-AAAAAAAA.mjs':
      'self.onmessage = () => {}; const defaultWorker = "./pdf.worker.mjs";',
  });
  const b = await build({
    'index.html': 'new b',
    'version.json': '{"buildId":"b"}',
    'assets/index-B.js': 'new b',
  });
  // Adoption is against a real pre-inventory graph, including lazy imports, CSS and a worker.
  await retainFrontendAssets(b, previous(a));
  expect(await readdir(join(b, 'assets'))).toHaveLength(7);
  expect(await readFile(join(b, 'index.html'), 'utf8')).toBe('new b');
  expect(await readFile(join(b, 'version.json'), 'utf8')).toBe('{"buildId":"b"}');
  const c = await build({ 'assets/index-C.js': 'new c' });
  await retainFrontendAssets(c, previous(b));
  expect(await readdir(join(c, 'assets'))).toHaveLength(8);
  expect(await readFile(join(c, 'assets/font-AAAAAAAA.ttf'), 'utf8')).toBe('synthetic font');
});

test('unavailable or corrupt old assets abort the build instead of dropping an older version', async () => {
  const a = await build({ 'assets/index-AAAAAAAA.js': 'old a' });
  await retainFrontendAssets(a);
  for (const corrupt of [true, false]) {
    const b = await build({ 'assets/index-B.js': 'new b' });
    if (!corrupt) await rm(join(a, 'assets/index-AAAAAAAA.js'));
    await expect(
      retainFrontendAssets(
        b,
        previous(a, (path, bytes) => (path.endsWith('.js') ? Buffer.from('corrupted') : bytes)),
      ),
    ).rejects.toThrow(corrupt ? /Integridade/ : /404/);
    await expect(readFile(join(b, 'asset-history.json'))).rejects.toThrow();
  }
});

test('an asset name collision and untrusted manifest paths cannot replace the new build', async () => {
  const a = await build({ 'assets/shared-HASH.js': 'old a' });
  await retainFrontendAssets(a);
  const b = await build({ 'assets/shared-HASH.js': 'different b' });
  await expect(retainFrontendAssets(b, previous(a))).rejects.toThrow(/Integridade/);
  await writeFile(
    join(a, 'asset-history.json'),
    JSON.stringify({
      schemaVersion: 1,
      assets: [{ path: '/assets/../../index.html', size: 5, sha256: 'a'.repeat(64) }],
    }),
  );
  await expect(retainFrontendAssets(b, previous(a))).rejects.toThrow(/inválido/);
  expect(await readFile(join(b, 'assets/shared-HASH.js'), 'utf8')).toBe('different b');
});

test('authentication pages and failed inventory responses are not accepted as an empty history', async () => {
  const b = await build({ 'assets/index-B.js': 'new b' });
  for (const status of [200, 403, 500])
    await expect(
      retainFrontendAssets(b, {
        origin: 'https://previous.invalid',
        fetcher: async () => new Response('<html>Login</html>', { status }),
      }),
    ).rejects.toThrow(/indisponível/);
});

test('a missing inventory cannot silently drop versions already retained by a previous publication', async () => {
  const a = await build({
    'index.html':
      '<meta name="portal-asset-history" content="1"><div id="root"></div><script src="/assets/index-AAAAAAAA.js"></script>',
    'assets/index-AAAAAAAA.js': 'old a',
  });
  const b = await build({ 'assets/index-B.js': 'new b' });
  await expect(retainFrontendAssets(b, previous(a))).rejects.toThrow(/inventário.*desapareceu/);
});
