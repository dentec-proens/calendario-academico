import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { componentSnapshot, verifyComponents } from '../scripts/canonical-check.ts';

test('canonical verification covers nested component data and ignores only table registries', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'canonical-components-'));
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const file = '_components/presence/_components/batchWorker/workers/documents.jsonl';
  const registry = '_components/presence/_tables/documents.jsonl';
  function archive(name: string, status: string, tableId: string): string {
    const root = join(dir, name);
    for (const path of [file, registry]) mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(
      join(root, file),
      JSON.stringify({ _id: 'worker', _creationTime: 42, status }) + '\n',
    );
    writeFileSync(join(root, registry), JSON.stringify({ _id: tableId, _creationTime: 0 }) + '\n');
    const target = join(dir, name + '.zip');
    execFileSync('zip', ['-q', '-r', target, '_components'], { cwd: root });
    return target;
  }
  const before = archive('before', 'stopped', 'first');
  const same = archive('same', 'stopped', 'second');
  const changed = archive('changed', 'running', 'first');
  assert.equal(Object.keys(componentSnapshot(before)).length, 1);
  verifyComponents(before, same);
  assert.throws(() => verifyComponents(before, changed), /Componente alterado/);
});
