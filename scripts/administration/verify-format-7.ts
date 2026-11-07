/**
 * Compares the exports before and after the format 7 migration: only the representation of
 * vacations may change, and every date that changes its effect must be on the approved list. Equal
 * dates mean equal counts, since the count reads only their effect, dates and offers. Removed with
 * the contraction.
 *
 * Use: node --import tsx scripts/administration/verify-format-7.ts before.zip after.zip
 */
import { pathToFileURL } from 'node:url';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { schoolVacationConversions } from '../../convex/format7Conversions.ts';
import { convertToFormat7 } from '../../src/domain/calendar/normalization/convert-format-7.ts';
import { canonical } from './canonical.ts';
import { readSnapshot, type SnapshotRow } from './snapshot.ts';

type Document = SnapshotRow & {
  calendarId: string;
  contentHash?: string;
  state: { schemaVersion: number };
};

export function compareFormat7(
  before: Record<string, SnapshotRow[]>,
  after: Record<string, SnapshotRow[]>,
  listed: Readonly<Record<string, readonly string[]>> = schoolVacationConversions,
) {
  const divergences: string[] = [];
  const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
  for (const table of ['calendars', 'reviews', 'reviewVersions'])
    if (!same(before[table] ?? [], after[table] ?? []))
      divergences.push(`${table}: mudou, e a migração não a escreve`);
  for (const table of ['calendarContents', 'calendarSubmissions']) {
    const next = new Map((after[table] ?? []).map((row) => [row._id, row as Document]));
    if ((before[table] ?? []).length !== next.size) divergences.push(`${table}: quantidade mudou`);
    for (const row of (before[table] ?? []) as Document[]) {
      const migrated = next.get(row._id);
      if (!migrated) {
        divergences.push(`${table} ${row._id}: ausente depois`);
        continue;
      }
      // The converter is the specification: the export must hold exactly its result.
      const { document } = convertToFormat7(row as never, listed[row.calendarId] ?? []);
      const { contentHash: oldHash, ...expected } = document as unknown as Document;
      const { contentHash: newHash, ...found } = migrated;
      if (!same(expected, found)) divergences.push(`${table} ${row._id}: conteúdo diverge`);
      if (table === 'calendarSubmissions') {
        if (oldHash !== contentHash(row as never))
          divergences.push(`${table} ${row._id}: hash anterior já divergia`);
        if (newHash !== contentHash(migrated as never))
          divergences.push(`${table} ${row._id}: hash novo diverge`);
      }
    }
  }
  // Every approved date reached its calendar: a mistaken ID would convert nothing, in silence.
  for (const [calendarId, ids] of Object.entries(listed))
    for (const id of ids)
      if (
        !(before.calendarContents ?? []).some(
          (row) =>
            (row as Document & { state: { events: { id: string }[] } }).calendarId === calendarId &&
            (row as Document & { state: { events: { id: string }[] } }).state.events.some(
              (event) => event.id === id,
            ),
        ) &&
        !(before.calendarSubmissions ?? []).some(
          (row) =>
            (row as Document & { state: { events: { id: string }[] } }).calendarId === calendarId &&
            (row as Document & { state: { events: { id: string }[] } }).state.events.some(
              (event) => event.id === id,
            ),
        )
      )
        divergences.push(`lista aprovada: ${calendarId} não tem a data ${id}`);
  // A submission and its content that were the same stay the same.
  const contents = new Map(
    (after.calendarContents ?? []).map((row) => [(row as Document).calendarId, row]),
  );
  const previous = new Map(
    (before.calendarContents ?? []).map((row) => [(row as Document).calendarId, row]),
  );
  for (const row of (before.calendarSubmissions ?? []) as Document[]) {
    const old = previous.get(row.calendarId);
    const content = contents.get(row.calendarId);
    const migrated = (after.calendarSubmissions ?? []).find((item) => item._id === row._id);
    if (!old || !content || !migrated) continue;
    if (
      contentHash(old as never) === row.contentHash &&
      contentHash(content as never) !== (migrated as Document).contentHash
    )
      divergences.push(`calendarSubmissions ${row._id}: deixou de coincidir com o conteúdo`);
  }
  return divergences;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [before, after] = process.argv.slice(2);
  if (!before || !after) throw Error('Uso: verify-format-7.ts before.zip after.zip');
  const divergences = compareFormat7(readSnapshot(before).tables, readSnapshot(after).tables);
  for (const divergence of divergences) console.error(divergence);
  if (divergences.length) throw Error(`${divergences.length} divergências no formato 7.`);
  console.log('Formato 7 conferido: só a representação das férias mudou.');
}
