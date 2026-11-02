/**
 * Conversion of stored calendar documents from format 4 to format 5 (plan
 * `docs/plans/2026-11-02-atividades-e-datas.md`, phase 2; section 6, “Conversor”).
 *
 * Pure and deterministic: the same document always yields the same result, and nothing here reads
 * the clock, the database or domain rules (normalization and saving recalculate dates, categories
 * and vacations, so they are never a converter). Every document is read first by the v4 inventory
 * (`inventory.ts`): a shape outside it throws `UnknownShapeError`, and a known blocking shape throws
 * `BlockedConversionError`, so the conversion stops instead of guessing. A document already in
 * format 5 yields `null` and is never rewritten.
 *
 * Only the migration (`convex/migrations.ts`), the operation verifiers
 * (`scripts/administration/v5-*.ts`) and tests may import this module
 * (`test/architecture/boundaries.test.ts`).
 *
 * The format changes in slices; this module grows with each one and always converts to the
 * current format. Slice 1 (step 5): `kind` → `effect` on local dates, snapshots and catalogue rows,
 * `recordType` removed, `schemaVersion: 5`. Slice 2 (step 6): `publicationStatus` and `admission`
 * grouped in `notice`, the old `admission.periodId` copied as the destination of each offer of the
 * date, even when the period is orphan or incompatible (plan, section 5.4).
 */
import {
  inventoryCatalogueRow,
  inventoryContent,
  inventorySnapshot,
  inventorySubmission,
  type ContentContext,
  type Inventory,
  type LinkShape,
  type V4Form,
} from './inventory.ts';

/**
 * v4 shapes the conversion reads, frozen here so domain changes cannot reach them. Only the fields
 * a slice converts are named; the inventory has already checked every other field.
 */
type JsonObject = Record<string, unknown>;
type KindV4 = 'include' | 'exclude' | 'note';
interface AdmissionV4 {
  type: 'regular' | 'transfer';
  year: number;
  term: 'annual' | 'first' | 'second';
  periodId?: string;
}
/** A local date (`state.events`) or an institutional snapshot entry. */
interface DateV4 extends JsonObject {
  id: string;
  kind: KindV4;
  recordType?: 'event';
  offers?: string[];
  publicationStatus?: 'planned' | 'published';
  admission?: AdmissionV4;
}
interface CatalogueRowV4 extends JsonObject {
  code: string;
  kind: KindV4;
}
interface StateV4 extends JsonObject {
  schemaVersion: 4;
  offers: { id: string }[];
  events: DateV4[];
}

/** One field changed by the conversion; an absent `before`/`after` means the field is absent. */
export interface FieldChange {
  field: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Manifest entry of a converted object: where it is, its v4 shapes and link of origin, and every
 * field the conversion changed. Reverting the changes recovers the stored v4 object.
 */
export interface ManifestEntry {
  /** Path of the object inside the document, in the inventory notation (`content.state.events[3]`). */
  path: string;
  /** ID of the date or catalogue row; the calendar ID for the state. */
  id: string;
  forms: V4Form[];
  link?: LinkShape;
  changes: FieldChange[];
}

export interface Conversion<T> {
  document: T;
  manifest: ManifestEntry[];
}

/** A known v4 shape that stops the conversion until the owner decides (plan, sections 5.3 and 6). */
export class BlockedConversionError extends Error {
  constructor(readonly blocking: Inventory['blocking']) {
    super(
      `Conversão interrompida por forma conhecida que exige decisão: ${blocking
        .map(({ path, form }) => `${form} em ${path}`)
        .join('; ')}`,
    );
    this.name = 'BlockedConversionError';
  }
}

function refuseBlocking(inventory: Inventory) {
  if (inventory.blocking.length) throw new BlockedConversionError(inventory.blocking);
}

const formsAt = (inventory: Inventory, path: string) =>
  inventory.occurrences.filter((item) => item.path === path).map((item) => item.form);

/**
 * `kind` → `effect` in place of the old key, keeping the order of the other keys, and `recordType`
 * removed. Returns the converted object and the changes.
 */
function convertEffect<T extends JsonObject & { kind: KindV4; recordType?: 'event' }>(item: T) {
  const changes: FieldChange[] = [];
  const converted: JsonObject = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === 'kind') {
      converted.effect = value;
      changes.push({ field: 'kind', before: value }, { field: 'effect', after: value });
    } else if (key === 'recordType') {
      if (value !== undefined) changes.push({ field: 'recordType', before: value });
    } else converted[key] = value;
  }
  return { converted, changes };
}

/**
 * `publicationStatus` and `admission` grouped in `notice`, in place of the first of them. The old
 * `periodId` becomes the destination of each offer of the date (`offers`), unconfirmed: an orphan
 * or incompatible period is copied and diagnosed later, never dropped. Without either field the
 * date has no `notice`.
 */
