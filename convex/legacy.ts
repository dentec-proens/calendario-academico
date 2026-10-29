import { paginationOptsValidator } from 'convex/server';
import type { PaginationOptions } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import { calendarV3OrphanKeys } from '../src/domain/calendar/normalization/conversion-v4';
import { convertCalendarV2 } from '../src/domain/calendar/normalization/conversion';
import { organizationForModality } from '../src/domain/calendar/organization/periods';
import type { AssessmentSettings } from '../src/domain/calendar/model';
import { policyFor } from '../src/domain/policies/registry';
import { internalQuery } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

const phase = v.union(
  v.literal('contents'),
  v.literal('calendars'),
  v.literal('campuses'),
  v.literal('receipts'),
  v.literal('historicalSnapshots'),
);
const countFields = {
  contents: v.number(),
  schemaV2: v.number(),
  schemaV3: v.number(),
  schemaV4: v.number(),
  trashedContents: v.number(),
  orphanContents: v.number(),
  contentsWithOrphanKeys: v.number(),
  orphanKeys: v.number(),
  contentsWithoutStages: v.number(),
  offersWithoutStages: v.number(),
  // Quantity absent differs from a preserved historical total awaiting cycle classification.
  offersWithPendingStageCycle: v.number(),
  legacyStageCountContents: v.number(),
  legacyStageCountOffers: v.number(),
  legacyStageCount2Offers: v.number(),
  legacyStageCount3Offers: v.number(),
  legacyStageCount4Offers: v.number(),
  historicalLegacyStageCountContents: v.number(),
  historicalLegacyStageCountOffers: v.number(),
  historicalLegacyStageCount2Offers: v.number(),
  historicalLegacyStageCount3Offers: v.number(),
  historicalLegacyStageCount4Offers: v.number(),
  historicalNonEventRecords: v.number(),
  historicalPriorReferenceRecords: v.number(),
  historicalRetiredStageRecords: v.number(),
  historicalLegacySecondSemesterIntakeContents: v.number(),
  historicalYearThrough2026Snapshots: v.number(),
  liveLegacySemesterThreeContents: v.number(),
  liveLegacySemesterThreeOffers: v.number(),
  legacySecondSemesterIntakeContents: v.number(),
  legacySecondSemesterIntakeTrue: v.number(),
  legacySecondSemesterIntakeFalse: v.number(),
  nonEventRecords: v.number(),
  priorReferenceRecords: v.number(),
  retiredStageRecords: v.number(),
  legacyRequirementEvents2027: v.number(),
  calendars: v.number(),
  calendarsWithoutContent: v.number(),
  calendarsThrough2026: v.number(),
  year8700Calendars: v.number(),
  campuses: v.number(),
  releaseResidueCampuses: v.number(),
  releaseResidueCampusesWithAnyUsers: v.number(),
  migrationReceipts: v.number(),
  receiptOrphanKeys: v.number(),
  receiptOrphanContents: v.number(),
  receiptOrphanCalendars: v.number(),
  receiptFailures: v.number(),
  receiptConvertedFromV2: v.number(),
};
const countsValidator = v.object(countFields);
type Counts = Infer<typeof countsValidator>;
const argsValidator = v.object({ phase, paginationOpts: paginationOptsValidator });
const resultValidator = v.object({
  phase,
  scanned: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(v.literal('SplitRecommended'), v.literal('SplitRequired'), v.null()),
  ),
  counts: countsValidator,
  calendarsThrough2026ByCampus: v.array(
    v.object({ campusId: v.id('campuses'), calendars: v.number() }),
  ),
  legacyRequirementIds2027: v.array(v.object({ id: v.string(), events: v.number() })),
  releaseResidueCampuses: v.array(
    v.object({ campusId: v.id('campuses'), hasAnyUsers: v.boolean() }),
  ),
  // Intersect these candidates with releaseResidueCampuses by the native campus ID.
  year8700Calendars: v.array(
    v.object({
      calendarId: v.id('calendars'),
      campusId: v.id('campuses'),
      hasContent: v.boolean(),
      trashed: v.boolean(),
    }),
  ),
});
export type LegacyUsageArgs = Infer<typeof argsValidator>;
export type LegacyUsagePage = Infer<typeof resultValidator>;

const releaseResiduePrefix = 'Operação de publicação release-';
const maximumPageBytes = 4 * 1024 * 1024;
const emptyCounts = (): Counts =>
  Object.fromEntries(Object.keys(countFields).map((key) => [key, 0])) as Counts;

function assertBoundedPage(options: PaginationOptions) {
  if (
    !Number.isInteger(options.numItems) ||
    options.numItems < 1 ||
    options.numItems > 10 ||
    !Number.isInteger(options.maximumRowsRead) ||
    options.maximumRowsRead! < 1 ||
    options.maximumRowsRead! > 10 ||
    !Number.isInteger(options.maximumBytesRead) ||
    options.maximumBytesRead! < 1 ||
    options.maximumBytesRead! > maximumPageBytes
  )
    throw new Error(
      'Use páginas de até 10 documentos, maximumRowsRead ≤ 10 e maximumBytesRead ≤ 4194304.',
    );
}

