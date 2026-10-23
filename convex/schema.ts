import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
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
