import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { getFunctionName } from 'convex/server';
import { v } from 'convex/values';
import { isEditable } from '../src/domain/calendar/lifecycle.ts';
import { components, internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import schema from './schema';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

/** CLI entry for one migration, including `dryRun` (docs/implantacao-convex-vercel.md, Comandos). */
export const run = migrations.runner();

const optionalVacationDates = ['secondStart', 'secondEnd', 'thirdStart', 'thirdEnd'] as const;

/**
 * Level 1: the v4 editor stored a blank optional vacation period as `""`, which the domain already
 * reads as absent and the next save drops. No new version: nothing a person sees changes. Sending
 * copies the content as stored, so a blank left here would reach the submission and later read as a
 * false change between submissions. A content out of editing stays as it is: a submission fixed it
 * by hash, and a blank there is harmless. The stored `rulesetVersion` is not touched on purpose: it
 * is what tells the campus which rule changes it has not heard about (`announcedRuleChanges`).
 */
export const dropBlankVacationDates = migrations.define({
  table: 'calendarContents',
  migrateOne: async (ctx, row) => {
    const vacations = row.state.teacherVacations;
    if (!vacations || !optionalVacationDates.some((field) => vacations[field] === '')) return;
    const calendar = await ctx.db.get('calendars', row.calendarId);
    if (!calendar || !isEditable(calendar.status)) return;
    const kept = { ...vacations };
    for (const field of optionalVacationDates) if (kept[field] === '') delete kept[field];
    return { state: { ...row.state, teacherVacations: kept } };
  },
});

const pending: MigrationFunctionReference[] = [internal.migrations.dropBlankVacationDates];

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
