import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { v } from 'convex/values';
import { modalityIds } from '../src/domain/calendar/config';
import {
  convertCalendarV3,
  calendarV3OrphanKeys,
} from '../src/domain/calendar/normalization/conversion-v4';
import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import {
  clearCalendarResult,
  ensureMigrationReport,
  migrationKey,
  migrationReport,
  migrationResult,
  purgeMigrationRow,
  purgedTables,
  recordMigrationResult,
} from './migrationsReport';
import { migrationPending, migrationStateHash } from './migrationsState';
import schema from './schema';
import type { ContentState } from './validators';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

export const purgeReviewVersions = migrations.define({
  table: 'reviewVersions',
  batchSize: 10,
  migrateOne: (ctx, row) => purgeMigrationRow(ctx, row, 'reviewVersions'),
});
export const purgeReviews = migrations.define({
  table: 'reviews',
  batchSize: 10,
  migrateOne: (ctx, row) => purgeMigrationRow(ctx, row, 'reviews'),
});
export const purgeCalendarVersions = migrations.define({
  table: 'calendarVersions',
  batchSize: 10,
  migrateOne: (ctx, row) => purgeMigrationRow(ctx, row, 'calendarVersions'),
});
export const purgeCalendarSnapshots = migrations.define({
  table: 'calendarSnapshots',
  batchSize: 10,
  migrateOne: (ctx, row) => purgeMigrationRow(ctx, row, 'calendarSnapshots'),
});
export const purgeAliases = migrations.define({
  table: 'calendarAliases',
  batchSize: 10,
  migrateOne: (ctx, row) => purgeMigrationRow(ctx, row, 'calendarAliases'),
});

export const finalizePurge = migrations.define({
  table: 'migrationReports',
  batchSize: 1,
  customRange: (q) => q.withIndex('by_key', (index) => index.eq('key', migrationKey)),
  migrateOne: async (ctx, report) => {
    if (report.purgeAuditId) return;
    for (const table of purgedTables)
      if (await ctx.db.query(table).first()) throw new Error(`Expurgo v4 incompleto: ${table}.`);
    const purgeAuditId = await ctx.db.insert('audit', {
      at: Date.now(),
      action: 'PURGE_HISTORY_V4',
      target: { type: 'archived', reference: `${migrationKey}:purge` },
      details: JSON.stringify({ migration: migrationKey, purged: report.purged }),
    });
    await ctx.db.patch(report._id, { purgeAuditId });
  },
});

async function renameOfferKinds(
  ctx: MutationCtx,
  calendar: Doc<'calendars'>,
  kinds: NonNullable<Doc<'calendars'>['offerKinds']>,
) {
  const offerKinds = modalityIds.filter((kind) => kinds.includes(kind));
  if (
    calendar.modalities !== undefined ||
    JSON.stringify(calendar.offerKinds) !== JSON.stringify(offerKinds)
  )
    await ctx.db.patch(calendar._id, { offerKinds, modalities: undefined });
}

export const contentsToV4 = migrations.define({
  table: 'calendarContents',
  // Near-limit contents can contain 1,000 events; never use the component's default 100.
  batchSize: 10,
  migrateOne: async (ctx, content) => {
    const report = await ensureMigrationReport(ctx);
    if (!report.purgeAuditId) throw new Error('O expurgo v4 precisa terminar antes da conversão.');
    const reference = `content:${content._id}`;
    const previous = await migrationResult(ctx, reference);
    const calendar = await ctx.db.get(content.calendarId);
    if (!calendar) {
      await recordMigrationResult(ctx, {
        key: migrationKey,
        reference,
        contentId: content._id,
        calendarId: content.calendarId,
        outcome: 'orphan-content',
        pending: false,
        orphanKeys: 0,
        sourceSchemaVersion: content.state.schemaVersion ?? 2,
      });
      return;
    }
    if (content.state.schemaVersion === 4) {
      await renameOfferKinds(
        ctx,
        calendar,
        content.state.offers.map((offer) => offer.kind),
      );
      // A reset must retain the original conversion receipt, hash and audit.
      if (previous?.outcome === 'converted' || previous?.outcome === 'already-v4') return;
      await recordMigrationResult(ctx, {
        key: migrationKey,
        reference,
        contentId: content._id,
        calendarId: calendar._id,
        outcome: 'already-v4',
        pending: migrationPending(content.state, calendar.year),
        orphanKeys: 0,
        sourceSchemaVersion: 4,
      });
      return;
    }
    const context = {
      year: calendar.year,
      modalities: calendar.modalities ?? calendar.offerKinds ?? [],
    };
    const orphanKeys = Object.values(calendarV3OrphanKeys(content.state, context)).reduce(
      (total, keys) => total + keys.length,
      0,
    );
    const sourceSchemaVersion = content.state.schemaVersion ?? 2;
    const oldStateHash = migrationStateHash(content.state);
    let converted: ContentState;
    try {
      // The converter preserves legacy validated event fields. Its broader domain
      // types also accept user drafts; only persisted v2/v3 reaches this boundary.
      converted = convertCalendarV3(content.state, context) as ContentState;
    } catch (error) {
      // Throwing after recording would roll the receipt and counters back too.
      // Conversion is pure and runs before any content/calendar/audit write.
      await recordMigrationResult(ctx, {
        key: migrationKey,
        reference,
        contentId: content._id,
        calendarId: calendar._id,
        outcome: 'failed',
        pending: false,
        orphanKeys,
        sourceSchemaVersion,
        oldStateHash,
        error: error instanceof Error ? error.message : 'Falha de conversão do conteúdo.',
      });
      return;
    }
    await ctx.db.patch(content._id, { state: converted });
    await renameOfferKinds(
      ctx,
      calendar,
      converted.offers.map((offer) => offer.kind),
    );
    const audit = await ctx.db
      .query('audit')
      .withIndex('by_calendarId_and_action_and_at', (q) =>
        q.eq('calendarId', calendar._id).eq('action', 'MIGRATE_CONTENT_V4'),
      )
      .first();
    if (!audit)
      await ctx.db.insert('audit', {
        at: Date.now(),
        action: 'MIGRATE_CONTENT_V4',
        target: { type: 'calendar', id: calendar._id },
        campusId: calendar.campusId,
        calendarId: calendar._id,
        version: calendar.version,
        details: JSON.stringify({ migration: migrationKey, sourceSchemaVersion, oldStateHash }),
      });
    await recordMigrationResult(ctx, {
      key: migrationKey,
      reference,
      contentId: content._id,
      calendarId: calendar._id,
      outcome: 'converted',
      pending: migrationPending(converted, calendar.year),
      orphanKeys,
      sourceSchemaVersion,
      oldStateHash,
    });
  },
});

