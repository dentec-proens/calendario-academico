import { v } from 'convex/values';

/**
 * Storage validators of the v4 calendar format, frozen as they were before the v5 conversion
 * (plan `docs/plans/2026-11-02-atividades-e-datas.md`, phase 2, step 5).
 *
 * Only the conversion reads them: the inventory test compares them with the frozen v4 inventory
 * and, from step 17a, the widened schema accepts v4 documents through them until the migration
 * converts every document. They never type a contract, an argument or a DTO, and nothing outside
 * the conversion imports them (`test/architecture/boundaries.test.ts`). The contraction release
 * removes this module (plan, section 6, “Release”, step 7).
 *
 * Every literal list is copied, not imported from the domain, so later domain changes cannot
 * widen or narrow what the v4 storage accepted.
 */
const modalityV4 = v.union(
  v.literal('integrado'),
  v.literal('subsequente'),
  v.literal('graduacao'),
  v.literal('posgraduacao'),
);
const kindV4 = v.union(v.literal('include'), v.literal('exclude'), v.literal('note'));
const academicTermV4 = v.union(v.literal('annual'), v.literal('first'), v.literal('second'));
const admissionV4 = v.object({
  type: v.union(v.literal('regular'), v.literal('transfer')),
  year: v.number(),
  term: academicTermV4,
  periodId: v.optional(v.string()),
});
const deadlineExtensionCauseV4 = v.union(
  v.literal('municipal-holiday'),
  v.literal('municipal-recess'),
);
const periodV4 = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  targetDays: v.optional(v.number()),
  association: v.union(
    v.object({ status: v.literal('a-classificar') }),
    v.object({
      status: v.literal('defined'),
      offers: v.array(v.string()),
      term: academicTermV4,
    }),
  ),
});
const vacationsV4 = v.object({
  firstStart: v.string(),
  firstEnd: v.string(),
  secondStart: v.optional(v.string()),
  secondEnd: v.optional(v.string()),
  thirdStart: v.optional(v.string()),
  thirdEnd: v.optional(v.string()),
});
const calendarOfferV4 = v.object({
  id: v.string(),
  kind: modalityV4,
  label: v.optional(v.string()),
  delivery: v.union(v.literal('presencial'), v.literal('ead'), v.literal('a-conferir')),
  organization: v.union(v.literal('anual'), v.literal('semestral'), v.literal('a-classificar')),
  legacyStageCount: v.optional(v.union(v.literal(2), v.literal(3), v.literal(4))),
  stages: v.optional(
    v.object({
      perTerm: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
    }),
  ),
  scope: v.optional(
    v.object({
      status: v.union(v.literal('covered'), v.literal('own-regulation')),
    }),
  ),
  intake: v.optional(
    v.record(
      v.string(),
      v.object({
        status: v.union(v.literal('unknown'), v.literal('yes'), v.literal('no')),
        required: v.optional(v.boolean()),
      }),
    ),
  ),
  organizationBasis: v.optional(v.string()),
});

/** A local date (`calendarContents.state.events`) in the v4 format. */
export const eventV4 = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  kind: kindV4,
  category: v.optional(v.string()),
  requirementId: v.optional(v.string()),
  offers: v.optional(v.array(v.string())),
  hours: v.optional(v.number()),
  assessmentAutoStart: v.optional(v.string()),
  recordType: v.optional(v.literal('event')),
  publicationStatus: v.optional(v.union(v.literal('planned'), v.literal('published'))),
  admission: v.optional(admissionV4),
  deadlineAdjustment: v.optional(v.object({ date: v.string(), reviewed: v.boolean() })),
  deadlineExtensionCause: v.optional(deadlineExtensionCauseV4),
});

/** A catalogue row (`institutionalEvents`, without `code` and `year`) in the v4 format. */
export const institutionalEventV4 = v.object({
  name: v.string(),
  start: v.string(),
  end: v.string(),
  kind: kindV4,
  category: v.string(),
  evidence: v.string(),
  modalities: v.array(modalityV4),
  active: v.boolean(),
});

/** An institutional date copied into a calendar (`institutionalSnapshot`) in the v4 format. */
export const institutionalEventSnapshotV4 = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  kind: kindV4,
  evidence: v.string(),
  category: v.optional(v.string()),
  requirementId: v.optional(v.string()),
  modalities: v.optional(v.array(modalityV4)),
  offers: v.optional(v.array(v.string())),
  hours: v.optional(v.number()),
  assessmentAutoStart: v.optional(v.string()),
  recordType: v.optional(v.literal('event')),
  publicationStatus: v.optional(v.union(v.literal('planned'), v.literal('published'))),
  admission: v.optional(admissionV4),
  deadlineAdjustment: v.optional(
    v.object({ date: v.string(), evidence: v.string(), reviewed: v.boolean() }),
  ),
  deadlineExtensionCause: v.optional(deadlineExtensionCauseV4),
  active: v.optional(v.boolean()),
  source: v.optional(v.string()),
  institutional: v.optional(v.boolean()),
  originalStart: v.optional(v.string()),
  originalEnd: v.optional(v.string()),
});

/** A calendar's content (`calendarContents.state`, `calendarSubmissions.state`) in the v4 format. */
export const contentStateV4 = v.object({
  schemaVersion: v.literal(4),
  rulesetVersion: v.optional(v.string()),
  offers: v.array(calendarOfferV4),
  weekdays: v.array(v.number()),
  weekConfirmed: v.boolean(),
  periods: v.array(periodV4),
  events: v.array(eventV4),
  observanceDates: v.optional(v.record(v.string(), v.string())),
  teacherVacations: v.optional(vacationsV4),
});
