import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { getFunctionName, type WithoutSystemFields } from 'convex/server';
import { v } from 'convex/values';
import {
  convertCatalogueEventV5,
  convertContentV5,
  provenScopesOfConverted,
} from '../src/domain/calendar/migration/convert-v5';
import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { contentHash } from './calendars/lifecycle';
import schema from './schema';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

/**
 * Format 5 of the calendar (plan `docs/plans/2026-11-02-atividades-e-datas.md`, section 6 and
 * phase 2, step 17b). Level 2: run only during maintenance, after the expansion deploy, on a
 * backup rehearsed first (release, steps 2 to 5). The pure converter
 * (`src/domain/calendar/migration/convert-v5.ts`) reads each document by the v4 inventory: an
 * unknown shape (`UnknownShapeError`) or a known blocking one (`BlockedConversionError`) fails the
 * migration at that document, with nothing written over it, so the operation stops instead of
 * guessing. A document already in format 5 converts to `null` and is never rewritten, so a rerun
 * writes nothing.
 *
 * Order: the catalogue, then the contents, then the submissions (`pending`). A content reads its
 * v4 submissions to prove materialized offer lists; a submission reads its content already
 * converted. The unit of resumption is a whole document: a content converts state and snapshot in
 * one write, and a submission converts state, snapshot and `contentHash` in one write. Documents
 * reach about 900 KiB (`maximumSubmissionBytes`) and a content also reads its submissions, so
 * contents and submissions convert one per batch.
 *
 * The conversion is representation, never a new academic version: `calendars` (version,
 * `updatedAt`, status, authorship), `submission.contentVersion`, decisions, reviews and the
 * catalogue revision are not touched. Contraction (release, step 7) removes these migrations with
 * the v4 variants of the schema.
 */
type Json = Record<string, unknown>;

/** Stops the migration at a document no conversion rule covers; nothing is written over it. */
function stop(table: string, id: string, reason: string): never {
  throw new Error(`Migração v5 interrompida em ${table} ${id}: ${reason}`);
}

/** The converted fields, without the system fields the converter received with the row. */
function fields(document: Json) {
  const { _id, _creationTime, ...rest } = document;
  return rest;
}

/**
 * The schema stores a whole document in format 4 or in format 5, never a mix: a converted
 * content or submission with `schemaVersion: 5` (and a catalogue row with `effect` and no `kind`)
 * can only be written through the v5 variant, which validates every field on `replace`.
 */
function currentContent(document: Json, table: string, id: string) {
  const state = document.state as Json | undefined;
  if (state?.schemaVersion !== 5) stop(table, id, 'conversão sem schemaVersion 5');
  return fields(document);
}

async function calendarOf(
  ctx: MutationCtx,
  table: string,
  id: string,
  calendarId: Id<'calendars'>,
) {
  const calendar = await ctx.db.get('calendars', calendarId);
  return calendar ?? stop(table, id, 'calendário inexistente');
}

/** The stored submissions of a calendar; bounded by the submissions of one calendar. */
async function submissionsOf(ctx: MutationCtx, calendarId: Id<'calendars'>) {
  const rows: Doc<'calendarSubmissions'>[] = [];
  for await (const row of ctx.db
    .query('calendarSubmissions')
    .withIndex('by_calendarId_and_sequence', (q) => q.eq('calendarId', calendarId)))
    rows.push(row);
  return rows;
}

/** One catalogue row, converted to format 5 by `convertCatalogueEventV5`. */
export async function migrateCatalogueRow(ctx: MutationCtx, row: Doc<'institutionalEvents'>) {
  const conversion = convertCatalogueEventV5(row);
  if (!conversion) return;
  const converted = fields(conversion.document);
  if (!('effect' in converted) || 'kind' in converted)
    stop('institutionalEvents', row._id, 'conversão sem effect');
  await ctx.db.replace(
    'institutionalEvents',
    row._id,
    converted as WithoutSystemFields<Doc<'institutionalEvents'>>,
  );
}

/** One calendar content: state and institutional snapshot in one write. */
export async function migrateContent(ctx: MutationCtx, row: Doc<'calendarContents'>) {
  const calendar = await calendarOf(ctx, 'calendarContents', row._id, row.calendarId);
  // Only a v4 content reads its submissions: they prove materialized offer lists (plan,
  // section 5.3) and are still in format 4, since submissions convert after contents.
  const submissions = row.state.schemaVersion === 5 ? [] : await submissionsOf(ctx, row.calendarId);
  if (submissions.some((submission) => submission.state.schemaVersion === 5))
    stop('calendarContents', row._id, 'envio no formato 5 antes do conteúdo');
  const conversion = convertContentV5(row, { year: calendar.year, submissions });
  if (!conversion) return;
  await ctx.db.replace(
    'calendarContents',
    row._id,
    currentContent(conversion.document, 'calendarContents', row._id) as WithoutSystemFields<
      Doc<'calendarContents'>
    >,
  );
}

/** One submission: state, institutional snapshot and `contentHash` in one write. */
export async function migrateSubmission(ctx: MutationCtx, row: Doc<'calendarSubmissions'>) {
  const calendar = await calendarOf(ctx, 'calendarSubmissions', row._id, row.calendarId);
  if (row.state.schemaVersion === 5) {
    // Already converted: `null`, unless a v5 state sits beside a v4 base (refused).
    convertContentV5(row, { year: calendar.year, source: 'submission' });
    return;
  }
  const content = await ctx.db
    .query('calendarContents')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', row.calendarId))
    .unique();
  if (!content) stop('calendarSubmissions', row._id, 'calendário sem conteúdo');
  if (content.state.schemaVersion !== 5)
    stop('calendarSubmissions', row._id, 'conteúdo ainda no formato 4 (ordem das migrações)');
  // The stored fingerprint must be the one of the stored copy, so the recalculated one keeps
  // the relation with the current content (equal or different) that the v4 copy had.
  if (contentHash(row) !== row.contentHash)
    stop('calendarSubmissions', row._id, 'contentHash diferente do conteúdo enviado');
  const conversion = convertContentV5(row, {
    year: calendar.year,
    source: 'submission',
    provenScopes: provenScopesOfConverted(content, row),
  })!;
  const converted = currentContent(
    conversion.document,
    'calendarSubmissions',
    row._id,
  ) as WithoutSystemFields<Doc<'calendarSubmissions'>>;
  await ctx.db.replace('calendarSubmissions', row._id, {
    ...converted,
    contentHash: contentHash(converted),
  });
}

export const catalogueToV5 = migrations.define({
  table: 'institutionalEvents',
  migrateOne: migrateCatalogueRow,
});

export const contentsToV5 = migrations.define({
  table: 'calendarContents',
  batchSize: 1,
  migrateOne: migrateContent,
});

export const submissionsToV5 = migrations.define({
  table: 'calendarSubmissions',
  batchSize: 1,
  migrateOne: migrateSubmission,
});

const pending: MigrationFunctionReference[] = [
  internal.migrations.catalogueToV5,
  internal.migrations.contentsToV5,
  internal.migrations.submissionsToV5,
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