function countHistoricalStages(
  offers: readonly { legacyStageCount?: 2 | 3 | 4 }[],
  counts: Counts,
  historical = false,
) {
  const names = historical
    ? ({
        contents: 'historicalLegacyStageCountContents',
        offers: 'historicalLegacyStageCountOffers',
        2: 'historicalLegacyStageCount2Offers',
        3: 'historicalLegacyStageCount3Offers',
        4: 'historicalLegacyStageCount4Offers',
      } as const)
    : ({
        contents: 'legacyStageCountContents',
        offers: 'legacyStageCountOffers',
        2: 'legacyStageCount2Offers',
        3: 'legacyStageCount3Offers',
        4: 'legacyStageCount4Offers',
      } as const);
  const marked = offers.filter((offer) => offer.legacyStageCount !== undefined);
  if (marked.length) counts[names.contents]++;
  counts[names.offers] += marked.length;
  for (const offer of marked) counts[names[offer.legacyStageCount!]]++;
}

function contentCounts(
  content: Doc<'calendarContents'>,
  calendar: Doc<'calendars'> | null,
  counts: Counts,
  requirementIds: Map<string, number>,
) {
  const state = content.state;
  counts.contents++;
  counts[
    state.schemaVersion === 4 ? 'schemaV4' : state.schemaVersion === 3 ? 'schemaV3' : 'schemaV2'
  ]++;
  if (!calendar) counts.orphanContents++;
  if (calendar?.deletedAt !== undefined) counts.trashedContents++;
  if (state.schemaVersion === 4) {
    // The marker is self-contained evidence, including in trash and orphan rows.
    countHistoricalStages(state.offers, counts);
    counts.offersWithPendingStageCycle += state.offers.filter((offer) => !offer.stages).length;
  }
  if (state.schemaVersion === 4 && state.legacySecondSemesterIntake !== undefined) {
    counts.legacySecondSemesterIntakeContents++;
    counts[
      state.legacySecondSemesterIntake
        ? 'legacySecondSemesterIntakeTrue'
        : 'legacySecondSemesterIntakeFalse'
    ]++;
  }
  for (const event of state.events) {
    if (event.recordType !== undefined && event.recordType !== 'event') counts.nonEventRecords++;
    if (event.recordType === 'prior-reference') counts.priorReferenceRecords++;
    if (event.recordType === 'retired-stage') counts.retiredStageRecords++;
  }
  // Metadata is authoritative. An orphan cannot acquire a year or a kind from its content maps.
  if (!calendar) return;
  const modalities = calendar.modalities ?? calendar.offerKinds ?? [];
  const settings: AssessmentSettings =
    state.schemaVersion === 4
      ? { ...state, year: calendar.year }
      : convertCalendarV2({ ...state, year: calendar.year, modalities });
  let missingStages = 0;
  if (state.schemaVersion === 4)
    missingStages = state.offers.filter(
      (offer) => !offer.stages && offer.legacyStageCount === undefined,
    ).length;
  else {
    const orphanKeys = Object.values(
      calendarV3OrphanKeys(state, { year: calendar.year, modalities }),
    ).reduce((total, keys) => total + keys.length, 0);
    counts.orphanKeys += orphanKeys;
    if (orphanKeys) counts.contentsWithOrphanKeys++;
    missingStages = modalities.filter(
      (kind) => settings.assessmentStagesByModality?.[kind] === undefined,
    ).length;
    const semesterThree = modalities.filter(
      (kind) =>
        organizationForModality(settings, kind) === 'semestral' &&
        settings.assessmentStagesByModality?.[kind] === 3,
    ).length;
    counts.liveLegacySemesterThreeOffers += semesterThree;
    if (semesterThree) counts.liveLegacySemesterThreeContents++;
  }
  counts.offersWithoutStages += missingStages;
  if (missingStages) counts.contentsWithoutStages++;
  if (calendar.year !== 2027) return;
  const legacyIds = new Set(
    policyFor(calendar.year)
      .requirements(settings)
      .filter((row) => row.basis === 'Classificação legada')
      .map((row) => row.id),
  );
  for (const event of state.events)
    if (event.requirementId && legacyIds.has(event.requirementId)) {
      counts.legacyRequirementEvents2027++;
      requirementIds.set(event.requirementId, (requirementIds.get(event.requirementId) ?? 0) + 1);
    }
}

