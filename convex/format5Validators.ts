import { v } from 'convex/values';
import { academicTerm, effect, modality, notice, vacations } from './validators';

/**
 * The stored shape of format 5, frozen for the expansion of the format 6 migration: the schema
 * accepts it only until the contraction, and no function reads or writes it except the migration.
 */
const periodAssociation = v.union(
  v.object({ status: v.literal('a-classificar') }),
  v.object({
    status: v.literal('defined'),
    offers: v.array(v.string()),
    term: academicTerm,
  }),
);
const period = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  targetDays: v.optional(v.number()),
  association: periodAssociation,
});
const eventScope = v.object({ offers: v.array(v.string()), confirmed: v.boolean() });
const stagePosition = v.union(
  v.object({ status: v.literal('unclassified'), reportedOrdinal: v.number() }),
  v.object({ status: v.literal('defined'), term: academicTerm, number: v.number() }),
);
const activityRef = v.union(
  v.object({ activityId: v.string() }),
  v.object({ activityId: v.string(), term: academicTerm }),
  v.object({ activityId: v.string(), semester: v.union(v.literal('first'), v.literal('second')) }),
  v.object({ activityId: v.string(), offerId: v.string(), position: stagePosition }),
);
const event = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  effect,
  category: v.optional(v.string()),
  activity: v.optional(activityRef),
  /** Internal date of the campus (art. 18); eligibility is checked by the domain. */
  internal: v.optional(v.literal(true)),
  scope: eventScope,
  hours: v.optional(v.number()),
  assessmentAutoStart: v.optional(v.string()),
  notice: v.optional(notice),
  deadlineAdjustment: v.optional(v.object({ date: v.string(), reviewed: v.boolean() })),
  deadlineExtensionCause: v.optional(
    v.union(v.literal('municipal-holiday'), v.literal('municipal-recess')),
  ),
});
const institutionalEventSnapshot = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  effect,
  evidence: v.string(),
  category: v.optional(v.string()),
  modalities: v.optional(v.array(modality)),
  offers: v.optional(v.array(v.string())),
  hours: v.optional(v.number()),
  assessmentAutoStart: v.optional(v.string()),
  notice: v.optional(notice),
  deadlineAdjustment: v.optional(
    v.object({ date: v.string(), evidence: v.string(), reviewed: v.boolean() }),
  ),
  deadlineExtensionCause: v.optional(
    v.union(v.literal('municipal-holiday'), v.literal('municipal-recess')),
  ),
  active: v.optional(v.boolean()),
  source: v.optional(v.string()),
  institutional: v.optional(v.boolean()),
  originalStart: v.optional(v.string()),
  originalEnd: v.optional(v.string()),
});
const organization = v.union(
  v.literal('anual'),
  v.literal('semestral'),
  v.literal('a-classificar'),
);
const calendarOffer = v.object({
  id: v.string(),
  kind: modality,
  label: v.optional(v.string()),
  delivery: v.union(v.literal('presencial'), v.literal('ead'), v.literal('a-conferir')),
  organization,
  // Reported total without a confirmed cycle, or stages per cycle.
  stages: v.optional(
    v.union(
      v.object({
        status: v.literal('reported'),
        count: v.union(v.literal(2), v.literal(3), v.literal(4)),
      }),
      v.object({
        status: v.literal('defined'),
        perTerm: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
      }),
    ),
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
const contentState = v.object({
  schemaVersion: v.literal(5),
  rulesetVersion: v.optional(v.string()),
  offers: v.array(calendarOffer),
  weekdays: v.array(v.number()),
  weekConfirmed: v.boolean(),
  periods: v.array(period),
  events: v.array(event),
  observanceDates: v.optional(v.record(v.string(), v.string())),
  teacherVacations: v.optional(vacations),
});

export { contentState as format5ContentState, institutionalEventSnapshot as format5SnapshotEntry };
