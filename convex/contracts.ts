import { v } from 'convex/values';
import { publicMember } from './access/contracts';
import {
  domainState,
  contentState,
  organization,
  calendarOffer,
  modality,
  effect,
  calendarStatus,
  regime,
  submissionDecision,
  reviewFields,
  reviewEntry,
  institutionalEventSnapshot,
  documentMetadata,
} from './validators';

export const readiness = v.object({
  humanReview: v.optional(
    v.object({
      current: v.boolean(),
      reviewedCriterionIds: v.array(v.string()),
    }),
  ),
  ready: v.boolean(),
  issues: v.array(v.string()),
  warnings: v.array(v.string()),
  /** True only for a published calendar. */
  officialApproval: v.boolean(),
});
export const campusDto = v.object({
  id: v.id('campuses'),
  name: v.string(),
  archived: v.boolean(),
});
export const catalogueEventDto = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  effect,
  category: v.string(),
  evidence: v.string(),
  modalities: v.array(modality),
  active: v.boolean(),
});
export const catalogueDto = v.object({
  revision: v.number(),
  events: v.array(catalogueEventDto),
});
export const summary = v.object({
  id: v.id('calendars'),
  name: v.string(),
  campusId: v.id('campuses'),
  campusName: v.string(),
  year: v.number(),
  offerKinds: v.array(modality),
  status: calendarStatus,
  statusRevision: v.number(),
  label: v.optional(v.string()),
  derivedFrom: v.optional(v.id('calendars')),
  seiProcess: v.optional(v.string()),
  publishedAt: v.optional(v.string()),
  archivedAt: v.optional(v.string()),
  supersededByName: v.optional(v.string()),
  courses: v.string(),
  classes: v.string(),
  shifts: v.string(),
  version: v.number(),
  updatedAt: v.string(),
  createdByName: v.optional(v.string()),
  updatedByName: v.optional(v.string()),
  deletedAt: v.optional(v.string()),
});
export const reviewAssignee = v.union(
  v.null(),
  v.object({ id: v.id('users'), name: v.string(), at: v.string() }),
);
export const queueCount = v.object({ count: v.number(), more: v.boolean() });

