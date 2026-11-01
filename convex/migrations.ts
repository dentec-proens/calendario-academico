import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import schema from './schema';
import type { Doc } from './_generated/dataModel';
import { legacyStatus } from '../src/domain/calendar/lifecycle';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

/**
 * Level 1: every calendar becomes a draft, trash included, so no two rows can conflict. The test
 * marker survives as a label; `version` never changes, so reviews keep their calendar version.
 */
export function purposeToStatus(row: Doc<'calendars'>) {
  if (row.status !== undefined && row.purpose === undefined) return undefined;
  return {
    status: legacyStatus(row),
    statusRevision: row.statusRevision ?? 0,
    ...(row.label === undefined && row.purpose === 'test' ? { label: 'Teste' } : {}),
    purpose: undefined,
  };
}

export const calendarPurposeToStatus = migrations.define({
  table: 'calendars',
  migrateOne: (_ctx, row) => purposeToStatus(row),
});

const pending: MigrationFunctionReference[] = [internal.migrations.calendarPurposeToStatus];

export const start = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await migrations.runSerially(ctx, pending);
    return null;
  },
});

export const status = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      state: v.union(
        v.literal('inProgress'),
        v.literal('success'),
        v.literal('failed'),
        v.literal('canceled'),
        v.literal('unknown'),
      ),
      processed: v.number(),
      error: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    if (!pending.length) return [];
    const statuses = await migrations.getStatus(ctx, { migrations: pending });
    return statuses.map(({ name, state, processed, error }) => ({
      name,
      state,
      processed,
      error: error ?? null,
    }));
  },
});
