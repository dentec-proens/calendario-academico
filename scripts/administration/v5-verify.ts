/**
 * Verifier of the v5 migration (plan `docs/plans/2026-11-02-atividades-e-datas.md`, section 6,
 * “Provas” and “Release”, step 5; phase 2, step 18): compares the exports taken before and after
 * the conversion, with `canonical.ts`, and lists every divergence.
 *
 * - `calendarContents`, `calendarSubmissions` and `institutionalEvents`: the same documents (IDs
 *   and creation times) and each one exactly what the migration writes from the export before
 *   (`v5-export.ts`), a document already in format 5 unchanged; the dates of each copy one to one
 *   (same IDs, same order); each submission with its recalculated `contentHash` and the same
 *   relation (equal or different) with the current content it had before.
 * - Every other namespace (calendars and their versions, authorship in the audit, reviews,
 *   decisions, documents, Storage files): row by row identical. The migration component
 *   (`_components/migrations/`) and the table registry change with the operation and are left
 *   out; any other namespace that changes by itself (sessions, presence) must be named with
 *   `--allow-changed` and is reported apart, never silently.
 *
 * Usage: `pnpm exec tsx scripts/administration/v5-verify.ts BEFORE.zip AFTER.zip
 * [--allow-changed NAMESPACE]...`. Exit code 1 with any divergence.
 */
import { pathToFileURL } from 'node:url';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { fingerprint } from './canonical.ts';
import { readSnapshot, type Snapshot } from './snapshot.ts';
import {
  convertedTables,
  convertExport,
  type ConvertedTable,
  type ExportTables,
  type Row,
} from './v5-export.ts';

export interface V5Verification {
  ok: boolean;
  divergences: string[];
  /** Namespaces named as changing by themselves, with whether they changed. */
  allowed: { namespace: string; changed: boolean }[];
  counts: Record<ConvertedTable, number>;
}

const operational = (namespace: string) =>
  namespace.startsWith('_components/migrations/') || /(^|\/)_tables$/.test(namespace);

type Json = Record<string, unknown>;
const byId = (rows: readonly Row[]) => new Map(rows.map((row) => [row._id, row]));
const dateIds = (row: Row | undefined) => {
  const state = row?.state as { events?: Json[] } | undefined;
  return [
    ...(state?.events ?? []).map((event) => `state:${String(event.id)}`),
    ...((row?.institutionalSnapshot as Json[] | undefined) ?? []).map(
      (event) => `snapshot:${String(event.id)}`,
    ),
  ];
};
const contentFor = (rows: readonly Row[], calendarId: unknown) =>
  rows.find((row) => row.calendarId === calendarId);

export function verifyExports(
  before: ExportTables & Partial<Pick<Snapshot, 'files'>>,
  after: ExportTables & Partial<Pick<Snapshot, 'files'>>,
  allowChanged: readonly string[] = [],
): V5Verification {
  const divergences: string[] = [];
  const allowed: V5Verification['allowed'] = [];

  // The converted tables: exactly what the migration writes from the export before.
  let expected: ReturnType<typeof convertExport> = [];
  try {
    expected = convertExport(before);
  } catch (error) {
    divergences.push(
      `Exportação anterior não convertível: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const counts = Object.fromEntries(
    convertedTables.map((table) => [table, (after.tables[table] ?? []).length]),
  ) as Record<ConvertedTable, number>;
  for (const table of convertedTables) {
    const was = byId(before.tables[table] ?? []);
    const now = byId(after.tables[table] ?? []);
    for (const id of was.keys()) if (!now.has(id)) divergences.push(`${table} ${id}: removido.`);
    for (const id of now.keys()) if (!was.has(id)) divergences.push(`${table} ${id}: criado.`);
    for (const { id, stored, converted } of expected.filter((item) => item.table === table)) {
      const row = now.get(id);
      if (!row) continue;
      if (row._creationTime !== stored._creationTime)
        divergences.push(`${table} ${id}: _creationTime alterado.`);
      if (
        table !== 'institutionalEvents' &&
        fingerprint(dateIds(row)) !== fingerprint(dateIds(stored))
      )
        divergences.push(`${table} ${id}: datas não correspondem uma a uma.`);
      if (fingerprint(row) !== fingerprint(converted ?? stored))
        divergences.push(
          `${table} ${id}: ${converted ? 'diferente da conversão' : 'documento no formato 5 alterado'}.`,
        );
    }
  }
  // Each submission keeps its relation of hash with the current content, recalculated.
  const contentsBefore = before.tables.calendarContents ?? [];
  const contentsAfter = after.tables.calendarContents ?? [];
  const submissionsBefore = byId(before.tables.calendarSubmissions ?? []);
  for (const row of after.tables.calendarSubmissions ?? []) {
    const stored = submissionsBefore.get(row._id);
    const content = contentFor(contentsAfter, row.calendarId);
    const storedContent = contentFor(contentsBefore, row.calendarId);
    if (!stored || !content || !storedContent) continue;
    if (row.contentHash !== contentHash(row as never))
      divergences.push(`calendarSubmissions ${row._id}: contentHash não recalculado.`);
    const equal = (submission: Row, current: Row) =>
      submission.contentHash === contentHash(current as never);
    if (equal(row, content) !== equal(stored, storedContent))
      divergences.push(
        `calendarSubmissions ${row._id}: relação do contentHash com o conteúdo atual alterada.`,
      );
  }

  // Every other namespace, row by row.
  const namespaces = new Set([...Object.keys(before.tables), ...Object.keys(after.tables)]);
  for (const namespace of [...namespaces].sort()) {
    if (operational(namespace) || (convertedTables as readonly string[]).includes(namespace))
      continue;
    const was = before.tables[namespace];
    const now = after.tables[namespace];
    const rows = (value: readonly Row[] | undefined) =>
      new Map((value ?? []).map((row) => [row._id, fingerprint(row)]));
    const a = rows(was);
    const b = rows(now);
    const changed =
      !was || !now || a.size !== b.size || [...a].some(([id, hash]) => b.get(id) !== hash);
    if (allowChanged.includes(namespace)) {
      allowed.push({ namespace, changed });
      continue;
    }
    if (!was) divergences.push(`${namespace}: tabela criada.`);
    else if (!now) divergences.push(`${namespace}: tabela removida.`);
    else
      for (const id of new Set([...a.keys(), ...b.keys()]))
        if (a.get(id) !== b.get(id))
          divergences.push(
            `${namespace} ${id}: ${!a.has(id) ? 'criado' : !b.has(id) ? 'removido' : 'alterado'}.`,
          );
  }
  if (before.files && after.files && fingerprint(before.files) !== fingerprint(after.files))
    divergences.push('Arquivos de Storage alterados.');
  return { ok: divergences.length === 0, divergences, allowed, counts };
}

export function main(argv: readonly string[], out = console.log, err = console.error) {
  const allow: string[] = [];
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--allow-changed' && argv[index + 1]) allow.push(argv[++index]!);
    else paths.push(argv[index]!);
  }
  if (paths.length !== 2) {
    err(
      'Uso: pnpm exec tsx scripts/administration/v5-verify.ts ANTES.zip DEPOIS.zip [--allow-changed NAMESPACE]...',
    );
    return 1;
  }
  try {
    const result = verifyExports(readSnapshot(paths[0]!), readSnapshot(paths[1]!), allow);
    out(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2));