export const reviewQueueItem = v.object({
  ...summary.fields,
  assignee: reviewAssignee,
  submission: v.union(
    v.null(),
    v.object({
      id: v.id('calendarSubmissions'),
      sequence: v.number(),
      submittedAt: v.string(),
      resubmission: v.boolean(),
    }),
  ),
  review: v.union(
    v.null(),
    v.object({
      revision: v.number(),
      reviewerName: v.string(),
      updatedAt: v.string(),
      reviewed: v.number(),
      total: v.number(),
      calendarChanged: v.boolean(),
      otherSubmission: v.boolean(),
    }),
  ),
});
export const decisionDto = v.object({
  ...submissionDecision.fields,
  at: v.string(),
  by: v.optional(submissionDecision.fields.by),
});
export const currentSubmissionDto = v.object({
  id: v.id('calendarSubmissions'),
  sequence: v.number(),
  submittedAt: v.string(),
  submittedBy: v.string(),
  submittedFrom: v.union(v.literal('rascunho'), v.literal('devolvido')),
  previousSubmissionId: v.optional(v.id('calendarSubmissions')),
  outcome: v.union(
    v.literal('submitted'),
    v.literal('withdrawn'),
    v.literal('returned'),
    v.literal('concluded'),
    v.literal('reopened'),
    v.literal('published'),
  ),
});
export const lastReturnDto = v.object({
  submissionId: v.id('calendarSubmissions'),
  sequence: v.number(),
  at: v.string(),
  note: v.string(),
  by: v.optional(v.string()),
});
export const submissionListItem = v.object({
  id: v.id('calendarSubmissions'),
  calendarId: v.id('calendars'),
  sequence: v.number(),
  submittedAt: v.string(),
  submittedBy: v.string(),
  submittedFrom: v.union(v.literal('rascunho'), v.literal('devolvido')),
  previousSubmissionId: v.optional(v.id('calendarSubmissions')),
  contentVersion: v.number(),
  decisions: v.array(decisionDto),
});
export const submissionContentDto = v.object({
  ...submissionListItem.fields,
  state: domainState,
  catalogueRevision: v.number(),
  institutionalSnapshot: v.array(institutionalEventSnapshot),
  documentSnapshot: v.array(documentMetadata),
  offerKinds: v.array(modality),
});
export const reviewDto = v.object({
  ...reviewFields,
  updatedAt: v.string(),
  documentSnapshot: v.array(documentMetadata),
  officialApproval: v.literal(false),
});
export const calendarDto = v.object({
  ...summary.fields,
  state: domainState,
  catalogueRevision: v.number(),
  documentSnapshot: v.array(documentMetadata),
  institutionalSnapshot: v.array(institutionalEventSnapshot),
  submission: v.union(v.null(), currentSubmissionDto),
  lastReturn: v.union(v.null(), lastReturnDto),
  readiness,
  institutionalEvents: v.array(institutionalEventSnapshot),
  currentCatalogueRevision: v.number(),
});
export const bootstrapDto = v.object({
  user: publicMember,
  campuses: v.array(campusDto),
  catalogue: catalogueDto,
  calendars: v.array(summary),
  users: v.array(publicMember),
});
export const createInput = v.object({
  campusId: v.id('campuses'),
  year: v.number(),
  offers: v.array(v.object({ kind: modality, organization, label: v.optional(v.string()) })),
});
export const identityInput = v.object({
  courses: v.string(),
  classes: v.string(),
  shifts: v.string(),
});
export const saveState = v.object({
  ...contentState.fields,
  year: v.number(),
  campus: v.string(),
});
const saveFields = {
  version: v.number(),
  catalogueRevision: v.number(),
};
export const saveInput = v.object({ ...saveFields, state: saveState });
export const baseSnapshotDto = v.object({
  rulesetVersion: v.optional(v.string()),
  revision: v.number(),
  events: v.array(institutionalEventSnapshot),
});
export const saveResult = v.object({
  base: baseSnapshotDto,
  version: v.number(),
  state: domainState,
  updatedAt: v.string(),
  unchanged: v.optional(v.boolean()),
  readiness,
});
export const reviewInput = v.object({
  /**
   * Format of the calendar the reviewer opened. Criteria entries name no date, so without it a
   * client built for an earlier format could still save a review over a converted calendar; the literal
   * refuses it.
   */
  schemaVersion: v.literal(6),
  rulesetVersion: v.optional(v.string()),
  baseIdentity: v.optional(v.string()),
  revision: v.number(),
  calendarVersion: v.number(),
  catalogueRevision: v.number(),
  conclusion: v.string(),
  entries: v.array(reviewEntry),
  processNumber: v.optional(v.string()),
  applicableNorm: v.optional(v.string()),
  acknowledgeStale: v.optional(v.boolean()),
  /** The round the reviewer opened; a review never lands on a later submission. */
  submissionId: v.optional(v.id('calendarSubmissions')),
});
export const catalogueInput = v.object({
  ...catalogueEventDto.fields,
  id: v.optional(v.string()),
  revision: v.number(),
});
const candidate = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  evidence: v.string(),
});
const planCoverage = v.union(v.literal('pending'), v.literal('partial'), v.literal('complete'));
const planExecution = v.union(
  v.literal('planned'),
  v.literal('published'),
  v.literal('unclassified'),
);
const reviewEvidence = v.union(
  v.object({
    kind: v.literal('counts'),
    provisional: v.boolean(),
    issue: v.optional(v.string()),
    rows: v.array(
      v.object({
        offer: v.string(),
        period: v.optional(v.string()),
        days: v.number(),
        minimum: v.union(v.number(), v.null()),
        met: v.union(v.boolean(), v.null()),
      }),
    ),
  }),
  v.object({
    kind: v.literal('dates'),
    state: v.union(
      v.literal('compared'),
      v.literal('not-applied'),
      v.literal('scope'),
      v.literal('empty'),
      v.literal('listed'),
    ),
    withinWindow: v.optional(v.boolean()),
    rows: v.array(v.object({ label: v.string(), start: v.string(), end: v.string() })),
  }),
  v.object({
    kind: v.literal('coverage'),
    rows: v.array(
      v.object({
        offer: v.string(),
        activity: v.string(),
        applicability: v.union(
          v.literal('required'),
          v.literal('optional'),
          v.literal('unconfigured'),
        ),
        coverage: planCoverage,
        execution: v.union(planExecution, v.null()),
        issues: v.array(v.string()),
        warnings: v.array(v.string()),
      }),
    ),
  }),
  v.object({ kind: v.literal('search') }),
  v.object({ kind: v.literal('documental') }),
  v.object({ kind: v.literal('unavailable'), reason: v.string() }),
);
const criterion = v.object({
  id: v.string(),
  title: v.string(),
  item: v.string(),
  pattern: v.union(v.string(), v.number(), v.null()),
  requirement: v.union(v.string(), v.null()),
  source: v.string(),
  evidence: reviewEvidence,
  /** Dates linked to the activities of the criterion. */
  linkedRecords: v.array(candidate),
  /** Records found only by name and category: a hint, never evidence. */
  candidates: v.array(candidate),
  /** Internal dates (art. 18): listed apart, never evidence of the criterion. */
  internalDates: v.array(candidate),
  toCheck: v.array(v.string()),
  suggestion: v.union(
    v.literal('ATENDIDO'),
    v.literal('NAO_ATENDIDO'),
    v.literal('NAO_APLICAVEL'),
    v.null(),
  ),
  initial: v.object({ ...reviewEntry.fields, finding: v.string() }),
});
export const reviewSupportDto = v.object({
  assignee: reviewAssignee,
  rulesetVersion: v.optional(v.string()),
  source: v.object({
    id: v.string(),
    year: v.number(),
    title: v.string(),
    norm: v.string(),
  }),
  sameYear: v.boolean(),
  scopeConfirmed: v.boolean(),
  notEvaluated: v.array(v.string()),
  officialApproval: v.boolean(),
  status: calendarStatus,
  statusRevision: v.number(),
  submission: v.union(v.null(), currentSubmissionDto),
  calendar: v.object({
    id: v.id('calendars'),
    name: v.string(),
    campus: v.string(),
    year: v.number(),
    offerKinds: v.array(modality),
    offers: v.array(calendarOffer),
    regime,
    version: v.number(),
  }),
  criteria: v.array(criterion),
  teachingDays: v.array(
    v.object({
      offerId: v.string(),
      label: v.string(),
      total: v.number(),
      byPeriod: v.record(v.string(), v.number()),
      provisional: v.boolean(),
    }),
  ),
  conflicts: v.array(
    v.object({
      date: v.string(),
      code: v.string(),
      inclusionIds: v.array(v.string()),
      exclusionIds: v.array(v.string()),
    }),
  ),
  countError: v.union(v.string(), v.null()),
  initialConclusion: v.string(),
  catalogueRevision: v.number(),
  baseCompatible: v.boolean(),
  review: v.union(reviewDto, v.null()),
  stale: v.boolean(),
  baseIdentity: v.optional(v.string()),
});
export const exportDto = v.object({
  html: v.string(),
  body: v.string(),
  text: v.string(),
});
