import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { migration, planValidator } from './plan';
export const releaseTables = {
  releaseMigrationDefinitions: defineTable({ id: v.string(), definition: migration }).index(
    'by_migrationId',
    ['id'],
  ),
  releaseReceipts: defineTable({
    commit: v.string(),
    owner: v.string(),
    contractHash: v.string(),
    planHash: v.string(),
    candidateId: v.string(),
    completedAt: v.number(),
  }).index('by_commit', ['commit']),
  releaseProgress: defineTable({
    key: v.literal('backend'),
    commit: v.string(),
    previousBackend: v.string(),
    previousFrontend: v.string(),
    owner: v.string(),
    contractHash: v.string(),
    planHash: v.string(),
    plan: planValidator,
    phase: v.union(v.literal('expanded'), v.literal('validated'), v.literal('complete')),
    candidateId: v.optional(v.string()),
    migrations: v.array(
      v.object({
        id: v.string(),
        cursor: v.union(v.string(), v.null()),
        done: v.boolean(),
        count: v.number(),
        verifyCursor: v.union(v.string(), v.null()),
        verified: v.boolean(),
      }),
    ),
    changedAt: v.number(),
  }).index('by_key', ['key']),
};
