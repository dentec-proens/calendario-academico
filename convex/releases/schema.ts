import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { migration, planValidator } from './plan';
export const safeProgress = v.object({
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
});
const fastIdentity = {
  mode: v.literal('fast'),
  commit: v.string(),
  owner: v.string(),
  candidateId: v.string(),
  functionSpecHash: v.string(),
  skippedValidations: v.object({
    check: v.literal(true),
    smoke: v.literal(true),
    compatibility: v.literal(true),
    backup: v.literal(true),
  }),
};
export const fastProgress = v.object({
  ...fastIdentity,
  key: v.literal('backend'),
  previousBackend: v.string(),
  previousFrontend: v.string(),
  phase: v.union(v.literal('published'), v.literal('complete')),
  changedAt: v.number(),
});
// Read-only historical receipt format. The one-off contract executor has been removed.
const contractIdentity = {
  mode: v.literal('contract'),
  commit: v.string(),
  owner: v.string(),
  candidateId: v.string(),
  functionSpecHash: v.string(),
  planDigest: v.string(),
  sourceDigest: v.string(),
  schemaDigest: v.string(),
  rehearsalDigest: v.string(),
  verificationDigest: v.string(),
};
export const contractProgress = v.object({
  ...contractIdentity,
  key: v.literal('backend'),
  previousBackend: v.string(),
  previousFrontend: v.string(),
  phase: v.union(v.literal('published'), v.literal('validated'), v.literal('complete')),
  changedAt: v.number(),
});
export const releaseTables = {
  releaseMigrationDefinitions: defineTable({ id: v.string(), definition: migration }).index(
    'by_migrationId',
    ['id'],
  ),
  releaseReceipts: defineTable(
    v.union(
      v.object({
        commit: v.string(),
        owner: v.string(),
        contractHash: v.string(),
        planHash: v.string(),
        candidateId: v.string(),
        completedAt: v.number(),
      }),
      v.object({ ...fastIdentity, completedAt: v.number() }),
      v.object({ ...contractIdentity, completedAt: v.number() }),
    ),
  ).index('by_commit', ['commit']),
  releaseProgress: defineTable(v.union(safeProgress, fastProgress, contractProgress)).index(
    'by_key',
    ['key'],
  ),
};
