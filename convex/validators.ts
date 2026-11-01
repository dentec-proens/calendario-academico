import type { readCalendarDates } from '../src/domain/calendar/civil-dates.ts';
import { modalityIds, academicTerms, assessmentStageValues } from '../src/domain/calendar/config';
import { calendarStatuses } from '../src/domain/calendar/lifecycle.ts';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';

export const modality = v.union(...modalityIds.map((id) => v.literal(id)));
export const effect = v.union(v.literal('include'), v.literal('exclude'), v.literal('note'));
export const calendarStatus = v.union(...calendarStatuses.map((status) => v.literal(status)));
export const lifecycleAction = v.union(
  v.literal('submit'),
  v.literal('withdraw'),
  v.literal('startReview'),
  v.literal('return'),
  v.literal('conclude'),
  v.literal('reopen'),
  v.literal('publish'),
  v.literal('archive'),
  v.literal('reinstate'),
);
export const regime = v.union(
  v.literal('anual'),
  v.literal('semestral'),
  v.literal('misto'),
  v.literal('a-classificar'),
);
export const academicTerm = v.union(...academicTerms.map((term) => v.literal(term)));
export const periodAssociation = v.union(
  v.object({ status: v.literal('a-classificar') }),
  v.object({
    status: v.literal('defined'),
    offers: v.array(v.string()),
    term: academicTerm,
  }),
);
export const stages = v.union(...assessmentStageValues.map((count) => v.literal(count)));
export const period = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  targetDays: v.optional(v.number()),
  association: periodAssociation,
});
export const event = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  kind: effect,
  category: v.optional(v.string()),
  requirementId: v.optional(v.string()),
  offers: v.optional(v.array(v.string())),
  hours: v.optional(v.number()),
  assessmentAutoStart: v.optional(v.string()),
  recordType: v.optional(v.literal('event')),
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
export const institutionalEvent = v.object({
  name: v.string(),
  start: v.string(),
  end: v.string(),
  kind: effect,
  category: v.string(),
  evidence: v.string(),
  modalities: v.array(modality),
  active: v.boolean(),
});
export const institutionalEventSnapshot = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  kind: effect,
  evidence: v.string(),
  category: v.optional(v.string()),
  requirementId: v.optional(v.string()),
  modalities: v.optional(v.array(modality)),
  offers: v.optional(v.array(v.string())),
  hours: v.optional(v.number()),
  assessmentAutoStart: v.optional(v.string()),
  recordType: v.optional(v.literal('event')),
  publicationStatus: v.optional(v.union(v.literal('planned'), v.literal('published'))),
  admission: v.optional(
    v.object({
      type: v.union(v.literal('regular'), v.literal('transfer')),
      year: v.number(),
      term: academicTerm,
      periodId: v.optional(v.string()),
    }),
  ),
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
export const vacations = v.object({
  firstStart: v.string(),
  firstEnd: v.string(),
  secondStart: v.optional(v.string()),
  secondEnd: v.optional(v.string()),
  thirdStart: v.optional(v.string()),
  thirdEnd: v.optional(v.string()),
});
export const organization = v.union(
  v.literal('anual'),
  v.literal('semestral'),
  v.literal('a-classificar'),
);
export const calendarOffer = v.object({
  id: v.string(),
  kind: modality,
  label: v.optional(v.string()),
  delivery: v.union(v.literal('presencial'), v.literal('ead'), v.literal('a-conferir')),
  organization,
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
export const contentState = v.object({
  schemaVersion: v.literal(4),
  rulesetVersion: v.optional(v.string()),
  offers: v.array(calendarOffer),
  weekdays: v.array(v.number()),
  weekConfirmed: v.boolean(),
  periods: v.array(period),
  events: v.array(event),
  observanceDates: v.optional(v.record(v.string(), v.string())),
  teacherVacations: v.optional(vacations),
});
export const domainState = v.object({
  ...contentState.fields,
  year: v.number(),
  campus: v.string(),
});
export const unavailableFile = v.object({
  sourceReference: v.string(),
  reason: v.literal('not_migrated'),
});
export const fileFields = {
  storageId: v.optional(v.id('_storage')),
  unavailableFile: v.optional(unavailableFile),
  hash: v.string(),
  filename: v.string(),
};
export const documentType = v.union(
  v.literal('norma'),
  v.literal('referencia'),
  v.literal('parecer'),
);
export const documentStatus = v.union(
  v.literal('rascunho'),
  v.literal('vigente'),
  v.literal('arquivado'),
);
export const documentSnapshot = v.object({
  id: v.id('documents'),
  year: v.number(),
  type: documentType,
  title: v.string(),
  source: v.string(),
  ...fileFields,
  size: v.optional(v.number()),
  status: documentStatus,
  version: v.number(),
  createdAt: v.number(),
  createdBy: v.optional(v.id('users')),
  publishedAt: v.optional(v.number()),
  publishedBy: v.optional(v.id('users')),
  archivedAt: v.optional(v.number()),
});
export const reviewEntry = v.object({
  id: v.string(),
  status: v.union(
    v.literal('PENDENTE'),
    v.literal('ATENDIDO'),
    v.literal('NAO_ATENDIDO'),
    v.literal('NAO_APLICAVEL'),
  ),
  notes: v.string(),
  reviewed: v.boolean(),
});
export const reviewFields = {
  rulesetVersion: v.optional(v.string()),
  /** Absent in reviews written before submissions existed; saving again binds the review. */
  submissionId: v.optional(v.id('calendarSubmissions')),
  baseIdentity: v.optional(v.string()),
  calendarId: v.id('calendars'),
  calendarVersion: v.number(),
  catalogueRevision: v.number(),
  revision: v.number(),
  source: v.string(),
  documentSnapshot: v.array(documentSnapshot),
  entries: v.array(reviewEntry),
  conclusion: v.string(),
  processNumber: v.string(),
  applicableNorm: v.string(),
  reviewer: v.object({ id: v.id('users'), name: v.string() }),
  updatedAt: v.number(),
};
export const actorRef = v.object({ id: v.id('users'), name: v.string() });
export const submissionDecision = v.object({
  action: v.union(
    v.literal('withdrawn'),
    v.literal('returned'),
    v.literal('concluded'),
    v.literal('reopened'),
    v.literal('published'),
  ),
  at: v.number(),
  by: actorRef,
  reviewRevision: v.optional(v.number()),
  note: v.optional(v.string()),
});
export const submissionFields = {
  calendarId: v.id('calendars'),
  sequence: v.number(),
  submittedAt: v.number(),
  submittedBy: actorRef,
  submittedFrom: v.union(v.literal('rascunho'), v.literal('devolvido')),
  /** The returned submission this one answers, when sent again after a return. */
  previousSubmissionId: v.optional(v.id('calendarSubmissions')),
  contentVersion: v.number(),
  contentHash: v.string(),
  state: contentState,
  catalogueRevision: v.number(),
  institutionalSnapshot: v.array(institutionalEventSnapshot),
  documentSnapshot: v.array(documentSnapshot),
  offerKinds: v.array(modality),
  campusName: v.string(),
  /** Append only: the current outcome is the last decision. */
  decisions: v.array(submissionDecision),
};
export const auditTarget = v.union(
  v.object({ type: v.literal('user'), id: v.id('users') }),
  v.object({ type: v.literal('calendar'), id: v.id('calendars') }),
  v.object({ type: v.literal('document'), id: v.id('documents') }),
  v.object({ type: v.literal('campus'), id: v.id('campuses') }),
  v.object({
    type: v.literal('institutionalEvent'),
    id: v.id('institutionalEvents'),
  }),
  v.object({ type: v.literal('archived'), reference: v.string() }),
);
export type ContentState = Infer<typeof contentState>;
export type DomainState = ReturnType<typeof readCalendarDates<Infer<typeof domainState>>>;
export type ReviewFields = {
  [K in keyof typeof reviewFields]: Infer<(typeof reviewFields)[K]>;
};

export const documentUploadInput = v.object({
  uploadId: v.string(),
  filename: v.string(),
  year: v.number(),
  type: documentType,
  title: v.string(),
  source: v.string(),
});
export const documentMetadata = v.object({
  ...documentSnapshot.fields,
  createdAt: v.string(),
  publishedAt: v.optional(v.string()),
  archivedAt: v.optional(v.string()),
});
