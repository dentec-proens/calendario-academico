import { v } from 'convex/values';
import { publicMember } from './authContracts';
import {
  domainState,
  modality,
  purpose,
  regime,
  reviewFields,
  reviewEntry,
  institutionalEventSnapshot,
  documentMetadata,
  historyAnalysis,
  fileFields,
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
  officialApproval: v.literal(false),
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
  kind: v.union(v.literal('include'), v.literal('exclude'), v.literal('note')),
  category: v.string(),
  evidence: v.string(),
  modalities: v.array(modality),
  active: v.boolean(),
});
export const catalogueDto = v.object({ revision: v.number(), events: v.array(catalogueEventDto) });
export const summary = v.object({
  id: v.id('calendars'),
  name: v.string(),
  campusId: v.id('campuses'),
  year: v.number(),
  modalities: v.array(modality),
  offer: modality,
  purpose,
  courses: v.string(),
  classes: v.string(),
  shifts: v.string(),
  version: v.number(),
  updatedAt: v.string(),
  createdByName: v.optional(v.string()),
  updatedByName: v.optional(v.string()),
  deletedAt: v.optional(v.string()),
});
export const historyDto = v.object({
  id: v.id('histories'),
  calendarId: v.id('calendars'),
  campusId: v.id('campuses'),
  year: v.number(),
  modalities: v.array(modality),
  ...fileFields,
  notes: v.string(),
  createdAt: v.string(),
  analyzed: v.boolean(),
  legacyAnalysisId: v.optional(v.id('historyAnalyses')),
});
export const versionDto = v.object({
  version: v.number(),
  at: v.string(),
  catalogueRevision: v.number(),
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
  versions: v.array(versionDto),
  readiness,
  institutionalEvents: v.array(institutionalEventSnapshot),
  currentCatalogueRevision: v.number(),
  currentDocuments: v.array(documentMetadata),
  histories: v.array(historyDto),
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
  modalities: v.array(modality),
  regime,
  courses: v.string(),
  classes: v.optional(v.string()),
  shifts: v.optional(v.string()),
  purpose: v.optional(purpose),
});
export const saveInput = v.object({
  unchangedOnly: v.optional(v.boolean()),
  baseAcceptance: v.optional(v.string()),
  version: v.number(),
  catalogueRevision: v.number(),
  state: v.object({
    ...domainState.fields,
    teacherDayDate: v.optional(v.union(v.string(), v.null())),
  }),
});
export const baseSnapshotDto = v.object({
  rulesetVersion: v.optional(v.string()),
  revision: v.number(),
  events: v.array(institutionalEventSnapshot),
  documents: v.array(documentMetadata),
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
const criterion = v.object({
  id: v.string(),
  title: v.string(),
  page: v.number(),
  item: v.string(),
  pattern: v.union(v.string(), v.number(), v.null()),
  signal: v.union(v.string(), v.null()),
  candidates: v.array(candidate),
  initial: v.object({ ...reviewEntry.fields, finding: v.string() }),
});
export const reviewSupportDto = v.object({
  rulesetVersion: v.optional(v.string()),
  source: v.object({ id: v.string(), year: v.number(), title: v.string(), norm: v.string() }),
  sameYear: v.boolean(),
  officialApproval: v.literal(false),
  calendar: v.object({
    id: v.id('calendars'),
    name: v.string(),
    campus: v.string(),
    year: v.number(),
    offer: modality,
    modalities: v.array(modality),
    regime,
    version: v.number(),
  }),
  criteria: v.array(criterion),
  teachingDays: v.array(
    v.object({
      modality: v.string(),
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
  review: v.union(reviewDto, v.null()),
  stale: v.boolean(),
  baseIdentity: v.optional(v.string()),
});
export const exportDto = v.object({ html: v.string(), body: v.string(), text: v.string() });
export const historyContextDto = v.object({
  history: v.object({
    ...historyDto.fields,
    analysis: v.optional(historyAnalysis),
    latestAnalysisId: v.optional(v.id('historyAnalyses')),
    originalAnalysisId: v.optional(v.id('historyAnalyses')),
    analyses: v.optional(
      v.array(
        v.object({
          analysisId: v.id('historyAnalyses'),
          extractorVersion: v.number(),
          pdfHash: v.string(),
          analyzedAt: v.string(),
        }),
      ),
    ),
  }),
});
