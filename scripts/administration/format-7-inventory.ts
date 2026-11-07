/**
 * Inventory of the format 7 migration, over a backup: what the management decides before it runs
 * and what the conversion would refuse. The JSON can quote what campuses typed, so it stays in the
 * private folder of the operation; the terminal shows only counts. Removed with the contraction.
 *
 * Use: node --import tsx scripts/administration/format-7-inventory.ts before.zip inventory.json
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { schoolVacationConversions } from '../../convex/format7Conversions.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { vacationRef } from '../../src/domain/calendar/activities/vacations.ts';
import { sameActivity } from '../../src/domain/calendar/activities/activity-ref.ts';
import {
  convertToFormat7,
  type Format6Document,
} from '../../src/domain/calendar/normalization/convert-format-7.ts';
import { readSnapshot, type SnapshotRow } from './snapshot.ts';

export interface Format7Inventory {
  /** Dates of the campus to decide: school vacations, or to be left for the campus to correct. */
  candidates: {
    calendarId: string;
    status: string;
    eventId: string;
    name: string;
    start: string;
    end: string;
    effect: string;
    category?: string;
    /** A date that counted today stops counting if it is converted. */
    changesCount: boolean;
  }[];
  /** Open calendars of a year with an exact total their teacher vacations do not add up to. */
  teacherTotals: { calendarId: string; status: string; days: number; expected: number }[];
  refused: { table: string; id: string; reason: string }[];
  /** Listed dates no document of their calendar has: a mistake in the approved list. */
  unknownListed: { calendarId: string; eventId: string }[];
}

type Document = SnapshotRow & Format6Document & { calendarId: string; contentHash?: string };

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function inventory(
  tables: Record<string, SnapshotRow[]>,
  listed: Readonly<Record<string, readonly string[]>> = schoolVacationConversions,
): Format7Inventory {
  const calendars = new Map(
    (tables.calendars ?? []).map((row) => [
      row._id,
      row as SnapshotRow & { status: string; year: number; deletedAt?: number },
    ]),
  );
  const result: Format7Inventory = {
    candidates: [],
    teacherTotals: [],
    refused: [],
    unknownListed: [],
  };
  for (const table of ['calendarContents', 'calendarSubmissions'])
    for (const row of (tables[table] ?? []) as Document[]) {
      try {
        if (table === 'calendarSubmissions' && contentHash(row as never) !== row.contentHash)
          throw Error('o hash gravado não é o do próprio envio');
        convertToFormat7(row, listed[row.calendarId] ?? []);
      } catch (cause) {
        result.refused.push({
          table,
          id: row._id,
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
  for (const row of (tables.calendarContents ?? []) as Document[]) {
    const calendar = calendars.get(row.calendarId);
    const status = calendar?.status ?? 'desconhecida';
    for (const event of row.state.events) {
      if (event.id.startsWith('teacher-vacation') || event.activity !== undefined) continue;
      const name = plain(event.name);
      if (event.category === 'ferias' || /ferias|recesso.*escolar|escolar.*recesso/.test(name))
        result.candidates.push({
          calendarId: row.calendarId,
          status,
          eventId: event.id,
          name: event.name,
          start: event.start,
          end: event.end,
          effect: event.effect,
          ...(event.category ? { category: event.category } : {}),
          changesCount: event.effect !== 'exclude',
        });
    }
    const days = new Set(
      row.state.events
        .filter((event) => event.id.startsWith('teacher-vacation'))
        .flatMap(({ start, end }) => {
          const list: string[] = [];
          for (let time = Date.parse(start); time <= Date.parse(end); time += 86_400_000)
            list.push(new Date(time).toISOString().slice(0, 10));
          return list;
        }),
    ).size;
    const expected =
      calendar &&
      activityPlan({ ...row.state, year: calendar.year } as never).find((item) =>
        sameActivity(item.activity, vacationRef('teacher')),
      )?.exactDays;
    const open = calendar?.deletedAt === undefined && !['vigente', 'arquivado'].includes(status);
    if (expected && open && days !== expected)
      result.teacherTotals.push({ calendarId: row.calendarId, status, days, expected });
  }
  for (const [calendarId, ids] of Object.entries(listed))
    for (const eventId of ids)
      if (
        ![...(tables.calendarContents ?? []), ...(tables.calendarSubmissions ?? [])].some(
          (row) =>
            (row as Document).calendarId === calendarId &&
            (row as Document).state.events.some((event) => event.id === eventId),
        )
      )
        result.unknownListed.push({ calendarId, eventId });
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [zip, output] = process.argv.slice(2);
  if (!zip || !output) throw Error('Uso: format-7-inventory.ts before.zip inventory.json');
  const report = inventory(readSnapshot(zip).tables);
  writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(
    `Candidatas: ${report.candidates.length}. Total docente diferente de 45: ${report.teacherTotals.length}. Recusas da conversão: ${report.refused.length}. Listadas sem data: ${report.unknownListed.length}.`,
  );
}
