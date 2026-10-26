import { v } from 'convex/values';
import type { Infer } from 'convex/values';

export const modality = v.union(
  v.literal('integrado'),
  v.literal('subsequente'),
  v.literal('graduacao'),
  v.literal('posgraduacao'),
);
export const effect = v.union(v.literal('include'), v.literal('exclude'), v.literal('note'));
export const purpose = v.union(v.literal('test'), v.literal('definitive'));
export const regime = v.union(v.literal('anual'), v.literal('semestral'), v.literal('misto'));
export const stages = v.union(v.literal(2), v.literal(3), v.literal(4));
export const period = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  targetDays: v.optional(v.number()),
});
export const historicalSource = v.object({
  historyId: v.id('histories'),
  page: v.number(),
  candidateKey: v.string(),
});
export const event = v.object({
  id: v.string(),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  kind: effect,
  evidence: v.string(),
  category: v.optional(v.string()),
  requirementId: v.optional(v.string()),
  modalities: v.optional(v.array(modality)),
  hours: v.optional(v.number()),
  assessmentAutoStart: v.optional(v.string()),
  historicalSource: v.optional(historicalSource),
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
  ...event.fields,
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
  evidence: v.string(),
});
export const contentState = v.object({
  regime,
  weekdays: v.array(v.number()),
  weekConfirmed: v.boolean(),
  weekEvidence: v.string(),
  periods: v.array(period),
  events: v.array(event),
  secondSemesterIntake: v.optional(v.boolean()),
  teacherDayDate: v.optional(v.string()),
  ignoredHistory: v.array(v.string()),
  teacherVacations: v.optional(vacations),
  assessmentStagesByModality: v.record(v.string(), stages),
});
export const domainState = v.object({
  ...contentState.fields,
  schemaVersion: v.literal(2),
  year: v.number(),
  campus: v.string(),
  modalities: v.array(modality),
  offer: modality,
});
export const historicalState = domainState;
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
export const historyDates = v.object({
  startMonth: v.number(),
  startDay: v.number(),
  endMonth: v.number(),
  endDay: v.number(),
  name: v.string(),
  sourceYear: v.union(v.number(), v.null()),
  endYear: v.union(v.number(), v.null()),
});
export const historyAnalysis = v.object({
  version: v.number(),
  pages: v.array(v.object({ page: v.number(), text: v.string() })),
  candidates: v.array(
    v.object({
      dates: v.union(historyDates, v.null()),
      page: v.number(),
      excerpt: v.string(),
      name: v.string(),
      likelyLocal: v.boolean(),
      category: v.string(),
    }),
  ),
  truncated: v.boolean(),
  needsText: v.boolean(),
  analyzedAt: v.string(),
});
export const auditTarget = v.union(
  v.object({ type: v.literal('user'), id: v.id('users') }),
  v.object({ type: v.literal('calendar'), id: v.id('calendars') }),
  v.object({ type: v.literal('history'), id: v.id('histories') }),
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
export const historyUploadInput = v.object({
  calendarId: v.id('calendars'),
  uploadId: v.string(),
  filename: v.string(),
  year: v.number(),
  notes: v.optional(v.string()),
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
