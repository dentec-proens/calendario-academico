import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { getFunctionName } from 'convex/server';
import { v } from 'convex/values';
import {
  convertToFormat7,
  type Format6Document,
} from '../src/domain/calendar/normalization/convert-format-7';
import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { contentHash } from './calendars/lifecycle';
import { schoolVacationConversions } from './format7Conversions';
import schema from './schema';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

/** CLI entry for one migration, including `dryRun` (docs/implantacao-convex-vercel.md, Comandos). */
export const run = migrations.runner();

/**
 * Format 7 of the calendar. Level 2: runs only during maintenance, after the expansion deploy, on a
 * backup rehearsed first. The pure converter stops the migration at a document it cannot validate,
 * with nothing written over it. A document already in format 7 is never rewritten, so a rerun writes
 * nothing. Every status converts, published ones included, since format 7 is the only one read;
 * `calendars` (version, `updatedAt`, status), `contentVersion`, decisions and reviews stay. The
 * contraction removes these migrations with the format 6 variant of the schema.
 */
function converted(row: Doc<'calendarContents'> | Doc<'calendarSubmissions'>) {
  try {
    return convertToFormat7(
      row as unknown as Format6Document,
      schoolVacationConversions[row.calendarId] ?? [],
    ).document.state;
  } catch (error) {
    throw new Error(
      `Migração do formato 7 interrompida em ${row._id}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** One content: only its state changes. */
export async function migrateContent(ctx: MutationCtx, row: Doc<'calendarContents'>) {
  if (row.state.schemaVersion === 7) return;
  await ctx.db.patch('calendarContents', row._id, { state: converted(row) } as never);
}

/** One submission: state and fingerprint in one write. */
export async function migrateSubmission(ctx: MutationCtx, row: Doc<'calendarSubmissions'>) {
  if (row.state.schemaVersion === 7) return;
  if (contentHash(row) !== row.contentHash)
    throw new Error(`Migração do formato 7 interrompida em ${row._id}: hash divergente.`);
  const state = converted(row);
  await ctx.db.patch('calendarSubmissions', row._id, {
    state,
    contentHash: contentHash({ ...row, state } as never),
  } as never);
}

export const contentsToFormat7 = migrations.define({
  table: 'calendarContents',
  batchSize: 1,
  migrateOne: migrateContent,
});

export const submissionsToFormat7 = migrations.define({
  table: 'calendarSubmissions',
  batchSize: 1,
  migrateOne: migrateSubmission,
});

const pending: MigrationFunctionReference[] = [
  internal.migrations.contentsToFormat7,
  internal.migrations.submissionsToFormat7,
];

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
    // In the order of `pending`, the order they run in.
    const order = pending.map((reference) => getFunctionName(reference));
    statuses.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    return statuses.map(({ name, state, processed, error }) => ({
      name,
      state,
      processed,
      error: error ?? null,
    }));
  },
});
