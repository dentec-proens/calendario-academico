import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test(
  'production build has one HTML entry, split routes and no development panels or Node runtime',
  { timeout: 60_000 },
  async () => {
    const output = await mkdtemp(join(tmpdir(), 'dentec-static-build-'));
    try {
      await execute(
        process.execPath,
        [
          fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
          'build',
          // Request build metadata for graph inspection; the deployed runtime does not need it.
          '--manifest',
          '--outDir',
          output,
          '--emptyOutDir',
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            VITE_CONVEX_URL: 'https://synthetic-ci.convex.cloud',
          },
          timeout: 60_000,
        },
      );
      assert.deepEqual(
        (await readdir(output)).filter((name) => name.endsWith('.html')),
        ['index.html'],
      );
      const index = await readFile(join(output, 'index.html'), 'utf8');
      assert.match(index, /<div id="root"><\/div>/);
      assert.doesNotMatch(index, /id="event-form"|id="auth-form"/);
      const assets = [...index.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)];
      assert.ok(assets.length > 0);
      for (const [, path] of assets) assert.ok((await stat(join(output, path.slice(1)))).isFile());
      const manifest = JSON.parse(
        await readFile(join(output, '.vite/manifest.json'), 'utf8'),
      ) as Record<string, { file: string; isDynamicEntry?: boolean }>;
      assert.ok(
        Object.values(manifest).some((entry) => entry.isDynamicEntry),
        'route code must remain split',
      );
      assert.ok(
        !Object.keys(manifest).some((key) => /devtools-panel|react-devtools/.test(key)),
        'development panel must not be emitted',
      );
      for (const filename of await readdir(join(output, 'assets'))) {
        if (!filename.endsWith('.js')) continue;
        const source = await readFile(join(output, 'assets', filename), 'utf8');
        assert.doesNotMatch(
          source,
          /Open TanStack Devtools|Resize TanStack Devtools panel|@sparticuz\/chromium|node:child_process|node:fs/,
        );
      }
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  },
);
