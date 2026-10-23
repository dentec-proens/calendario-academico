import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
import { entityTables } from './model';
import type { EntityTable } from './model';

export const encodedValue = v.object({
  data: v.any(),
  undefinedPaths: v.array(v.array(v.string())),
});

const entity = () =>
  defineTable({
    key: v.string(),
    position: v.number(),
    appId: v.optional(v.string()),
    campusId: v.optional(v.string()),
    calendarId: v.optional(v.string()),
    email: v.optional(v.string()),
    year: v.optional(v.number()),
    value: encodedValue,
    versionCount: v.optional(v.number()),
    historyCount: v.optional(v.number()),
  })
    .index('by_key', ['key'])
    .index('by_position', ['position'])
    .index('by_appId', ['appId'])
    .index('by_email', ['email'])
    .index('by_calendarId_and_position', ['calendarId', 'position'])
    .index('by_campusId_and_position', ['campusId', 'position']);

const entities = Object.fromEntries(entityTables.map((name) => [name, entity()])) as Record<
  EntityTable,
  ReturnType<typeof entity>
>;

export default defineSchema({
  ...entities,
  ...authTables,
  // Application IDs remain stable across the migration. Auth owns the native
  // document ID and sessions; the wrapper preserves the existing domain model.
  users: defineTable({
    ...authTables.users.validator.fields,
    key: v.string(),
    position: v.number(),
    appId: v.optional(v.string()),
    campusId: v.optional(v.string()),
    calendarId: v.optional(v.string()),
    year: v.optional(v.number()),
    value: encodedValue,
    versionCount: v.optional(v.number()),
    historyCount: v.optional(v.number()),
  })
    .index('email', ['email'])
    .index('phone', ['phone'])
    .index('by_key', ['key'])
    .index('by_position', ['position'])
    .index('by_appId', ['appId'])
    .index('by_calendarId_and_position', ['calendarId', 'position'])
    .index('by_campusId_and_position', ['campusId', 'position']),
  nativeUploads: defineTable({
    uploadId: v.string(),
    ownerId: v.id('users'),
    filename: v.string(),
    size: v.number(),
    expiresAt: v.number(),
    storageId: v.optional(v.id('_storage')),
    objectKey: v.optional(v.string()),
    hash: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
  })
    .index('by_uploadId', ['uploadId'])
    .index('by_ownerId', ['ownerId']),
  nativeFileTickets: defineTable({
    tokenHash: v.string(),
    storageId: v.id('_storage'),
    filename: v.string(),
    expiresAt: v.number(),
    ephemeral: v.boolean(),
  }).index('by_tokenHash', ['tokenHash']),
  rootFields: defineTable({
    name: v.string(),
    value: v.optional(encodedValue),
    count: v.optional(v.number()),
  }).index('by_name', ['name']),
  scopeVersions: defineTable({ key: v.string(), revision: v.number() }).index('by_key', ['key']),
  calendarVersions: defineTable({
    ownerId: v.string(),
    ordinal: v.number(),
    metadata: encodedValue,
    snapshotId: v.id('calendarSnapshots'),
  }).index('by_ownerId_and_ordinal', ['ownerId', 'ordinal']),
  calendarSnapshots: defineTable({ value: encodedValue }),
  reviewVersions: defineTable({
    ownerId: v.string(),
    ordinal: v.number(),
    value: encodedValue,
  }).index('by_ownerId_and_ordinal', ['ownerId', 'ordinal']),
  fileObjects: defineTable({ path: v.string(), storageId: v.id('_storage') })
    .index('by_path', ['path'])
    .index('by_storageId', ['storageId']),
});