export const checkCalendars = migrations.define({
  table: 'calendars',
  // At most two near-limit contents are read per calendar while checking uniqueness.
  batchSize: 5,
  migrateOne: async (ctx, calendar) => {
    const reference = `calendar:${calendar._id}`;
    const contents = await ctx.db
      .query('calendarContents')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', calendar._id))
      .take(2);
    if (contents.length === 1) {
      await clearCalendarResult(ctx, reference);
      return;
    }
    if (contents.length === 0)
      await renameOfferKinds(ctx, calendar, calendar.modalities ?? calendar.offerKinds ?? []);
    await recordMigrationResult(ctx, {
      key: migrationKey,
      reference,
      calendarId: calendar._id,
      outcome: contents.length === 0 ? 'orphan-calendar' : 'failed',
      pending: false,
      orphanKeys: 0,
      ...(contents.length > 1 ? { error: 'Calendário com mais de um conteúdo.' } : {}),
    });
  },
});

export const finalizeV4 = migrations.define({
  table: 'migrationReports',
  batchSize: 1,
  customRange: (q) => q.withIndex('by_key', (index) => index.eq('key', migrationKey)),
  migrateOne: async (ctx, report) => {
    if (!report.purgeAuditId) throw new Error('Expurgo v4 sem recibo de auditoria.');
    if (report.failures === 0 && report.completedAt === undefined)
      await ctx.db.patch(report._id, { completedAt: Date.now() });
  },
});

// Migrações da próxima publicação, em ordem. O deploy de produção as inicia
// depois do backend e só promove o frontend quando todas terminam; as já
// concluídas são ignoradas. Esvazie a lista quando o schema for estreitado.
const conversion: MigrationFunctionReference[] = [
  internal.migrations.contentsToV4,
  internal.migrations.checkCalendars,
  internal.migrations.finalizeV4,
];
const pending: MigrationFunctionReference[] = [
  internal.migrations.purgeReviewVersions,
  internal.migrations.purgeReviews,
  internal.migrations.purgeCalendarVersions,
  internal.migrations.purgeCalendarSnapshots,
  internal.migrations.purgeAliases,
  internal.migrations.finalizePurge,
  ...conversion,
];

// Reset carries the entire tail. runOne(reset) followed by runSerially can lose it
// when the component sees the first conversion batch already in progress.
export const retryContents = migrations.runner(conversion);

export const start = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const report = await ensureMigrationReport(ctx);
    const statuses = await migrations.getStatus(ctx, { migrations: pending });
    if (statuses.some(({ state }) => state === 'inProgress')) return null;
    if (report.failures > 0) {
      await ctx.db.patch(report._id, { completedAt: undefined });
      const restarted: unknown = await ctx.runMutation(internal.migrations.retryContents, {
        reset: true,
      });
      void restarted;
    } else await migrations.runSerially(ctx, pending);
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
    const statuses = await migrations.getStatus(ctx, { migrations: pending });
    const report = await migrationReport(ctx);
    const result = statuses.map(({ name, state, processed, error }) => ({
      name,
      state,
      processed,
      error: error ?? null,
    }));
    if (report)
      result.push({
        name: 'migrations:offersV4Report',
        state:
          report.failures > 0
            ? 'failed'
            : report.completedAt === undefined
              ? 'inProgress'
              : 'success',
        processed: report.converted + report.alreadyV4 + report.orphanContents,
        error: report.failures > 0 ? `${report.failures} falha(s) de dados na migração v4.` : null,
      });
    return result;
  },
});
