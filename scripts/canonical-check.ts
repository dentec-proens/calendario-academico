import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSnapshot, save, validateSchema } from './migrate-data.ts';
import { canonicalSnapshot, verifyCanonicalEquivalence } from '../migration/canonical.ts';
import { tableFingerprint } from '../migration/plan.ts';
import type { Snapshot, Row } from '../migration/types.ts';

/** Complete component namespaces are intentionally outside the root migration engine. */
export function componentSnapshot(path: string): Snapshot {
  const archive = unzipSync(readFileSync(path));
  const names = Object.keys(archive);
  const result: Snapshot = {};
  for (const name of names) {
    if (
      !/^_components\/.+\/documents\.jsonl$/.test(name) ||
      name.endsWith('/_tables/documents.jsonl')
    )
      continue;
    const rows: Row[] = strFromU8(archive[name]!)
      .split('\n')
      .filter(Boolean)
      .map((line: string) => JSON.parse(line) as Row);
    result[name.slice(0, -'/documents.jsonl'.length)] = rows;
    if (name.endsWith('/_storage/documents.jsonl')) {
      const prefix = name.slice(0, -'documents.jsonl'.length);
      for (const row of rows) {
        const stored = names.find(
          (n) => n.startsWith(prefix) && n.split('/').at(-1)?.split('.')[0] === row._id,
        );
        if (!stored) throw Error('Bytes ausentes no Storage do componente.');
        const bytes = archive[stored]!;
        const digest = createHash('sha256').update(bytes).digest();
        if (
          bytes.length !== row.size ||
          ![digest.toString('hex'), digest.toString('base64')].includes(String(row.sha256))
        )
          throw Error('Bytes divergentes no Storage do componente.');
      }
    }
  }
  return result;
}
export function verifyComponents(before: string, after: string): void {
  const original = componentSnapshot(before),
    actual = componentSnapshot(after);
  const keys = [...new Set([...Object.keys(original), ...Object.keys(actual)])];
  for (const table of keys)
    if (tableFingerprint(original[table] ?? []) !== tableFingerprint(actual[table] ?? []))
      throw Error('Componente alterado: ' + table);
}
export function assertCanonicalSnapshot(before: Snapshot, after: Snapshot): void {
  const expected = canonicalSnapshot(before);
  for (const table of new Set([...Object.keys(expected), ...Object.keys(after)])) {
    if (table === '_tables' || table === 'migrationState') continue;
    if (tableFingerprint(expected[table] ?? []) !== tableFingerprint(after[table] ?? []))
      throw Error('Conversão canônica incompleta ou divergente: ' + table);
  }
}
async function main(): Promise<void> {
  const [beforePath, afterPath, outPath] = process.argv.slice(2);
  if (!beforePath || !afterPath || !outPath)
    throw Error('Uso: canonical-check.ts BEFORE.zip AFTER.zip REPORT.json');
  const before = readSnapshot(beforePath),
    after = readSnapshot(afterPath);
  delete after.migrationState;
  assertCanonicalSnapshot(before, after);
  const report = verifyCanonicalEquivalence(before, after);
  validateSchema(after);
  verifyComponents(beforePath, afterPath);
  save(outPath, {
    result: 'verified',
    beforeDigest: createHash('sha256').update(readFileSync(beforePath)).digest('hex'),
    afterDigest: createHash('sha256').update(readFileSync(afterPath)).digest('hex'),
    report,
    components: 'identical',
    checkedAt: new Date().toISOString(),
  });
  console.log(
    'Equivalência estrutural, schema, Auth, Storage, identidades e componentes verificados.',
  );
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Verificação interrompida.');
    process.exitCode = 1;
  });
