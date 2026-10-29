// Frozen v2/v3 table and history validators for release A. Independent of v4 contracts.
import { v } from 'convex/values';

export const modality = v.union(
  v.literal('integrado'),
  v.literal('subsequente'),
  v.literal('graduacao'),
  v.literal('posgraduacao'),
);
export const effect = v.union(v.literal('include'), v.literal('exclude'), v.literal('note'));
export const purpose = v.union(v.literal('test'), v.literal('definitive'));
export const regime = v.union(
  v.literal('anual'),
  v.literal('semestral'),
  v.literal('misto'),
  v.literal('a-classificar'),
);
export const academicTerm = v.union(v.literal('annual'), v.literal('first'), v.literal('second'));
export const periodAssociation = v.union(
  v.object({ status: v.literal('a-classificar') }),
  v.object({
    status: v.literal('defined'),
    modalities: v.array(modality),
    term: academicTerm,
  }),
);
export const stages = v.union(v.literal(2), v.literal(3), v.literal(4));
export const period = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  targetDays: v.optional(v.number()),
  association: v.optional(periodAssociation),
});
export const event = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  kind: effect,
  category: v.optional(v.string()),
  requirementId: v.optional(v.string()),
  modalities: v.optional(v.array(modality)),
  hours: v.optional(v.number()),
  assessmentAutoStart: v.optional(v.string()),
  recordType: v.optional(
    v.union(v.literal('event'), v.literal('prior-reference'), v.literal('retired-stage')),
  ),
  publicationStatus: v.optional(v.union(v.literal('planned'), v.literal('published'))),
  admission: v.optional(
    v.object({
      type: v.union(v.literal('regular'), v.literal('transfer')),
      year: v.number(),
      term: academicTerm,
      periodId: v.optional(v.string()),
    }),
  ),
  deadlineAdjustment: v.optional(v.object({ date: v.string(), reviewed: v.boolean() })),
  deadlineExtensionCause: v.optional(
    v.union(v.literal('municipal-holiday'), v.literal('municipal-recess')),
  ),
});
export const vacations = v.object({
  firstStart: v.string(),
  firstEnd: v.string(),
  secondStart: v.optional(v.string()),
  secondEnd: v.optional(v.string()),
  thirdStart: v.optional(v.string()),
  thirdEnd: v.optional(v.string()),
});
export const contentStateLegacy = v.object({
  // Missing on persisted v2 content; retained on new content to prevent downgrade.
  schemaVersion: v.optional(v.union(v.literal(2), v.literal(3))),
  rulesetVersion: v.optional(v.string()),
  scopeConfirmation: v.optional(
    v.object({
      status: v.union(v.literal('covered'), v.literal('own-regulation')),
    }),
  ),
  organizationByModality: v.optional(
    v.record(
      v.string(),
      v.union(v.literal('anual'), v.literal('semestral'), v.literal('a-classificar')),
    ),
  ),
  intakeByModality: v.optional(
    v.record(
      v.string(),
      v.record(
        v.string(),
        v.object({
          status: v.union(v.literal('unknown'), v.literal('yes'), v.literal('no')),
          required: v.optional(v.boolean()),
        }),
      ),
    ),
  ),
  conversion: v.optional(
    v.object({
      from: v.literal(2),
      organization: v.union(v.literal('classified'), v.literal('pending')),
      legacySecondSemesterIntake: v.optional(v.boolean()),
    }),
  ),
  regime,
  weekdays: v.array(v.number()),
  weekConfirmed: v.boolean(),
  periods: v.array(period),
  events: v.array(event),
  secondSemesterIntake: v.optional(v.boolean()),
  teacherDayDate: v.optional(v.string()),
  teacherVacations: v.optional(vacations),
  assessmentStagesByModality: v.record(v.string(), stages),
});
export const historicalStateLegacy = v.object({
  ...contentStateLegacy.fields,
  schemaVersion: v.union(v.literal(2), v.literal(3)),
  year: v.number(),
  campus: v.string(),
  modalities: v.array(modality),
  offer: modality,
});