/** Read-only M7/M9 inventory. Aggregate every page of every phase outside Convex. */
export const usage = internalQuery({
  args: argsValidator.fields,
  returns: resultValidator,
  handler: async (ctx, args): Promise<LegacyUsagePage> => {
    assertBoundedPage(args.paginationOpts);
    const counts = emptyCounts();
    const calendarsByCampus = new Map<Id<'campuses'>, number>();
    const requirementIds = new Map<string, number>();
    const releaseResidueCampuses: LegacyUsagePage['releaseResidueCampuses'] = [];
    const year8700Calendars: LegacyUsagePage['year8700Calendars'] = [];
    // One native pagination operation per request. Cursors belong to their phase, never another table.
    let pagination: Pick<
      LegacyUsagePage,
      'isDone' | 'continueCursor' | 'splitCursor' | 'pageStatus'
    >;
    let scanned: number;
    if (args.phase === 'contents') {
      const { page, ...rest } = await ctx.db
        .query('calendarContents')
        .paginate(args.paginationOpts);
      pagination = rest;
      scanned = page.length;
      for (const content of page)
        contentCounts(
          content,
          await ctx.db.get('calendars', content.calendarId),
          counts,
          requirementIds,
        );
    } else if (args.phase === 'historicalSnapshots') {
      const { page, ...rest } = await ctx.db
        .query('calendarSnapshots')
        .paginate(args.paginationOpts);
      pagination = rest;
      scanned = page.length;
      for (const snapshot of page) {
        const state = snapshot.state;
        if (state.schemaVersion !== 4) continue;
        countHistoricalStages(state.offers, counts, true);
        // Historical metadata is self-contained; no live row or converter is consulted.
        if (state.year <= 2026) counts.historicalYearThrough2026Snapshots++;
        if (state.legacySecondSemesterIntake !== undefined)
          counts.historicalLegacySecondSemesterIntakeContents++;
        for (const event of state.events) {
          if (event.recordType !== undefined && event.recordType !== 'event')
            counts.historicalNonEventRecords++;
          if (event.recordType === 'prior-reference') counts.historicalPriorReferenceRecords++;
          if (event.recordType === 'retired-stage') counts.historicalRetiredStageRecords++;
        }
      }
    } else if (args.phase === 'calendars') {
      const { page, ...rest } = await ctx.db.query('calendars').paginate(args.paginationOpts);
      pagination = rest;
      scanned = page.length;
      for (const calendar of page) {
        counts.calendars++;
        // Only one content is hydrated per calendar (≤ 10 MiB total), including trash.
        const content = await ctx.db
          .query('calendarContents')
          .withIndex('by_calendarId', (q) => q.eq('calendarId', calendar._id))
          .first();
        if (!content) counts.calendarsWithoutContent++;
        if (calendar.year <= 2026) {
          counts.calendarsThrough2026++;
          calendarsByCampus.set(
            calendar.campusId,
            (calendarsByCampus.get(calendar.campusId) ?? 0) + 1,
          );
        }
        if (calendar.year === 8700) {
          counts.year8700Calendars++;
          year8700Calendars.push({
            calendarId: calendar._id,
            campusId: calendar.campusId,
            hasContent: content !== null,
            trashed: calendar.deletedAt !== undefined,
          });
        }
      }
    } else if (args.phase === 'campuses') {
      const { page, ...rest } = await ctx.db.query('campuses').paginate(args.paginationOpts);
      pagination = rest;
      scanned = page.length;
      counts.campuses = scanned;
      for (const campus of page) {
        if (!campus.name.startsWith(releaseResiduePrefix)) continue;
        const hasAnyUsers =
          (await ctx.db
            .query('users')
            .withIndex('by_campusId', (q) => q.eq('campusId', campus._id))
            .first()) !== null;
        counts.releaseResidueCampuses++;
        if (hasAnyUsers) counts.releaseResidueCampusesWithAnyUsers++;
        // There is no trusted operation-account marker in this schema. Even inactive users guard it.
        releaseResidueCampuses.push({ campusId: campus._id, hasAnyUsers });
      }
    } else {
      const { page, ...rest } = await ctx.db
        .query('migrationResults')
        .withIndex('by_key_and_reference', (q) => q.eq('key', 'offers-v4'))
        .paginate(args.paginationOpts);
      pagination = rest;
      scanned = page.length;
      for (const receipt of page) {
        counts.migrationReceipts++;
        counts.receiptOrphanKeys += receipt.orphanKeys;
        if (receipt.outcome === 'orphan-content') counts.receiptOrphanContents++;
        if (receipt.outcome === 'orphan-calendar') counts.receiptOrphanCalendars++;
        if (receipt.outcome === 'failed') counts.receiptFailures++;
        if (receipt.outcome === 'converted' && receipt.sourceSchemaVersion === 2)
          counts.receiptConvertedFromV2++;
      }
    }
    return {
      phase: args.phase,
      scanned,
      ...pagination,
      counts,
      calendarsThrough2026ByCampus: [...calendarsByCampus].map(([campusId, calendars]) => ({
        campusId,
        calendars,
      })),
      legacyRequirementIds2027: [...requirementIds].map(([id, events]) => ({ id, events })),
      releaseResidueCampuses,
      year8700Calendars,
    };
  },
});
