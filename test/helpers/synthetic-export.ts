import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import {
  convertCatalogueEventV5,
  convertContentV5,
  provenScopeIds,
} from '../../src/domain/calendar/migration/convert-v5.ts';
import type { SnapshotRow } from '../../scripts/administration/snapshot.ts';
import { v4CatalogueRows, v4Cases } from './v4-fixtures.ts';

/**
 * Synthetic Convex exports built from the frozen v4 documents (`test/fixtures/v4/`), for the v5
 * verifiers of `scripts/administration/` (phase 2, step 18 of
 * `docs/plans/2026-11-02-atividades-e-datas.md`). The layout is the one `readSnapshot()` reads:
 * one `documents.jsonl` per namespace, the table registry and Storage with its bytes.
 */
export type Tables = Record<string, SnapshotRow[]>;
type Json = Record<string, unknown>;

const storageBytes = new TextEncoder().encode('documento sintético');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * The deployment before the migration: every frozen calendar with its content and submissions in
 * format 4, the catalogue rows, one review, one audit entry and one Storage file. `status` gives
 * the status of a calendar by case name (`rascunho` otherwise).
 */
export function v4Export(status: Record<string, string> = {}): Tables {
  let time = 1;
  const at = () => time++;
  const tables: Tables = {
    calendars: [],
    calendarContents: [],
    calendarSubmissions: [],
    institutionalEvents: [],
    campuses: [{ _id: 'campus-a', _creationTime: at(), name: 'A', archived: false }],
    reviews: [],
    audit: [],
    _storage: [
      {
        _id: 'storage-1',
        _creationTime: at(),
        sha256: sha256(storageBytes),
        size: storageBytes.byteLength,
      },
    ],
  };
  for (const item of v4Cases()) {
    const calendarId = item.content.calendarId;
    tables.calendars!.push({
      _id: calendarId,
      _creationTime: at(),
      campusId: 'campus-a',
      year: item.year,
      offerKinds: [...new Set(item.content.state.offers.map((offer) => offer.kind))],
      status: status[item.name] ?? 'rascunho',
      statusRevision: 0,
      courses: '',
      classes: '',
      shifts: '',
      version: 7,
      updatedAt: 9,
    });
    tables.calendarContents!.push({
      _id: `content-${calendarId}`,
      _creationTime: at(),
      ...structuredClone(item.content),
    });
    for (const submission of item.submissions)
      tables.calendarSubmissions!.push({
        _id: `submission-${calendarId}-${submission.sequence}`,
        _creationTime: at(),
        ...structuredClone(submission),
      });
  }
  for (const row of v4CatalogueRows())
    tables.institutionalEvents!.push({
      _id: `event-${row.code}`,
      _creationTime: at(),
      ...structuredClone(row),
    });
  const [calendar] = tables.calendars!;
  tables.reviews!.push({
    _id: 'review-1',
    _creationTime: at(),
    calendarId: calendar!._id,
    calendarVersion: 7,
    revision: 1,
  });
  tables.audit!.push({
    _id: 'audit-1',
    _creationTime: at(),
    action: 'SAVE_CALENDAR',
    calendarId: calendar!._id,
    version: 7,
    at: 9,
  });
  return tables;
}

/**
 * The same deployment after the migrations, converted here as `test/helpers/v5-migration.ts`
 * stores the expected documents (proven lists read from the content manifest), with the state
 * the migration component leaves.
 */
export function migratedExport(before: Tables): Tables {
  const after = structuredClone(before);
  const year = (calendarId: unknown) =>
    Number(before.calendars!.find((row) => row._id === calendarId)!.year);
  const manifests = new Map<unknown, ReturnType<typeof convertContentV5>>();
  after.calendarContents = before.calendarContents!.map((row) => {
    const submissions = before.calendarSubmissions!.filter(
      (submission) => submission.calendarId === row.calendarId,
    );
    const conversion = convertContentV5(row, { year: year(row.calendarId), submissions });
    manifests.set(row.calendarId, conversion);
    return (conversion?.document as SnapshotRow | undefined) ?? row;
  });
  after.calendarSubmissions = before.calendarSubmissions!.map((row) => {
    const converted = convertContentV5(row, {
      year: year(row.calendarId),
      source: 'submission',
      provenScopes: provenScopeIds(
        manifests.get(row.calendarId)?.manifest ?? [],
        Number(row.sequence),
      ),
    })?.document as SnapshotRow | undefined;
    return converted ? { ...converted, contentHash: contentHash(converted as never) } : row;
  });
  after.institutionalEvents = before.institutionalEvents!.map(
    (row) => (convertCatalogueEventV5(row)?.document as SnapshotRow | undefined) ?? row,
  );
  after['_components/migrations/migrations'] = [
    { _id: 'migration-1', _creationTime: 1, name: 'migrations:contentsToV5', isDone: true },
  ];
  return after;
}

/** Writes the tables as a Convex export ZIP in `directory`; returns its path. */
export function writeExport(directory: string, name: string, tables: Tables) {
  const entries: Record<string, Uint8Array> = {
    '_tables/documents.jsonl': strToU8(
      Object.keys(tables)
        .map((table, index) => JSON.stringify({ name: table, id: index + 1 }))
        .join('\n'),
    ),
  };
  for (const [table, rows] of Object.entries(tables))
    entries[`${table}/documents.jsonl`] = strToU8(
      rows.map((row) => JSON.stringify(row)).join('\n'),
    );
  for (const row of tables._storage ?? []) entries[`_storage/${row._id}.blob`] = storageBytes;
  const path = join(directory, name);
  writeFileSync(path, zipSync(entries));
  return path;
}

/** A row of a table, to change in place in a test. */
export const rowOf = (tables: Tables, table: string, id: string) =>
  tables[table]!.find((row) => row._id === id)! as SnapshotRow & Json;
