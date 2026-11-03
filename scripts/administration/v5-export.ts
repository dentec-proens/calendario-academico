/**
 * Tables of a Convex export read by the v5 verifiers (`v5-inventory.ts`, `v5-manifest.ts`,
 * `v5-verify.ts`; plan `docs/plans/2026-11-02-atividades-e-datas.md`, phase 2, step 18). The
 * export comes from `readSnapshot()` (`snapshot.ts`); rows stay plain JSON, as the converter and
 * the inventory read them. Contraction (release, step 7) removes these modules with the converter.
 */
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import {
  convertCatalogueEventV5,
  convertContentV5,
  provenScopesOfConverted,
  type ManifestEntry,
} from '../../src/domain/calendar/migration/convert-v5.ts';
import type { Snapshot, SnapshotRow } from './snapshot.ts';

export type ExportTables = Pick<Snapshot, 'sha256' | 'tables'>;
export type Row = SnapshotRow;
export type ConvertedTable = 'calendarContents' | 'calendarSubmissions' | 'institutionalEvents';
export const convertedTables: readonly ConvertedTable[] = [
  'institutionalEvents',
  'calendarContents',
  'calendarSubmissions',
];

const rows = (snapshot: ExportTables, table: string) => snapshot.tables[table] ?? [];

/** Format 5 as the migration reads it: a content or submission state, or a catalogue row. */
export const isV5Content = (row: Row) =>
  (row.state as { schemaVersion?: unknown } | undefined)?.schemaVersion === 5;
export const isV5CatalogueRow = (row: Row) => 'effect' in row && !('kind' in row);

/** The calendar of a document; a document without one stops the operation, as the migration. */
export function calendarOf(snapshot: ExportTables, table: string, row: Row) {
  const calendar = rows(snapshot, 'calendars').find((item) => item._id === row.calendarId);
  if (!calendar) throw new Error(`${table} ${row._id}: calendário inexistente.`);
  return calendar as Row & { year: number; status: string };
}

export const submissionsOf = (snapshot: ExportTables, calendarId: unknown) =>
  rows(snapshot, 'calendarSubmissions')
    .filter((row) => row.calendarId === calendarId)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence));

/** A conversion failure located at its document, keeping the original error as the cause. */
export function located<T>(table: string, id: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw new Error(`${table} ${id}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

export interface ConvertedDocument {
  table: ConvertedTable;
  id: string;
  stored: Row;
  /** `null` for a document already in format 5, which the migration never rewrites. */
  converted: Row | null;
  entries: ManifestEntry[];
}

/**
 * Every document of the converted tables as the migrations (`convex/migrations.ts`) write it:
 * the catalogue row; the content with its v4 submissions proving materialized lists; the
 * submission with the lists its converted content proves (`provenScopesOfConverted`) and
 * `contentHash` recalculated in the same write,
 * after checking the stored hash is the one of the stored copy. Throws at the first document
 * the migration would stop at (unknown or blocking shape, missing calendar, foreign hash).
 */
export function convertExport(snapshot: ExportTables): ConvertedDocument[] {
  const documents: ConvertedDocument[] = [];
  for (const row of rows(snapshot, 'institutionalEvents'))
    located('institutionalEvents', row._id, () => {
      const conversion = convertCatalogueEventV5(row);
      documents.push({
        table: 'institutionalEvents',
        id: row._id,
        stored: row,
        converted: (conversion?.document as Row | undefined) ?? null,
        entries: conversion?.manifest ?? [],
      });
    });
  // Contents convert before submissions: each submission reads its content in format 5.
  const currentContents = new Map<unknown, Row>();
  for (const row of rows(snapshot, 'calendarContents'))
    located('calendarContents', row._id, () => {
      const { year } = calendarOf(snapshot, 'calendarContents', row);
      const submissions = isV5Content(row) ? [] : submissionsOf(snapshot, row.calendarId);
      if (submissions.some(isV5Content)) throw new Error('envio no formato 5 antes do conteúdo.');
      const conversion = convertContentV5(row, { year, submissions });
      currentContents.set(row.calendarId, (conversion?.document as Row | undefined) ?? row);
      documents.push({
        table: 'calendarContents',
        id: row._id,
        stored: row,
        converted: (conversion?.document as Row | undefined) ?? null,
        entries: conversion?.manifest ?? [],
      });
    });
  for (const row of rows(snapshot, 'calendarSubmissions'))
    located('calendarSubmissions', row._id, () => {
      const { year } = calendarOf(snapshot, 'calendarSubmissions', row);
      if (isV5Content(row)) {
        convertContentV5(row, { year, source: 'submission' });
        documents.push({
          table: 'calendarSubmissions',
          id: row._id,
          stored: row,
          converted: null,
          entries: [],
        });
        return;
      }
      const content = currentContents.get(row.calendarId);
      if (!content) throw new Error('calendário sem conteúdo.');
      if (contentHash(row as never) !== row.contentHash)
        throw new Error('contentHash diferente do conteúdo enviado.');
      const conversion = convertContentV5(row, {
        year,
        source: 'submission',
        provenScopes: provenScopesOfConverted(content, row),
      })!;
      const converted = conversion.document as Row;
      documents.push({
        table: 'calendarSubmissions',
        id: row._id,
        stored: row,
        converted: { ...converted, contentHash: contentHash(converted as never) },
        entries: conversion.manifest,
      });
    });
  return documents;
}
