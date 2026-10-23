import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

// Static hosts may resolve / to index.html before evaluating rewrite rules.
// Verify the actual build artifacts, independent of the local route adapter.
test(
  'static build puts the React portal at index.html and the editor in its own document',
  { timeout: 60_000 },
  async () => {
    const output = await mkdtemp(join(tmpdir(), 'dentec-static-build-'));
    try {
      await execute(
        process.execPath,
        [
          fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
          'build',
          '--outDir',
          output,
          '--emptyOutDir',
        ],
        {
          cwd: root,
          env: { ...process.env, VITE_CONVEX_URL: 'https://synthetic-ci.convex.cloud' },
          timeout: 60_000,
        },
      );
      const [index, alias, editor] = await Promise.all(
        ['index', 'portal', 'editor'].map((page) => readFile(join(output, page + '.html'), 'utf8')),
      );
      for (const portal of [index, alias]) {
        assert.match(portal, /<div id="root"><\/div>/);
        assert.doesNotMatch(portal, /class="calendar-editor"|id="event-form"/);
      }
      assert.match(editor, /class="calendar-editor"/);
      assert.match(editor, /id="event-form"/);
      assert.match(editor, /id="autosave-status"/);
      assert.doesNotMatch(editor, /<div id="root">/);
      for (const document of [index, alias, editor]) {
        const assets = [...document.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)];
        assert.ok(assets.length > 0, 'compiled pages must reference emitted scripts and styles');
        for (const [, path] of assets)
          assert.ok((await stat(join(output, path.slice(1)))).isFile());
      }
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  },
);
