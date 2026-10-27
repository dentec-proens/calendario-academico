import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { frontendVersion } from '../scripts/frontend-version.ts';

it('direct Vite builds share exactly one identity with their own manifest, with unique rebuilds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'frontend-version-'));
  try {
    await writeFile(join(root, 'index.html'), '<script type="module" src="/entry.js"></script>');
    await writeFile(join(root, 'entry.js'), 'window.build = __PORTAL_BUILD_ID__;');
    const ids: string[] = [];
    for (let index = 0; index < 2; index++) {
      const result = await build({
        configFile: false,
        root,
        logLevel: 'silent',
        plugins: [frontendVersion()],
      });
      const manifest = JSON.parse(await readFile(join(root, 'dist/version.json'), 'utf8')) as {
        schemaVersion: number;
        buildId: string;
      };
      expect(manifest.schemaVersion).toBe(1);
      if (Array.isArray(result) || !('output' in result))
        throw new Error('Expected a single build');
      const code = result.output
        .filter((item) => item.type === 'chunk')
        .map((item) => item.code)
        .join('');
      expect(code).toContain(manifest.buildId);
      ids.push(manifest.buildId);
    }
    expect(ids[0]).not.toBe(ids[1]);
    await writeFile(join(root, 'entry.js'), 'window.build = "missing";');
    await expect(
      build({ configFile: false, root, logLevel: 'silent', plugins: [frontendVersion()] }),
    ).rejects.toThrow('Client is missing');
    const config = JSON.parse(
      await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    ) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
    expect(config.headers.find((item) => item.source === '/version.json')?.headers).toEqual(
      expect.arrayContaining([
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        { key: 'Content-Type', value: 'application/json; charset=utf-8' },
      ]),
    );
    expect(config.headers[0]?.headers).toContainEqual({
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
