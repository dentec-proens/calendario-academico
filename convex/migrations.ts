import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { getFunctionName } from 'convex/server';
import { v } from 'convex/values';
import { isEditable } from '../src/domain/calendar/lifecycle.ts';
import {
  dropRetiredActivityDates,
  retiredActivities,
} from '../src/domain/calendar/normalization/retired-activities.ts';
import { policyFor } from '../src/domain/policies/registry.ts';
import { components, internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import schema from './schema';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

/** CLI entry for one migration, including `dryRun` (docs/implantacao-convex-vercel.md, Comandos). */
export const run = migrations.runner();

/**
 * Level 2, `consup-292-2027-v13`: the editais of the Processo Seletivo 2028 are the Reitoria's, and
 * their deadline is a base date, so the campus no longer registers them. In calendars in editing,
 * dates linked to a retired activity are removed, with no new version. Submissions fixed their
 * content by hash and calendars out of editing are judged as sent: neither changes. Saving and a
 * new version of a published calendar remove the same dates, which covers tabs opened before the
 * migration and calendars back in editing. Leaves `pending` once concluded in production.
 */
export const dropRetiredActivityLinks = migrations.define({
  table: 'calendarContents',
  migrateOne: async (ctx, row) => {
    const calendar = await ctx.db.get('calendars', row.calendarId);
    if (!calendar || !isEditable(calendar.status)) return;
    const events = dropRetiredActivityDates(
      row.state.events,
      retiredActivities(policyFor(calendar.year)),
    );
    if (!events) return;
    return { state: { ...row.state, events } };
  },
});

const pending: MigrationFunctionReference[] = [internal.migrations.dropRetiredActivityLinks];

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
