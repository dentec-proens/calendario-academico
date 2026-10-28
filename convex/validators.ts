import { modalityIds, academicTerms, assessmentStageValues } from '../src/calendar-config';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';

export const modality = v.union(...modalityIds.map((id) => v.literal(id)));
export const effect = v.union(v.literal('include'), v.literal('exclude'), v.literal('note'));
export const purpose = v.union(v.literal('test'), v.literal('definitive'));
export const regime = v.union(
  v.literal('anual'),
  v.literal('semestral'),
  v.literal('misto'),
  v.literal('a-classificar'),
);
export const academicTerm = v.union(...academicTerms.map((term) => v.literal(term)));
export const periodAssociation = v.union(
  v.object({ status: v.literal('a-classificar') }),
  v.object({ status: v.literal('defined'), modalities: v.array(modality), term: academicTerm }),
);
export const stages = v.union(...assessmentStageValues.map((count) => v.literal(count)));
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
  evidence: v.optional(v.string()),
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
  deadlineAdjustment: v.optional(
    v.object({ date: v.string(), evidence: v.optional(v.string()), reviewed: v.boolean() }),
  ),
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
// Public output compatibility for tabs published before manual sources were retired.
// These fields carry generated record identities only; they are never stored as manual sources.
export const legacyCalendarEvent = v.object({
  ...event.fields,
  evidence: v.string(),
  recordType: v.optional(v.union(v.literal('event'), v.literal('prior-reference'))),
  deadlineAdjustment: v.optional(
    v.object({ date: v.string(), evidence: v.string(), reviewed: v.boolean() }),
  ),
});
export const institutionalEventSnapshot = v.object({
  ...legacyCalendarEvent.fields,
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
  evidence: v.optional(v.string()),
});
export const contentState = v.object({
  // Missing on persisted v2 content; retained on new content to prevent downgrade.
  schemaVersion: v.optional(v.union(v.literal(2), v.literal(3))),
  rulesetVersion: v.optional(v.string()),
  scopeConfirmation: v.optional(
    v.object({
      status: v.union(v.literal('covered'), v.literal('own-regulation')),
      source: v.optional(v.string()),
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
          source: v.optional(v.string()),
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
  // Legacy input/storage slot accepted during compatible rollout; never written by the app.
  weekEvidence: v.optional(v.string()),
  periods: v.array(period),
  events: v.array(event),
  secondSemesterIntake: v.optional(v.boolean()),
  teacherDayDate: v.optional(v.string()),
  teacherVacations: v.optional(vacations),
  assessmentStagesByModality: v.record(v.string(), stages),
});
export const domainState = v.object({
  ...contentState.fields,
  schemaVersion: v.union(v.literal(2), v.literal(3)),
  year: v.number(),
  campus: v.string(),
  modalities: v.array(modality),
  offer: modality,
});
export const historicalState = domainState;
export const domainStateDto = v.object({
  ...domainState.fields,
  weekEvidence: v.string(),
  events: v.array(legacyCalendarEvent),
  scopeConfirmation: v.optional(
    v.object({
      status: v.union(v.literal('covered'), v.literal('own-regulation')),
      source: v.string(),
    }),
  ),
  teacherVacations: v.optional(v.object({ ...vacations.fields, evidence: v.string() })),
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
export const snapshotFields = {
  state: historicalState,
  purpose: v.optional(purpose),
  at: v.number(),
  catalogueRevision: v.number(),
  institutionalEvents: v.array(institutionalEventSnapshot),
  documentSnapshot: v.array(documentSnapshot),
};
export const snapshotDtoFields = { ...snapshotFields, state: domainStateDto };
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
export const auditTarget = v.union(
  v.object({ type: v.literal('user'), id: v.id('users') }),
  v.object({ type: v.literal('calendar'), id: v.id('calendars') }),
  v.object({ type: v.literal('document'), id: v.id('documents') }),
  v.object({ type: v.literal('campus'), id: v.id('campuses') }),
  v.object({ type: v.literal('institutionalEvent'), id: v.id('institutionalEvents') }),
  v.object({ type: v.literal('archived'), reference: v.string() }),
);
export type ContentState = Infer<typeof contentState>;
export type DomainState = Infer<typeof domainState>;
export type ReviewFields = { [K in keyof typeof reviewFields]: Infer<(typeof reviewFields)[K]> };

export const pdfRequest = v.object({
  id: v.id('calendars'),
  version: v.number(),
  catalogueRevision: v.number(),
  copy: v.optional(v.boolean()),
});

export const documentUploadInput = v.object({
  uploadId: v.string(),
  filename: v.string(),
  year: v.number(),
  type: documentType,
  title: v.string(),
  source: v.string(),
});
export const fileDownload = v.object({ url: v.string(), filename: v.string() });
export const documentMetadata = v.object({
  ...documentSnapshot.fields,
  createdAt: v.string(),
  publishedAt: v.optional(v.string()),
  archivedAt: v.optional(v.string()),
});
