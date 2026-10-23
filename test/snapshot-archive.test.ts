import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { readSnapshot } from '../scripts/migrate-data.ts';

test('snapshot archives load without external executables and verify original storage bytes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'snapshot-'));
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const bytes = strToU8('PDF sintético com acentuação');
  const digest = createHash('sha256').update(bytes).digest();
  const tables = [{ _id: 'table', name: 'users' }];
  const users = [{ _id: 'user', name: 'João — Administração' }];
  const metadata = { _id: 'file', size: bytes.length, sha256: digest.toString('hex') };
  const archive = (storage: (typeof metadata)[], content?: Uint8Array) => {
    const path = join(dir, 'cópia de segurança.zip');
    writeFileSync(
      path,
      zipSync({
        '_tables/documents.jsonl': strToU8(JSON.stringify(tables[0]) + '\n'),
        '_storage/documents.jsonl': strToU8(storage.map((row) => JSON.stringify(row)).join('\n')),
        'users/documents.jsonl': strToU8(JSON.stringify(users[0]) + '\n\n'),
        '_components/presence/users/documents.jsonl': strToU8('{"_id":"component-user"}\n'),
        ...(content ? { '_storage/file.pdf': content } : {}),
      }),
    );
    return path;
  };
  const previousPath = process.env.PATH;
  process.env.PATH = '';
  try {
    const snapshot = readSnapshot(archive([metadata], bytes));
    assert.deepEqual(snapshot, { _tables: tables, _storage: [metadata], users });
    assert.deepEqual(
      readSnapshot(archive([{ ...metadata, sha256: digest.toString('base64') }], bytes)).users,
      users,
    );
    assert.throws(() => readSnapshot(archive([metadata])), /todos os bytes/);
    assert.throws(
      () => readSnapshot(archive([metadata], strToU8('conteúdo diferente'))),
      /tamanho ou SHA-256/,
    );
    assert.throws(
      () => readSnapshot(archive([{ ...metadata, sha256: '0'.repeat(64) }], bytes)),
      /tamanho ou SHA-256/,
    );
    assert.deepEqual(readSnapshot(archive([]))._storage, []);
    const incomplete = join(dir, 'incomplete.zip');
    writeFileSync(incomplete, zipSync({ 'users/documents.jsonl': strToU8('') }));
    assert.throws(() => readSnapshot(incomplete), /backup completo/);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});
