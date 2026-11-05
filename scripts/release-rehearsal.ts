import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rehearseCalendar, type RehearsalCalendar } from '../src/domain/calendar/rehearsal.ts';
import type { CatalogueEvent } from '../src/domain/institution/catalogue.ts';
import type { BaseDocument } from '../src/domain/calendar/base.ts';
import { readSnapshot, type SnapshotRow } from './administration/snapshot.ts';

export interface RehearsalReport {
  editable: number;
  saved: number;
  failures: { calendarId: string; error: string }[];
  /** How many calendars would change at each path; dates moving here would be a bug. */
  changes: Record<string, number>;
  needReturn: string[];
}

type Row<T> = SnapshotRow & T;
const documentRow = ({ _id, year, type, title, source, hash, filename }: Row<BaseDocument>) => ({
  id: _id,
  year,
  type,
  title,
  source,
  hash,
  filename,
});

/** Saves or a refusal, for every calendar of the backup, under the code being released. */
export function rehearseBackup(zip: string): RehearsalReport {
  const { tables } = readSnapshot(zip);
  const rows = <T>(name: string) => (tables[name] ?? []) as Row<T>[];
  const campuses = new Map(rows<{ name: string }>('campuses').map((row) => [row._id, row.name]));
  const contents = new Map(
    rows<{ calendarId: string } & Omit<RehearsalCalendar, 'status' | 'year' | 'campus'>>(
      'calendarContents',
    ).map((row) => [row.calendarId, row]),
  );
  const revisions = new Map(
    rows<{ year: number; revision: number }>('catalogueRevisions').map((row) => [
      row.year,
      row.revision,
    ]),
  );
  const events = rows<CatalogueEvent & { code: string; year: number }>('institutionalEvents');
  const documents = rows<BaseDocument & { status: string }>('documents');
  // The backend reads one revision per year and one document in force per type, or refuses.
  const repeated = (keys: string[]) => keys.filter((key, i) => keys.indexOf(key) !== i);
  const duplicated = new Set(
    [
      ...repeated(rows<{ year: number }>('catalogueRevisions').map((row) => `${row.year}`)),
      ...repeated(
        documents
          .filter((document) => document.status === 'vigente')
          .map((document) => `${document.year}:${document.type}`),
      ),
    ].map((key) => Number(key.split(':')[0])),
  );
  const report: RehearsalReport = {
    editable: 0,
    saved: 0,
    failures: [],
    changes: {},
    needReturn: [],
  };
  for (const row of rows<{
    status: RehearsalCalendar['status'];
    year: number;
    campusId: string;
    deletedAt?: number;
  }>('calendars')) {
    if (row.deletedAt !== undefined) continue;
    const content = contents.get(row._id);
    const campus = campuses.get(row.campusId);
    // What the backend itself would refuse when opening this calendar.
    const broken = !content
      ? 'Calendário sem conteúdo.'
      : campus === undefined
        ? 'Calendário de campus inexistente.'
        : duplicated.has(row.year)
          ? `Base de ${row.year} com registros duplicados.`
          : undefined;
    if (broken) {
      report.editable++;
      report.failures.push({ calendarId: row._id, error: broken });
      continue;
    }
    const result = rehearseCalendar(
      { ...content!, status: row.status, year: row.year, campus: campus! },
      {
        revision: revisions.get(row.year) ?? 1,
        events: events
          .filter((event) => event.year === row.year)
          .map(({ code, name, start, end, effect, category, evidence, modalities, active }) => ({
            id: code,
            name,
            start,
            end,
            effect,
            category,
            evidence,
            modalities,
            active,
          })) as CatalogueEvent[],
        documents: documents
          .filter((document) => document.year === row.year && document.status === 'vigente')
          .map(documentRow),
      },
    );
    if (result.outcome === 'needs-return') report.needReturn.push(row._id);
    if (result.outcome === 'unaffected' || result.outcome === 'needs-return') continue;
    report.editable++;
    if (result.outcome === 'fails')
      report.failures.push({ calendarId: row._id, error: result.error });
    else {
      report.saved++;
      for (const path of result.changed) report.changes[path] = (report.changes[path] ?? 0) + 1;
    }
  }
  return report;
}

/**
 * Stops the release when a calendar in editing would stop saving, unless the person running it says
 * otherwise. A refusal can quote what was typed, so its text stays with the backup, in the same
 * private folder as the data, and the terminal shows only identifiers.
 */
export function assertRehearsal(backupDirectory: string, skip: boolean) {
  const report = rehearseBackup(join(backupDirectory, 'before.zip'));
  writeFileSync(
    join(dirname(join(backupDirectory, 'before.zip')), 'rehearsal.json'),
    JSON.stringify({ ...report, skipped: skip }, null, 2),
    { mode: 0o600 },
  );
  console.log(
    `Ensaio: ${report.saved} de ${report.editable} calendários em edição salvam com o código desta release.`,
  );
  for (const [path, count] of Object.entries(report.changes))
    console.log(`  ${path}: muda em ${count}.`);
  if (report.needReturn.length)
    console.log(
      `  ${report.needReturn.length} em análise precisarão de devolução: ${report.needReturn.join(', ')}.`,
    );
  if (!report.failures.length) return;
  console.error(
    `  Falha em ${report.failures.map(({ calendarId }) => calendarId).join(', ')}. Motivos em rehearsal.json, junto ao backup.`,
  );
  if (skip) {
    console.error('Ensaio com falhas, ignorado por --skip-rehearsal. Registrado junto ao backup.');
    return;
  }
  throw Error(
    `O ensaio recusaria ${report.failures.length} calendários em edição. Corrija, ou repita com --skip-rehearsal para emergência.`,
  );
}
