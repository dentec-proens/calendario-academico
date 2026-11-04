import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { getFunctionName } from 'convex/server';
import { v } from 'convex/values';
import {
  convertToFormat6,
  type Format5Document,
} from '../src/domain/calendar/normalization/convert-format-6';
import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { contentHash } from './calendars/lifecycle';
import schema from './schema';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

/** CLI entry for one migration, including `dryRun` (docs/implantacao-convex-vercel.md, Comandos). */
export const run = migrations.runner();

/**
 * Format 6 of the calendar. Level 2: runs only during maintenance, after the expansion deploy, on a
 * backup rehearsed first. The pure converter stops the migration at a document it cannot validate,
 * with nothing written over it. A document already in format 6 is never rewritten, so a rerun writes
 * nothing. The conversion is representation and declared loss, never a new academic version:
 * `calendars` (version, `updatedAt`, status, authorship), `contentVersion` and decisions stay.
 * The contraction removes these migrations with the format 5 variants of the schema.
 */
function stop(table: string, id: string, reason: string): never {
  throw new Error(`Migração do formato 6 interrompida em ${table} ${id}: ${reason}`);
}

async function yearOf(
  ctx: MutationCtx,
  table: string,
  id: string,
  row: Doc<'calendarContents'> | Doc<'calendarSubmissions'>,
) {
  const calendar = await ctx.db.get('calendars', row.calendarId);
  return calendar?.year ?? stop(table, id, 'calendário inexistente');
}

const converted = (row: Doc<'calendarContents'> | Doc<'calendarSubmissions'>, year: number) => {
  const { document } = convertToFormat6(row as unknown as Format5Document, year);
  return document as unknown as typeof row & { state: { schemaVersion: 6 } };
};

/** A review would be lost, and a published document rewritten: those need the normal flow first. */
export function migrateStatusGuard(row: Pick<Doc<'calendars'>, '_id' | 'status'>) {
  if (['revisado', 'vigente', 'arquivado'].includes(row.status))
    stop('calendars', row._id, `situação ${row.status} exige decisão antes da migração`);
}

/** One content: state and institutional snapshot in one write. */
export async function migrateContent(ctx: MutationCtx, row: Doc<'calendarContents'>) {
  if (row.state.schemaVersion === 6) return;
  const { state, institutionalSnapshot } = converted(
    row,
    await yearOf(ctx, 'calendarContents', row._id, row),
  );
  await ctx.db.patch('calendarContents', row._id, { state, institutionalSnapshot } as never);
}

/** One submission: state, institutional snapshot and its fingerprint in one write. */
export async function migrateSubmission(ctx: MutationCtx, row: Doc<'calendarSubmissions'>) {
  if (row.state.schemaVersion === 6) return;
  if (contentHash(row) !== row.contentHash)
    stop('calendarSubmissions', row._id, 'o hash gravado não é o do próprio envio');
  const next = converted(row, await yearOf(ctx, 'calendarSubmissions', row._id, row));
  await ctx.db.patch('calendarSubmissions', row._id, {
    state: next.state,
    institutionalSnapshot: next.institutionalSnapshot,
    contentHash: contentHash(next),
  } as never);
}

export const format6StatusGuard = migrations.define({
  table: 'calendars',
  migrateOne: (_ctx, row) => migrateStatusGuard(row),
});

export const contentsToFormat6 = migrations.define({
  table: 'calendarContents',
  batchSize: 1,
  migrateOne: migrateContent,
});

export const submissionsToFormat6 = migrations.define({
  table: 'calendarSubmissions',
  batchSize: 1,
  migrateOne: migrateSubmission,
});

/** Reviews start again over the migrated content; the backup keeps any that existed. */
export const clearReviewVersions = migrations.define({
  table: 'reviewVersions',
  migrateOne: async (ctx, row) => {
    await ctx.db.delete('reviewVersions', row._id);
  },
});

export const clearReviews = migrations.define({
  table: 'reviews',
  migrateOne: async (ctx, row) => {
    await ctx.db.delete('reviews', row._id);
  },
});

const pending: MigrationFunctionReference[] = [
  internal.migrations.format6StatusGuard,
  internal.migrations.contentsToFormat6,
  internal.migrations.submissionsToFormat6,
  internal.migrations.clearReviewVersions,
  internal.migrations.clearReviews,
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
