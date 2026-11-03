/**
 * Private manifest of the v5 migration (plan `docs/plans/2026-11-02-atividades-e-datas.md`,
 * section 6, “Provas”; phase 2, step 18).
 *
 * Reads a Convex export with `readSnapshot()`, converts every document of `calendarContents`,
 * `calendarSubmissions` and `institutionalEvents` as the migrations do (`v5-export.ts`) and
 * records, per document and per date: the v4 shapes and link of origin, every field changed (the
 * manifest entries of the converter, with the scope reviews of section 5.3), the fingerprints
 * (`canonical.ts`) before and after and, for submissions, the stored and recalculated
 * `contentHash`. `recoverOrigin()` rebuilds the stored document from the converted one and its
 * entry, so the origin is recovered by conversion + manifest, not only counted.
 *
 * The manifest carries the stored values of every changed field and must stay private: it is
 * written only to a directory outside the repository, never overwriting a file.
 *
 * Usage: `pnpm exec tsx scripts/administration/v5-manifest.ts EXPORT.zip PRIVATE_DIRECTORY`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ManifestEntry } from '../../src/domain/calendar/migration/convert-v5.ts';
import { fingerprint } from './canonical.ts';
import { readSnapshot } from './snapshot.ts';
import { convertExport, type ConvertedTable, type ExportTables, type Row } from './v5-export.ts';

export interface DocumentManifest {
  table: ConvertedTable;
  id: string;
  /** Fingerprint of the stored v4 document and of the document the migration writes. */
  before: string;
  after: string;
  /** Submissions: the stored fingerprint and the one recalculated in the same write. */
  contentHash?: { before: string; after: string };
  entries: ManifestEntry[];
}

export interface V5Manifest {
  format: 1;
  snapshotSha256: string;
  documents: DocumentManifest[];
  /** Documents already in format 5, which the migration does not rewrite. */
  unchanged: { table: ConvertedTable; id: string; fingerprint: string }[];
}

const roots: Record<ConvertedTable, string> = {
  calendarContents: 'content',
  calendarSubmissions: 'submission',
  institutionalEvents: 'institutionalEvent',
};

export function buildManifest(snapshot: ExportTables): V5Manifest {
  const manifest: V5Manifest = {
    format: 1,
    snapshotSha256: snapshot.sha256,
    documents: [],
    unchanged: [],
  };
  for (const { table, id, stored, converted, entries } of convertExport(snapshot)) {
    if (!converted) {
      manifest.unchanged.push({ table, id, fingerprint: fingerprint(stored) });
      continue;
    }
    manifest.documents.push({
      table,
      id,
      before: fingerprint(stored),
      after: fingerprint(converted),
      ...(table === 'calendarSubmissions'
        ? {
            contentHash: {
              before: String(stored.contentHash),
              after: String(converted.contentHash),
            },
          }
        : {}),
      entries,
    });
  }
  return manifest;
}

type Json = Record<string, unknown>;

/** The object at a manifest path (`content.state.events[3]`) inside the document. */
function at(document: Json, root: string, path: string) {
  if (path !== root && !path.startsWith(`${root}.`))
    throw new Error(`Caminho ${path} fora do documento ${root}.`);
  let target: unknown = document;
  for (const step of path.slice(root.length).match(/\.\w+|\[\d+\]/g) ?? [])
    target = step.startsWith('[')
      ? (target as unknown[])[Number(step.slice(1, -1))]
      : (target as Json)[step.slice(1)];
  if (!target || typeof target !== 'object') throw new Error(`Caminho ${path} inexistente.`);
  return target as Json;
}

/**
 * The stored v4 document, rebuilt from the converted one and its manifest entry: every change is
 * reverted, last first, and the recalculated `contentHash` of a submission is restored. Throws
 * when the result is not the document the manifest recorded (fingerprint `before`), or when the
 * converted document is not the one it recorded (fingerprint `after`).
 */
export function recoverOrigin(converted: Row, document: DocumentManifest): Row {
  if (fingerprint(converted) !== document.after)
    throw new Error(
      `${document.table} ${document.id}: documento convertido diferente do manifesto.`,
    );
  const origin = structuredClone(converted) as Json;
  for (const entry of [...document.entries].reverse()) {
    const target = at(origin, roots[document.table], entry.path);
    for (const change of [...entry.changes].reverse()) {
      if (change.before === undefined) delete target[change.field];
      else target[change.field] = structuredClone(change.before);
    }
  }
  if (document.contentHash) origin.contentHash = document.contentHash.before;
  if (fingerprint(origin) !== document.before)
    throw new Error(`${document.table} ${document.id}: origem não recuperada pelo manifesto.`);
  return origin as Row;
}

const repository = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Writes the manifest to `directory`, which must be outside the repository (`root`), with
 * owner-only permissions and without overwriting an existing file. Returns the file path.
 */
export function writeManifest(directory: string, manifest: V5Manifest, root = repository) {
  const target = resolve(directory);
  const inside = relative(resolve(root), target);
  if (!inside || (!inside.startsWith('..') && !isAbsolute(inside)))
    throw new Error('O manifesto é privado: informe um diretório fora do repositório.');
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const path = join(target, `v5-manifest-${manifest.snapshotSha256.slice(0, 16)}.json`);
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return path;
}

export function main(argv: readonly string[], out = console.log, err = console.error) {
  if (argv.length !== 2) {
    err('Uso: pnpm exec tsx scripts/administration/v5-manifest.ts EXPORT.zip DIRETORIO_PRIVADO');
    return 1;
  }
  try {
    const manifest = buildManifest(readSnapshot(argv[0]!));
    const path = writeManifest(argv[1]!, manifest);
    out(
      JSON.stringify({
        path,
        snapshotSha256: manifest.snapshotSha256,
        converted: manifest.documents.length,
        unchanged: manifest.unchanged.length,
      }),
    );
    return 0;
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2));
