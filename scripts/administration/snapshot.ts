/** Integral snapshot reader with explicit verification of all namespaces and Storage bytes. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
export type SnapshotRow = { _id: string; _creationTime: number; [key: string]: unknown };
export type Snapshot = {
  sha256: string;
  tables: Record<string, SnapshotRow[]>;
  files: Record<string, { size: number; sha256: string }>;
};
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const registry = (table: string) => /(^|\/)_tables$/.test(table);
export function readSnapshot(path: string): Snapshot {
  const bytes = readFileSync(path);
  const archive = unzipSync(bytes, {
    filter: ({ name }) =>
      !name.endsWith('/') && (name.endsWith('/documents.jsonl') || /(^|\/)_storage\//.test(name)),
  });
  const tables: Record<string, SnapshotRow[]> = {};
  const files: Snapshot['files'] = {};
  for (const [name, content] of Object.entries(archive)) {
    if (name.endsWith('/documents.jsonl')) {
      const table = name.slice(0, -'/documents.jsonl'.length);
      if (!table || table.split('/').some((part) => !part || part === '.' || part === '..'))
        throw Error('Namespace inválido no backup.');
      tables[table] = strFromU8(content)
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          let row: SnapshotRow;
          try {
            row = JSON.parse(line) as SnapshotRow;
          } catch {
            throw Error('JSON inválido em documento do backup.');
          }
          if (
            !row ||
            typeof row !== 'object' ||
            (!registry(table) && (!row._id || !Number.isFinite(row._creationTime)))
          )
            throw Error('Documento inválido no backup.');
          return row;
        });
    } else if (/(^|\/)_storage\//.test(name) && !name.endsWith('/generated_schema.jsonl')) {
      files[name] = { size: content.byteLength, sha256: digest(content) };
    }
  }
  if (!tables._tables || !tables._storage)
    throw Error('Use exportação integral com --include-file-storage.');
  const accounted = new Set<string>();
  for (const [table, rows] of Object.entries(tables)) {
    if (!/(^|\/)_storage$/.test(table)) continue;
    for (const row of rows) {
      const names = Object.keys(files).filter(
        (name) => dirname(name) === table && basename(name).split('.')[0] === row._id,
      );
      if (names.length !== 1) throw Error('Bytes de Storage ausentes ou duplicados no backup.');
      const value = files[names[0]]!;
      const hash = String(row.sha256);
      if (
        value.size !== row.size ||
        (value.sha256 !== hash && Buffer.from(value.sha256, 'hex').toString('base64') !== hash)
      )
        throw Error('SHA-256 ou tamanho de Storage divergente.');
      accounted.add(names[0]);
    }
  }
  if (Object.keys(files).some((name) => !accounted.has(name)))
    throw Error('Arquivo de Storage sem metadados correspondentes.');
  return { sha256: digest(bytes), tables, files };
}
