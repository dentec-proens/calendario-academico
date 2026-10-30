import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { v } from 'convex/values';
import { components } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import schema from './schema';
import type { MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { archive } from './calendars/record';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

// Scope is fixed to calendars already present when this operation was authorized.
const cutoff = 1793359579195;
export async function initializePresencialAndPurgeTrash(ctx: MutationCtx, row: Doc<'calendars'>) {
  if (row._creationTime > cutoff) return;
  const contents = await ctx.db
    .query('calendarContents')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', row._id))
    .take(2);
  if (contents.length !== 1) throw new Error('Calendário sem conteúdo único.');
  const content = contents[0];
  if (row.deletedAt !== undefined) {
    if (row.deletedAt > cutoff) return;
    const history = await ctx.db
      .query('calendarVersions')
      .withIndex('by_calendarId_and_version', (q) => q.eq('calendarId', row._id))
      .first();
    const review = await ctx.db
      .query('reviews')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', row._id))
      .first();
    if (history || review) throw new Error('Lixeira com histórico ou parecer inesperado.');
    await ctx.db.delete('calendarContents', content._id);
    await ctx.db.delete('calendars', row._id);
    await ctx.db.insert('audit', {
      at: Date.now(),
      action: 'PURGE_CALENDAR_TRASH',
      target: { type: 'archived', reference: `trash-20261030:${row._id}` },
      calendarId: row._id,
      campusId: row.campusId,
      version: row.version,
    });
    return;
  }
  if (!content.state.offers.some((offer) => offer.delivery === 'a-conferir')) return;
  const offers = content.state.offers.map((offer) =>
    offer.delivery === 'a-conferir' ? { ...offer, delivery: 'presencial' as const } : offer,
  );
  await archive(ctx, row, content);
  await ctx.db.patch('calendarContents', content._id, { state: { ...content.state, offers } });
  await ctx.db.patch('calendars', row._id, { version: row.version + 1, updatedAt: Date.now() });
  await ctx.db.insert('audit', {
    at: Date.now(),
    action: 'INITIALIZE_PRESENCIAL_DELIVERY',
    target: { type: 'calendar', id: row._id },
    calendarId: row._id,
    campusId: row.campusId,
    version: row.version + 1,
  });
}
export const initializePresencialAndPurgeTrash20261030 = migrations.define({
  table: 'calendars',
  batchSize: 1,
  migrateOne: initializePresencialAndPurgeTrash,
});
const pending: MigrationFunctionReference[] = [];

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
