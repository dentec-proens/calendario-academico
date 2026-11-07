import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  expectedRehearsalChanges,
  rehearseCalendar,
  type RehearsalCalendar,
} from '../src/domain/calendar/rehearsal.ts';
import type { CatalogueEvent } from '../src/domain/institution/catalogue.ts';
import { schoolVacationConversions } from '../convex/format7Conversions.ts';
import { convertToFormat7 } from '../src/domain/calendar/normalization/convert-format-7.ts';
import { readSnapshot, type SnapshotRow } from './administration/snapshot.ts';

export interface RehearsalReport {
  editable: number;
  saved: number;
  failures: { calendarId: string; error: string }[];
  /** How many calendars would change at each path; dates moving here would be a bug. */
  changes: Record<string, number>;
  /** The first calendar found at each path. It can quote what was typed: never for the terminal. */
  examples: Record<string, { calendarId: string; before: string; after: string }>;
  needReturn: string[];
}

const exampleLimit = 200;
/** `""` and an absent field read differently here, which is the point of an example. */
function exampleValue(value: unknown) {
  if (value === undefined) return 'ausente';
  const text = JSON.stringify(value);
  return text.length > exampleLimit ? `${text.slice(0, exampleLimit)}…` : text;
}

type Row<T> = SnapshotRow & T;
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
  // The backend reads one revision per year, or refuses.
  const years = rows<{ year: number }>('catalogueRevisions').map((row) => row.year);
  const duplicated = new Set(years.filter((year, i) => years.indexOf(year) !== i));
  const report: RehearsalReport = {
    editable: 0,
    saved: 0,
    failures: [],
    changes: {},
    examples: {},
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
    // Until the contraction of format 7, the backup holds what the migration will convert.
    let stored = content!;
    try {
      if ((content!.state as { schemaVersion?: number }).schemaVersion === 6)
        stored = convertToFormat7(content as never, schoolVacationConversions[row._id] ?? [])
          .document as never;
    } catch (cause) {
      report.editable++;
      report.failures.push({
        calendarId: row._id,
        error: `Conversão ao formato 7: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
      continue;
    }
    const result = rehearseCalendar(
      { ...stored, status: row.status, year: row.year, campus: campus! },
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
      },
    );
    if (result.outcome === 'needs-return') report.needReturn.push(row._id);
    if (result.outcome === 'unaffected' || result.outcome === 'needs-return') continue;
    report.editable++;
    if (result.outcome === 'fails')
      report.failures.push({ calendarId: row._id, error: result.error });
    else {
      report.saved++;
      for (const { path, before, after } of result.changed) {
        report.changes[path] = (report.changes[path] ?? 0) + 1;
        report.examples[path] ??= {
          calendarId: row._id,
          before: exampleValue(before),
          after: exampleValue(after),
        };
      }
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
  const changes = Object.entries(report.changes);
  const expected = changes.filter(([path]) => expectedRehearsalChanges.has(path));
  const drift = changes.filter(([path]) => !expectedRehearsalChanges.has(path));
  for (const [path, count] of expected) console.log(`  ${path}: atualizado em ${count}, esperado.`);
  if (drift.length) {
    console.log(
      '  Conteúdo gravado difere do que o salvamento grava hoje; exemplos em rehearsal.json:',
    );
    for (const [path, count] of drift) console.log(`    ${path}: muda em ${count}.`);
  }
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
