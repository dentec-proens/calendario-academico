import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { zipSync, strToU8 } from 'fflate';
import { componentSnapshot, verifyComponents } from '../scripts/canonical-check.ts';

test('canonical verification covers nested component data and ignores only table registries', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'canonical-components-'));
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const file = '_components/presence/_components/batchWorker/workers/documents.jsonl';
  const registry = '_components/presence/_tables/documents.jsonl';
  function archive(name: string, status: string, tableId: string): string {
    const target = join(dir, name + '.zip');
    writeFileSync(
      target,
      zipSync({
        [file]: strToU8(JSON.stringify({ _id: 'worker', _creationTime: 42, status }) + '\n'),
        [registry]: strToU8(JSON.stringify({ _id: tableId, _creationTime: 0 }) + '\n'),
      }),
    );
    return target;
  }
  const before = archive('before', 'stopped', 'first');
  const same = archive('same', 'stopped', 'second');
  const changed = archive('changed', 'running', 'first');
  assert.equal(Object.keys(componentSnapshot(before)).length, 1);
  verifyComponents(before, same);
  assert.throws(() => verifyComponents(before, changed), /Componente alterado/);
});

test('component storage verification checks archived bytes against size and SHA-256', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'canonical-storage-'));
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const prefix = '_components/presence/_storage/';
  const bytes = strToU8('synthetic component file');
  const metadata = {
    _id: 'file',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  function archive(name: string, content?: Uint8Array): string {
    const target = join(dir, name + '.zip');
    writeFileSync(
      target,
      zipSync({
        [prefix + 'documents.jsonl']: strToU8(JSON.stringify(metadata) + '\n'),
        ...(content ? { [prefix + 'file.txt']: content } : {}),
      }),
    );
    return target;
  }
  assert.doesNotThrow(() => componentSnapshot(archive('valid', bytes)));
  const changed = bytes.slice();
  changed[0] = changed[0]! ^ 1;
  assert.throws(() => componentSnapshot(archive('corrupt', changed)), /Bytes divergentes/);
  assert.throws(() => componentSnapshot(archive('missing')), /Bytes ausentes/);
});
