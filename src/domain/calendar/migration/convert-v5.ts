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
 * date, even when the period is orphan or incompatible (plan, section 5.4). Slice 3 (step 7):
 * `offers` becomes `scope: { offers, confirmed }` on local dates (plan, section 5.3): a non-empty
 * list keeps its IDs and order and is confirmed; an absent or empty one lists the offers of its
 * own state, unconfirmed. Materialized lists (candidates or proven, step 1) convert as any
 * explicit list and are flagged in the manifest; the copy of a submission that proves one
 * converts confirmed too (`provenScopes`). A state without offers or an orphan offer stops the
 * conversion (blocking shapes of the inventory). Snapshots keep their scope by offer type.
 * Slice 4 (step 8): the offer's `legacyStageCount` becomes `stages: { status: 'reported', count }`
 * and `stages: { perTerm }` becomes `stages: { status: 'defined', perTerm }` (plan, section 5.5);
 * stage links keep their v4 form until step 9b. Step 9a: `convertLink` maps each classified
 * `requirementId` to its `ActivityRef` (plan, section 5.1) by the declaration and the repetition
 * base the inventory read, never by the numeric suffix alone; the dates emit it from step 9b.
 */
import {
  inventoryCatalogueRow,
  inventoryContent,
  inventorySnapshot,
  inventorySubmission,
  type ContentContext,
  type Inventory,
  type LinkShape,
  type MaterializedScope,
  UnknownShapeError,
  v4Declarations,
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
interface OfferV4 extends JsonObject {
  id: string;
  stages?: { perTerm: 1 | 2 | 3 | 4 };
  legacyStageCount?: 2 | 3 | 4;
}
interface StateV4 extends JsonObject {
  schemaVersion: 4;
  offers: OfferV4[];
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
  /** ID of the date, offer or catalogue row; the calendar ID for the state. */
  id: string;
  forms: V4Form[];
  link?: LinkShape;
  changes: FieldChange[];
  /** Scope that needs the owner's attention (plan, section 5.3); absent for a chosen list. */
  scope?: ScopeReview;
}

/**
 * A converted scope recorded for review: an absent or empty list completed with the offers of its
 * own state (`unconfirmed`), or an explicit list an offer addition may have materialized
 * (`materialized-candidate`; `materialized-proven` with the submissions that prove it). Candidates
 * and proven lists already counted toward 2027 coverage, so they convert confirmed; reverting any
 * of them is the owner's decision, outside the conversion.
 */
export interface ScopeReview {
  status: 'unconfirmed' | 'materialized-candidate' | 'materialized-proven';
  offers: string[];
  /** Submission sequences whose copy of the date proves the materialization. */
  proofs: number[];
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
 * v5 link (`ActivityRef`, plan section 5.1), frozen here as the converter's output: the domain
 * type brands the IDs it validates (`activity-ref.ts`), and the tests check every converted link
 * against it.
 */
type TermV5 = 'annual' | 'first' | 'second';
export type ActivityRefV5 =
  | { activityId: string }
  | { activityId: string; term: TermV5 }
  | { activityId: string; semester: 'first' | 'second' }
  | {
      activityId: string;
      offerId: string;
      position:
        | { status: 'unclassified'; reportedOrdinal: number }
        | { status: 'defined'; term: TermV5; number: number };
    };

/**
 * The v5 link of a stored `requirementId`, already classified by the inventory
 * (`classifyRequirementId`, which throws for an unknown or ambiguous ID): a single activity, an
 * offer cycle, a reference semester or an offer stage, by the base of its declaration, never by
 * the numeric suffix alone. A stage reads as `defined` (cycle and number) only under an organised
 * offer whose count covers it; under an unclassified organisation, above the count or without
 * one it keeps the reported ordinal, `unclassified`. A stage of an offer outside the calendar is
 * a blocking shape, and a link whose declaration the frozen catalogue of its origin does not have
 * in that base is unknown.
 */
export function convertLink(link: LinkShape, path = 'requirementId'): ActivityRefV5 {
  const catalogue = link.origin === 'consup-292-2027' ? link.origin : 'operational';
  if (!v4Declarations[catalogue][link.base]?.includes(link.declaration))
    throw new UnknownShapeError(
      path,
      `vínculo “${link.requirementId}” sem a declaração “${link.declaration}” (${link.base}) em ${catalogue}`,
    );
  switch (link.base) {
    case 'once':
      return { activityId: link.declaration };
    case 'cycle':
      return { activityId: link.declaration, term: link.term! };
    case 'semester':
      return { activityId: link.declaration, semester: link.semester! };
    case 'stage':
      if (link.position === 'orphan-offer')
        throw new BlockedConversionError([{ path, form: 'event.stagePosition:orphan-offer' }]);
      return {
        activityId: link.declaration,
        offerId: link.offerId!,
        position:
          link.position === 'defined'
            ? { status: 'defined', term: link.term!, number: link.number! }
            : { status: 'unclassified', reportedOrdinal: link.ordinal! },
      };
  }
}

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
 * or incompatible period is copied and diagnosed later, never dropped. An empty `periodId`, which
 * v4 accepted and read as not informed, gives no destination, as an absent one; the manifest keeps
 * the stored `admission`. Without either field the date has no `notice`.
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
            // An empty period was “not informed” in v4, like an absent one: no destination.
            destinations: admission.periodId
              ? offers.map((offerId) => ({ offerId, periodId: admission.periodId! }))
              : [],
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

/**
 * `offers` → `scope` in place of the old key (at the end when it was absent). A non-empty list is
 * kept as stored and confirmed; an absent or empty one becomes the offers of the date's own state,
 * unconfirmed, which keeps the day count (absent meant every offer present) and the 2027
 * coverage (absent never counted under explicit offers).
 */
function convertScope(item: JsonObject, stateOffers: readonly string[], proven = false) {
  const stored = item.offers as string[] | undefined;
  const scope = stored?.length
    ? { offers: [...stored], confirmed: true }
    : { offers: [...stateOffers], confirmed: proven };
  const converted: JsonObject = {};
  for (const [key, value] of Object.entries(item))
    if (key === 'offers') converted.scope = scope;
    else converted[key] = value;
  if (!('scope' in converted)) converted.scope = scope;
  const changes: FieldChange[] = [
    ...(stored === undefined ? [] : [{ field: 'offers', before: stored }]),
    { field: 'scope', after: scope },
  ];
  return { converted, changes, scope };
}

function scopeReview(
  scope: { offers: string[]; confirmed: boolean },
  materialized: MaterializedScope | undefined,
): ScopeReview | undefined {
  if (!scope.confirmed) return { status: 'unconfirmed', offers: scope.offers, proofs: [] };
  if (!materialized) return undefined;
  return {
    status: `materialized-${materialized.status}`,
    offers: scope.offers,
    proofs: materialized.proofs,
  };
}

/**
 * Stages of an offer (plan, section 5.5), in place of the old keys: the total kept while the
 * organization had no confirmed cycle (`legacyStageCount`) becomes `reported`, and the stages per
 * cycle become `defined`. The inventory has already refused both together and any other value;
 * an offer without either is unchanged and has no manifest entry.
 */
function convertOffers(
  offers: readonly OfferV4[],
  path: string,
  inventory: Inventory,
  manifest: ManifestEntry[],
) {
  return offers.map((offer, index) => {
    const { stages, legacyStageCount } = offer;
    if (stages === undefined && legacyStageCount === undefined) return offer;
    const next =
      legacyStageCount === undefined
        ? { status: 'defined' as const, perTerm: stages!.perTerm }
        : { status: 'reported' as const, count: legacyStageCount };
    const converted: JsonObject = {};
    for (const [key, value] of Object.entries(offer))
      if (key === 'stages' || key === 'legacyStageCount') {
        if (!('stages' in converted)) converted.stages = next;
      } else converted[key] = value;
    const at = `${path}[${index}]`;
    manifest.push({
      path: at,
      id: offer.id,
      forms: formsAt(inventory, at),
      changes: [
        ...(legacyStageCount === undefined
          ? []
          : [{ field: 'legacyStageCount', before: legacyStageCount }]),
        { field: 'stages', ...(stages === undefined ? {} : { before: stages }), after: next },
      ],
    });
    return converted;
  });
}

function convertEvents(
  events: readonly DateV4[],
  stateOffers: readonly string[],
  path: string,
  inventory: Inventory,
  manifest: ManifestEntry[],
  proven?: { ids: readonly string[]; sequence: number },
) {
  return events.map((event, index) => {
    const at = `${path}[${index}]`;
    // A date without offers reaches every offer of its own state (plan, section 5.3).
    const offers = event.offers?.length ? event.offers : stateOffers;
    const date = convertDate(event, offers);
    // A submission copy that proves a materialized list keeps the confirmation of that list.
    const proves = !event.offers?.length && Boolean(proven?.ids.includes(event.id));
    const scope = convertScope(date.converted, stateOffers, proves);
    const link = inventory.links.find((item) => item.path === `${at}.requirementId`)?.link;
    const forms = formsAt(inventory, at);
    const materialized = proves
      ? {
          eventId: event.id,
          offers: [...stateOffers],
          status: 'proven' as const,
          proofs: [proven!.sequence],
        }
      : forms.some((form) => form.startsWith('event.offers:materialized-'))
        ? inventory.materialized.find((item) => item.eventId === event.id)
        : undefined;
    const review = scopeReview(scope.scope, materialized);
    manifest.push({
      path: at,
      id: event.id,
      forms,
      ...(link ? { link } : {}),
      changes: [...date.changes, ...scope.changes],
      ...(review ? { scope: review } : {}),
    });
    return scope.converted;
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
  context: ContentContext & {
    source?: 'content' | 'submission';
    /**
     * Submission only: IDs of the dates whose list in the current content is materialized and
     * proven by this submission (`provenScopeIds`). Their copy without offers converts confirmed,
     * as the list it proves, so comparing the submission with the content shows no confirmation
     * the campus never made (plan, sections 5.3 and 10).
     */
    provenScopes?: readonly string[];
  },
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
  const offers = convertOffers(stored.state.offers, `${source}.state.offers`, inventory, manifest);
  const events = convertEvents(
    stored.state.events,
    stored.state.offers.map((offer) => offer.id),
    `${source}.state.events`,
    inventory,
    manifest,
    source === 'submission' && context.provenScopes?.length
      ? { ids: context.provenScopes, sequence: Number((stored as JsonObject).sequence) }
      : undefined,
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
      state: { ...stored.state, schemaVersion: 5, offers, events },
      institutionalSnapshot,
    },
    manifest,
  };
}

/**
 * IDs of the dates whose list in the converted content is materialized and proven by the
 * submission of `sequence`, to convert that submission (`provenScopes`).
 */
export function provenScopeIds(contentManifest: readonly ManifestEntry[], sequence: number) {
  return contentManifest
    .filter(
      (entry) =>
        entry.path.startsWith('content.state.events') &&
        entry.scope?.status === 'materialized-proven' &&
        entry.scope.proofs.includes(sequence),
    )
    .map((entry) => entry.id);
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
