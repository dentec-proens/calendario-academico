import assert from 'node:assert/strict';
import { test } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareProject } from '../scripts/migrate-data.ts';
import { root } from '../scripts/environment.ts';
import { createCanonicalPlan } from '../migration/canonical.ts';

test('prepared migration projects contain a standalone working TypeScript configuration', () => {
  const directory = mkdtempSync(join(root, 'backup-migration-config-'));
  try {
    const project = join(directory, 'project');
    prepareProject(createCanonicalPlan({ _tables: [], _storage: [] }, 'backup'), project);
    const configuration = join(project, 'convex', 'tsconfig.json');
    assert(existsSync(configuration), 'required typechecking must not be silently skipped');
    const result = spawnSync(
      process.execPath,
      [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', configuration],
      { cwd: project, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
