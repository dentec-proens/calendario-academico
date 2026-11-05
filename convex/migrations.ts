import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { getFunctionName } from 'convex/server';
import { v } from 'convex/values';
import { isEditable } from '../src/domain/calendar/lifecycle.ts';
import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import schema from './schema';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

/** CLI entry for one migration, including `dryRun` (docs/implantacao-convex-vercel.md, Comandos). */
export const run = migrations.runner();

const holdsTargetDays = (row: Doc<'calendarContents'> | Doc<'calendarSubmissions'>) =>
  row.state.periods.some((period) => period.targetDays !== undefined);

/**
 * Level 1: no form ever wrote this value and only one draft period holds it. The stored `end`,
 * which is what the calendar shows and counts, stays. No new version: nothing a person sees changes.
 * A submission fixes its content by hash, so a copy holding the value stops the migration with
 * nothing written over it: that calendar is returned and saved first, which drops the value.
 * The contraction removes these migrations with `targetDays` from the period validator.
 */
export const refuseTargetDaysInSubmissions = migrations.define({
  table: 'calendarSubmissions',
  migrateOne: (_ctx, row) => {
    if (holdsTargetDays(row))
      throw new Error(`Envio ${row._id} guarda targetDays: devolva e salve o calendário antes.`);
  },
});

export const dropPeriodTargetDays = migrations.define({
  table: 'calendarContents',
  migrateOne: async (ctx, row) => {
    if (!holdsTargetDays(row)) return;
    const calendar = await ctx.db.get('calendars', row.calendarId);
    if (!calendar || !isEditable(calendar.status))
      throw new Error(`Calendário ${row.calendarId} guarda targetDays e não está em edição.`);
    return {
      state: {
        ...row.state,
        periods: row.state.periods.map(({ targetDays: _retired, ...period }) => period),
      },
    };
  },
});

const pending: MigrationFunctionReference[] = [
  internal.migrations.refuseTargetDaysInSubmissions,
  internal.migrations.dropPeriodTargetDays,
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