function convertNotice(item: JsonObject, offers: readonly string[]) {
  const { publicationStatus, admission } = item as Pick<DateV4, 'publicationStatus' | 'admission'>;
  if (publicationStatus === undefined && admission === undefined)
    return { converted: item, changes: [] as FieldChange[] };
  const notice = {
    ...(publicationStatus === undefined ? {} : { publication: publicationStatus }),
    ...(admission === undefined
      ? {}
      : {
          admission: {
            type: admission.type,
            year: admission.year,
            term: admission.term,
            destinations:
              admission.periodId === undefined
                ? []
                : offers.map((offerId) => ({ offerId, periodId: admission.periodId! })),
          },
        }),
  };
  const converted: JsonObject = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === 'publicationStatus' || key === 'admission') {
      if (!('notice' in converted)) converted.notice = notice;
    } else converted[key] = value;
  }
  const changes: FieldChange[] = [
    ...(publicationStatus === undefined
      ? []
      : [{ field: 'publicationStatus', before: publicationStatus }]),
    ...(admission === undefined ? [] : [{ field: 'admission', before: admission }]),
    { field: 'notice', after: notice },
  ];
  return { converted, changes };
}

/** One date converted by every slice; `offers` are the offers of the date, for the destination. */
function convertDate(item: DateV4, offers: readonly string[]) {
  const effect = convertEffect(item);
  const notice = convertNotice(effect.converted, offers);
  return { converted: notice.converted, changes: [...effect.changes, ...notice.changes] };
}

function convertEvents(
  events: readonly DateV4[],
  stateOffers: readonly string[],
  path: string,
  inventory: Inventory,
  manifest: ManifestEntry[],
) {
  return events.map((event, index) => {
    const at = `${path}[${index}]`;
    // A date without offers reaches every offer of its own state (plan, section 5.3).
    const offers = event.offers?.length ? event.offers : stateOffers;
    const { converted, changes } = convertDate(event, offers);
    const link = inventory.links.find((item) => item.path === `${at}.requirementId`)?.link;
    manifest.push({
      path: at,
      id: event.id,
      forms: formsAt(inventory, at),
      ...(link ? { link } : {}),
      changes,
    });
    return converted;
  });
}

function convertSnapshotEvents(
  events: readonly DateV4[],
  path: string,
  inventory: Inventory,
  manifest: ManifestEntry[],
) {
  return events.map((event, index) => {
    const at = `${path}[${index}]`;
    // A snapshot destination is a blocking shape, so a snapshot notice has no destination here.
    const { converted, changes } = convertDate(event, []);
    manifest.push({ path: at, id: event.id, forms: formsAt(inventory, at), changes });
    return converted;
  });
}

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Snapshot entries already in format 5: every entry has `effect` and none has `kind`. */
const snapshotIsV5 = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => isObject(item) && 'effect' in item && !('kind' in item));

/**
 * Converts one `calendarContents` document (or, with `source: 'submission'`, one
 * `calendarSubmissions` copy): state and institutional snapshot together, so the content hash of a
 * submission can be recalculated in the same write. Returns `null` for a document in format 5.
 */
export function convertContentV5(
  document: unknown,
  context: ContentContext & { source?: 'content' | 'submission' },
): Conversion<JsonObject> | null {
  if (isObject(document) && isObject(document.state) && document.state.schemaVersion === 5)
    return null;
  const source = context.source ?? 'content';
  const inventory =
    source === 'submission'
      ? inventorySubmission(document, { year: context.year, linksToReview: context.linksToReview })
      : inventoryContent(document, context);
  refuseBlocking(inventory);
  const stored = document as JsonObject & {
    state: StateV4;
    institutionalSnapshot: DateV4[];
  };
  const id = String(stored.calendarId);
  const manifest: ManifestEntry[] = [
    {
      path: `${source}.state`,
      id,
      forms: formsAt(inventory, `${source}.state`),
      changes: [{ field: 'schemaVersion', before: 4, after: 5 }],
    },
  ];
  const events = convertEvents(
    stored.state.events,
    stored.state.offers.map((offer) => offer.id),
    `${source}.state.events`,
    inventory,
    manifest,
  );
  const institutionalSnapshot = convertSnapshotEvents(
    stored.institutionalSnapshot,
    `${source}.institutionalSnapshot`,
    inventory,
    manifest,
  );
  return {
    document: {
      ...stored,
      state: { ...stored.state, schemaVersion: 5, events },
      institutionalSnapshot,
    },
    manifest,
  };
}

/**
 * Converts an institutional snapshot on its own. Returns `null` when every entry is already in
 * format 5 (an empty snapshot has nothing to convert). A snapshot with an activity link
 * (`requirementId`) stops the conversion: no path writes one, and the v5 snapshot has no link.
 */
export function convertSnapshotV5(
  snapshot: unknown,
  path = 'institutionalSnapshot',
): Conversion<JsonObject[]> | null {
  if (Array.isArray(snapshot) && (!snapshot.length || snapshotIsV5(snapshot))) return null;
  const inventory = inventorySnapshot(snapshot, path);
  refuseBlocking(inventory);
  const manifest: ManifestEntry[] = [];
  const document = convertSnapshotEvents(snapshot as DateV4[], path, inventory, manifest);
  return { document, manifest };
}

/** Converts one `institutionalEvents` row. Returns `null` for a row already in format 5. */
export function convertCatalogueEventV5(row: unknown): Conversion<JsonObject> | null {
  if (isObject(row) && 'effect' in row && !('kind' in row)) return null;
  const inventory = inventoryCatalogueRow(row);
  refuseBlocking(inventory);
  const stored = row as CatalogueRowV4;
  const { converted, changes } = convertEffect(stored);
  return {
    document: converted,
    manifest: [
      {
        path: 'institutionalEvent',
        id: stored.code,
        forms: formsAt(inventory, 'institutionalEvent'),
        changes,
      },
    ],
  };
}
