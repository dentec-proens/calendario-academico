/**
 * Inventory of a Convex export before the v5 migration (plan
 * `docs/plans/2026-11-02-atividades-e-datas.md`, section 6, “Inventário”; phase 2, step 18).
 *
 * Reads the export with `readSnapshot()` and classifies every stored shape of `calendarContents`,
 * `calendarSubmissions` and `institutionalEvents` with the classifier of step 1
 * (`src/domain/calendar/migration/inventory.ts`): counts by shape, orphans, materialized offer
 * lists (candidates and proven) and the calendars `revisado`/`vigente` with dates under “Vínculo a
 * conferir”. A shape outside the inventory stops it with an error naming the document; known
 * blocking shapes are listed for the owner's decision and make the command exit with code 2.
 *
 * “Vínculo a conferir” is what the current code reports after the conversion: `linksToReview()`
 * over the converted state, given to the classifier as data (`event.linkReview:*`), as the oracle
 * did with the v4 code. The report carries IDs and counts, never descriptions.
 *
 * Usage: `pnpm exec tsx scripts/administration/v5-inventory.ts EXPORT.zip`.
 */
import { pathToFileURL } from 'node:url';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { convertContentV5 } from '../../src/domain/calendar/migration/convert-v5.ts';
import {
  inventoryCatalogueRow,
  inventoryContent,
  inventorySubmission,
  mergeInventories,
  reviewedCalendarsWithLinksToReview,
  type CalendarInventory,
  type Inventory,
  type V4Form,
} from '../../src/domain/calendar/migration/inventory.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { readSnapshot } from './snapshot.ts';
import {
  calendarOf,
  isV5CatalogueRow,
  isV5Content,
  located,
  submissionsOf,
  type ConvertedTable,
  type ExportTables,
  type Row,
} from './v5-export.ts';

type Located = { table: ConvertedTable; id: string; path: string; form: V4Form };

export interface V5InventoryReport {
  format: 1;
  snapshotSha256: string;
  /** Documents of each table still in format 4 and already in format 5. */
  documents: Record<ConvertedTable, { v4: number; v5: number }>;
  forms: Partial<Record<V4Form, number>>;
  /** Known shapes that stop the conversion until the owner decides. */
  blocking: Located[];
  /** Offers, stages, periods and admission destinations pointing outside their calendar. */
  orphans: Located[];
  materialized: {
    calendarId: string;
    eventId: string;
    offers: string[];
    status: 'candidate' | 'proven';
    proofs: number[];
  }[];
  reviewedWithLinksToReview: ReturnType<typeof reviewedCalendarsWithLinksToReview>;
}

/** `linksToReview()` of the current code over the converted state, by date ID. */
function reviewedLinks(row: Row, year: number, submissions: Row[]) {
  const converted = convertContentV5(row, { year, submissions })!.document as {
    state: Omit<ActivityState, 'year' | 'campus'>;
  };
  return Object.fromEntries(linksToReview({ ...converted.state, year } as ActivityState));
}

const locate = (table: ConvertedTable, id: string, items: Inventory['occurrences']) =>
  items.map(({ path, form }) => ({ table, id, path, form }));

export function inventoryExport(snapshot: ExportTables): V5InventoryReport {
  const documents = Object.fromEntries(
    (['institutionalEvents', 'calendarContents', 'calendarSubmissions'] as const).map((table) => [
      table,
      { v4: 0, v5: 0 },
    ]),
  ) as V5InventoryReport['documents'];
  const inventories: { table: ConvertedTable; id: string; inventory: Inventory }[] = [];
  const calendars: CalendarInventory[] = [];
  const materialized: V5InventoryReport['materialized'] = [];

  for (const row of snapshot.tables.institutionalEvents ?? [])
    located('institutionalEvents', row._id, () => {
      if (isV5CatalogueRow(row)) return void documents.institutionalEvents.v5++;
      documents.institutionalEvents.v4++;
      inventories.push({
        table: 'institutionalEvents',
        id: row._id,
        inventory: inventoryCatalogueRow(row),
      });
    });
  for (const row of snapshot.tables.calendarContents ?? [])
    located('calendarContents', row._id, () => {
      const calendar = calendarOf(snapshot, 'calendarContents', row);
      if (isV5Content(row)) {
        // Refuses a format 5 state beside a format 4 base, as the conversion does.
        convertContentV5(row, { year: calendar.year });
        return void documents.calendarContents.v5++;
      }
      documents.calendarContents.v4++;
      const submissions = submissionsOf(snapshot, row.calendarId);
      const context = { year: calendar.year, submissions };
      let inventory = inventoryContent(row, context);
      // Links under review need the conversion, which a blocking shape stops.
      if (!inventory.blocking.length)
        inventory = inventoryContent(row, {
          ...context,
          linksToReview: reviewedLinks(row, calendar.year, submissions),
        });
      inventories.push({ table: 'calendarContents', id: row._id, inventory });
      calendars.push({ calendarId: String(row.calendarId), status: calendar.status, inventory });
      for (const item of inventory.materialized)
        materialized.push({ calendarId: String(row.calendarId), ...item });
    });
  for (const row of snapshot.tables.calendarSubmissions ?? [])
    located('calendarSubmissions', row._id, () => {
      const calendar = calendarOf(snapshot, 'calendarSubmissions', row);
      if (isV5Content(row)) {
        convertContentV5(row, { year: calendar.year, source: 'submission' });
        return void documents.calendarSubmissions.v5++;
      }
      documents.calendarSubmissions.v4++;
      inventories.push({
        table: 'calendarSubmissions',
        id: row._id,
        inventory: inventorySubmission(row, { year: calendar.year }),
      });
    });

  const total = mergeInventories(inventories.map(({ inventory }) => inventory));
  const all = (pick: (inventory: Inventory) => Inventory['occurrences']) =>
    inventories.flatMap(({ table, id, inventory }) => locate(table, id, pick(inventory)));
  return {
    format: 1,
    snapshotSha256: snapshot.sha256,
    documents,
    forms: Object.fromEntries(
      Object.entries(total.forms).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
    blocking: all((inventory) => inventory.blocking),
    orphans: all((inventory) =>
      inventory.occurrences.filter(({ form }) => form.includes('orphan')),
    ),
    materialized,
    reviewedWithLinksToReview: reviewedCalendarsWithLinksToReview(calendars),
  };
}

/** Prints the report as JSON; 0 without blocking shapes, 2 with them, 1 on an error. */
export function main(argv: readonly string[], out = console.log, err = console.error) {
  if (argv.length !== 1) {
    err('Uso: pnpm exec tsx scripts/administration/v5-inventory.ts EXPORT.zip');
    return 1;
  }
  try {
    const report = inventoryExport(readSnapshot(argv[0]!));
    out(JSON.stringify(report, null, 2));
    if (report.blocking.length) {
      err('Formas bloqueantes: a conversão exige decisão do responsável antes de prosseguir.');
      return 2;
    }
    return 0;
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2));
