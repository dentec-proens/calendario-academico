import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
import {
  contentState,
  modality,
  purpose,
  snapshotFields,
  reviewFields,
  fileFields,
  documentType,
  documentStatus,
  institutionalEvent,
  auditTarget,
} from './validators';

export default defineSchema({
  ...authTables,
  users: defineTable({
    ...authTables.users.validator.fields,
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal('ADMIN'), v.literal('CAMPUS'), v.literal('PARECERISTA')),
    campusId: v.optional(v.id('campuses')),
    active: v.boolean(),
    loginMethod: v.union(v.literal('local'), v.literal('google'), v.literal('invite')),
    inviteExpiresAt: v.optional(v.number()),
    sessionGeneration: v.optional(v.number()),
    removedAt: v.optional(v.number()),
    nativeInviteHash: v.optional(v.string()),
    nativeResetHash: v.optional(v.string()),
    googleSubject: v.optional(v.string()),
    googleLastLoginAt: v.optional(v.number()),
  })
    .index('email', ['email'])
    .index('phone', ['phone'])
    .index('by_role_and_active', ['role', 'active'])
    .index('by_campusId', ['campusId']),
  authSessions: defineTable({
    ...authTables.authSessions.validator.fields,
    generation: v.optional(v.number()),
    authenticatedAt: v.optional(v.number()),
  })
    .index('userId', ['userId'])
    .index('by_userId_generation', ['userId', 'generation'])
    .index('by_expirationTime', ['expirationTime']),
  authVerificationCodes: defineTable({
    ...authTables.authVerificationCodes.validator.fields,
  })
    .index('accountId', ['accountId'])
    .index('code', ['code'])
    .index('by_expirationTime', ['expirationTime']),
  campuses: defineTable({ name: v.string(), archived: v.boolean() }).index('by_name', ['name']),
  calendars: defineTable({
    campusId: v.id('campuses'),
    year: v.number(),
    offerKinds: v.array(modality),
    purpose,
    courses: v.string(),
    classes: v.string(),
    shifts: v.string(),
    version: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id('users')),
  })
    .index('by_campusId_and_year', ['campusId', 'year'])
    .index('by_campusId_and_deletedAt', ['campusId', 'deletedAt'])
    .index('by_year', ['year'])
    .index('by_deletedAt', ['deletedAt']),
  migrationReports: defineTable({
    key: v.literal('offers-v4'),
    converted: v.number(),
    alreadyV4: v.number(),
    pending: v.number(),
    orphanContents: v.number(),
    orphanCalendars: v.number(),
    orphanKeys: v.number(),
    failures: v.number(),
    purged: v.object({
      reviewVersions: v.number(),
      reviews: v.number(),
      calendarVersions: v.number(),
      calendarSnapshots: v.number(),
      calendarAliases: v.number(),
    }),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    purgeAuditId: v.optional(v.id('audit')),
  }).index('by_key', ['key']),
  migrationResults: defineTable({
    key: v.literal('offers-v4'),
    reference: v.string(),
    contentId: v.optional(v.id('calendarContents')),
    calendarId: v.optional(v.id('calendars')),
    outcome: v.union(
      v.literal('converted'),
      v.literal('already-v4'),
      v.literal('orphan-content'),
      v.literal('orphan-calendar'),
      v.literal('failed'),
    ),
    pending: v.boolean(),
    orphanKeys: v.number(),
    sourceSchemaVersion: v.optional(v.number()),
    oldStateHash: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index('by_key_and_reference', ['key', 'reference']),
  calendarContents: defineTable({
    calendarId: v.id('calendars'),
    state: contentState,
    catalogueRevision: v.number(),
    institutionalSnapshot: snapshotFields.institutionalEvents,
    documentSnapshot: snapshotFields.documentSnapshot,
  }).index('by_calendarId', ['calendarId']),
  calendarVersions: defineTable({
    calendarId: v.id('calendars'),
    version: v.number(),
    at: v.number(),
    catalogueRevision: v.number(),
    snapshotId: v.id('calendarSnapshots'),
  }).index('by_calendarId_and_version', ['calendarId', 'version']),
  calendarSnapshots: defineTable(snapshotFields),
  documents: defineTable({
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
  })
    .index('by_year_and_type_and_status', ['year', 'type', 'status'])
    .index('by_year_and_publishedAt', ['year', 'publishedAt'])
    .index('by_year_and_status', ['year', 'status'])
    .index('by_status', ['status'])
    .index('by_publishedAt', ['publishedAt'])
    .index('by_storageId', ['storageId']),
  reviews: defineTable(reviewFields).index('by_calendarId', ['calendarId']),
  reviewVersions: defineTable({
    reviewId: v.id('reviews'),
    ...reviewFields,
  }).index('by_reviewId_and_revision', ['reviewId', 'revision']),
  institutionalEvents: defineTable({
    code: v.string(),
    year: v.number(),
    ...institutionalEvent.fields,
  })
    .index('by_year', ['year'])
    .index('by_code', ['code']),
  catalogueRevisions: defineTable({
    year: v.number(),
    revision: v.number(),
  }).index('by_year', ['year']),
  institutionSettings: defineTable({
    key: v.literal('catalogue'),
    revision: v.number(),
  }).index('by_key', ['key']),
  invitations: defineTable({
    tokenHash: v.string(),
    userId: v.id('users'),
    expiresAt: v.number(),
    createdBy: v.id('users'),
    createdAt: v.number(),
    revoked: v.boolean(),
    usedAt: v.optional(v.number()),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_userId', ['userId'])
    .index('by_expiresAt', ['expiresAt']),
  passwordResets: defineTable({
    tokenHash: v.string(),
    userId: v.id('users'),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_userId', ['userId'])
    .index('by_expiresAt', ['expiresAt']),
  audit: defineTable({
    at: v.number(),
    actorId: v.optional(v.id('users')),
    actorLabel: v.optional(v.string()),
    details: v.optional(v.string()),
    action: v.string(),
    target: auditTarget,
    campusId: v.optional(v.id('campuses')),
    calendarId: v.optional(v.id('calendars')),
    version: v.optional(v.number()),
  })
    .index('by_at', ['at'])
    .index('by_campusId_and_at', ['campusId', 'at'])
    .index('by_calendarId_and_action_and_at', ['calendarId', 'action', 'at']),
  nativeUploads: defineTable({
    uploadId: v.string(),
    ownerId: v.id('users'),
    filename: v.string(),
    size: v.number(),
    expiresAt: v.number(),
    storageId: v.optional(v.id('_storage')),
    hash: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    verifiedIngress: v.optional(v.literal(true)),
    consumedAt: v.optional(v.number()),
  })
    .index('by_uploadId', ['uploadId'])
    .index('by_ownerId', ['ownerId'])
    .index('by_storageId', ['storageId'])
    .index('by_expiresAt', ['expiresAt']),
  nativeFileTickets: defineTable({
    tokenHash: v.string(),
    storageId: v.id('_storage'),
    filename: v.string(),
    expiresAt: v.number(),
    ephemeral: v.boolean(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_expiresAt', ['expiresAt']),
  operationalControl: defineTable({
    key: v.literal('release'),
    paused: v.boolean(),
    commit: v.string(),
    changedAt: v.number(),
  }).index('by_key', ['key']),
  operationalLeases: defineTable({
    operation: v.string(),
    credentialKey: v.optional(v.string()),
    startedAt: v.number(),
    actorId: v.optional(v.id('users')),
  })
    .index('by_startedAt', ['startedAt'])
    .index('by_credentialKey', ['credentialKey']),
});
